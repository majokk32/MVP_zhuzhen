"""
User-related API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.database import get_db
from app.models import User, UserRole
from app.schemas import ResponseBase, UserLogin, UserInfo, UserUpdateProfile
from app.auth import create_access_token, get_current_user
from app.utils.wechat import get_wechat_session, WeChatError

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
        
        # Create access token
        access_token = create_access_token(data={"sub": user.id})
        
        return ResponseBase(
            data={
                "token": access_token,
                "user": {
                    "id": user.id,
                    "nickname": user.nickname,
                    "avatar": user.avatar,
                    "role": user.role.value
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


@router.get("/profile", response_model=ResponseBase)
async def get_profile(
    current_user: User = Depends(get_current_user)
):
    """
    Get current user profile
    """
    user_info = UserInfo.from_orm(current_user)
    return ResponseBase(data=user_info.dict())


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
    Grant teacher role to a user (admin only)
    Note: In MVP, we might manually update database for teacher accounts
    """
    # For MVP, only allow if current user is already a teacher
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
    
    # Update role
    target_user.role = UserRole.TEACHER
    await db.commit()
    
    return ResponseBase(msg="Teacher role granted successfully")