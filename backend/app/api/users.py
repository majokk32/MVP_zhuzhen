"""
User-related API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.database import get_db
from app.models import User, UserRole, SubscriptionType
from app.schemas import ResponseBase, UserLogin, UserInfo, UserUpdateProfile
from app.auth import create_access_token, get_current_user
from app.utils.wechat import get_wechat_session, WeChatError
from app.services.async_subscription import init_trial_user_async, get_subscription_display_async

router = APIRouter(prefix="/users")


@router.post("/login", response_model=ResponseBase)
async def login(
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    WeChat mini program login
    """
    try:
        # Get WeChat session
        wx_session = await get_wechat_session(login_data.code)
        openid = wx_session["openid"]
        unionid = wx_session.get("unionid")
        
        # Check if user exists
        result = await db.execute(select(User).where(User.openid == openid))
        user = result.scalar_one_or_none()
        
        if not user:
            # Create new user with default student role
            user = User(
                openid=openid,
                unionid=unionid,
                nickname=f"用户{openid[-6:]}",  # Default nickname
                role=UserRole.STUDENT
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            
            # Initialize trial subscription for new users
            user = await init_trial_user_async(user, db)
        
        # Create access token (sub must be string)
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return ResponseBase(
            data={
                "token": access_token,
                "user": {
                    "id": user.id,
                    "nickname": user.nickname,
                    "avatar": user.avatar,
                    "role": user.role.value,
                    "subscription_type": user.subscription_type.value if user.subscription_type else None,
                    "subscription_expires_at": user.subscription_expires_at.isoformat() if user.subscription_expires_at else None
                }
            }
        )
        
    except WeChatError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"WeChat login failed: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login error: {str(e)}"
        )


@router.post("/phone-login", response_model=ResponseBase)
async def phone_login(
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    Phone number login (using WeChat code for now, can be extended for actual phone auth)
    For MVP, this redirects to the same WeChat login flow
    """
    # For now, use the same WeChat login logic
    # In future versions, this could handle actual phone number authentication
    return await login(login_data, db)


@router.get("/profile", response_model=ResponseBase)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current user profile with subscription status (students only)
    """
    user_info = UserInfo.from_orm(current_user)
    user_data = user_info.dict()
    
    # Add subscription information only for students
    if current_user.role == UserRole.STUDENT:
        subscription_display = await get_subscription_display_async(current_user, db)
        user_data["subscription_status"] = subscription_display
    else:
        # Teachers don't need subscription info
        user_data["subscription_status"] = None
    
    return ResponseBase(data=user_data)


@router.put("/profile", response_model=ResponseBase)
async def update_profile(
    profile_data: UserUpdateProfile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update user profile (nickname, avatar)
    """
    # Update fields if provided
    if profile_data.nickname is not None:
        current_user.nickname = profile_data.nickname
    if profile_data.avatar is not None:
        current_user.avatar = profile_data.avatar
    
    await db.commit()
    await db.refresh(current_user)
    
    user_info = UserInfo.from_orm(current_user)
    return ResponseBase(data=user_info.dict())


@router.post("/grant-teacher", response_model=ResponseBase)
async def grant_teacher_role(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Grant teacher role to a user (teacher only)
    Note: In MVP, we might manually update database for teacher accounts
    """
    # Only allow if current user is already a teacher
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can grant teacher role"
        )
    
    # Get target user
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update role and subscription
    target_user.role = UserRole.TEACHER
    target_user.subscription_type = SubscriptionType.PREMIUM
    target_user.subscription_expires_at = None  # Teachers have permanent premium
    target_user.is_active = True
    await db.commit()
    
    return ResponseBase(msg="Teacher role granted successfully")



@router.get("/stats", response_model=ResponseBase)
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current user statistics
    """
    from sqlalchemy import func
    from app.models import Task, Submission
    
    try:
        # 获取用户提交统计
        submission_stats = await db.execute(
            select(
                func.count(Submission.id).label('total_submissions'),
                func.count(
                    func.case(
                        (Submission.status == 'graded', 1),
                        else_=None
                    )
                ).label('graded_submissions')
            ).where(Submission.student_id == current_user.id)
        )
        stats_result = submission_stats.fetchone()
        
        # 如果是老师，获取老师相关统计
        if current_user.role.value == 'teacher':
            # 获取创建的任务数
            task_count = await db.execute(
                select(func.count(Task.id))
                .where(Task.created_by == current_user.id)
            )
            total_tasks = task_count.scalar()
            
            # 获取待批改数量
            pending_count = await db.execute(
                select(func.count(Submission.id))
                .join(Task, Task.id == Submission.task_id)
                .where(
                    Task.created_by == current_user.id,
                    Submission.status == 'submitted'
                )
            )
            pending_grading = pending_count.scalar()
            
            return ResponseBase(
                data={
                    "user_role": "teacher",
                    "total_tasks": total_tasks or 0,
                    "total_submissions": stats_result.total_submissions or 0,
                    "graded_submissions": stats_result.graded_submissions or 0,
                    "pending_grading": pending_grading or 0
                }
            )
        else:
            # 学生统计
            return ResponseBase(
                data={
                    "user_role": "student", 
                    "total_submissions": stats_result.total_submissions or 0,
                    "graded_submissions": stats_result.graded_submissions or 0,
                    "completion_rate": round(
                        (stats_result.graded_submissions or 0) / max(stats_result.total_submissions or 1, 1) * 100
                    ) if stats_result.total_submissions else 0
                }
            )
    
    except Exception as e:
        # 如果查询失败，返回默认值
        return ResponseBase(
            data={
                "user_role": current_user.role.value,
                "total_submissions": 0,
                "graded_submissions": 0,
                "completion_rate": 0
            }
        )