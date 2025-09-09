"""
Submission-related API endpoints
"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from typing import List, Optional

from app.database import get_db
from app.models import (
    User, Task, Submission, SubmissionStatus, 
    Grade, UserRole, CheckinType
)
from app.schemas import (
    ResponseBase, SubmissionCreate, SubmissionGrade, 
    SubmissionInfo, FileUploadResponse
)
from app.auth import get_current_user, get_current_teacher
from app.utils.storage import storage, StorageError
from app.config import settings
from app.services.async_learning_data import trigger_checkin_async, trigger_submission_score_async, trigger_grading_score_async
from app.utils.notification import notification_service

router = APIRouter(prefix="/submissions")


@router.post("/upload-image", response_model=ResponseBase)
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload a single image file
    """
    # Validate file type
    if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型: {file.content_type}"
        )
    
    # Validate file size
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"文件太大，最大允许 {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB"
        )
    
    try:
        # Upload to storage
        url = await storage.upload_image(
            contents, 
            file.filename,
            file.content_type
        )
        
        return ResponseBase(
            data=FileUploadResponse(
                url=url,
                filename=file.filename,
                size=len(contents)
            ).dict()
        )
    except StorageError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/submit", response_model=ResponseBase)
async def submit_homework(
    submission_data: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submit homework for a task
    """
    # Check if task exists
    task_result = await db.execute(select(Task).where(Task.id == submission_data.task_id))
    task = task_result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Check if task is still ongoing
    if task.status != "ongoing":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="任务已结束，无法提交"
        )
    
    # Check existing submission
    existing_result = await db.execute(
        select(Submission).where(
            and_(
                Submission.task_id == submission_data.task_id,
                Submission.student_id == current_user.id
            )
        )
    )
    existing = existing_result.scalar_one_or_none()
    
    if existing:
        # Check submission count
        if existing.submission_count >= 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="已达到最大提交次数（3次）"
            )
        
        # Update existing submission
        existing.images = submission_data.images
        existing.text = submission_data.text
        existing.submission_count += 1
        existing.status = SubmissionStatus.SUBMITTED
        existing.grade = None  # Reset grade
        existing.feedback = None
        existing.score = None
        existing.graded_by = None
        existing.graded_at = None
        
        await db.commit()
        submission_id = existing.id
        is_first_submission = False  # 这是重新提交
    else:
        # Create new submission
        new_submission = Submission(
            task_id=submission_data.task_id,
            student_id=current_user.id,
            images=submission_data.images,
            text=submission_data.text,
            submission_count=1,
            status=SubmissionStatus.SUBMITTED
        )
        
        db.add(new_submission)
        await db.commit()
        await db.refresh(new_submission)  # 获取生成的ID
        submission_id = new_submission.id
        is_first_submission = True  # 这是首次提交
    
    # V1.0 学习数据统计：触发打卡和积分记录
    try:
        # 1. 记录作业提交打卡
        await trigger_checkin_async(
            user_id=current_user.id,
            checkin_type=CheckinType.SUBMISSION,
            db=db,
            related_task_id=submission_data.task_id,
            related_submission_id=submission_id
        )
        
        # 2. 记录提交积分
        await trigger_submission_score_async(
            user_id=current_user.id,
            submission_id=submission_id,
            task_id=submission_data.task_id,
            db=db,
            is_first_submission=is_first_submission
        )
    except Exception as e:
        # 学习数据记录失败不应影响主业务流程
        print(f"学习数据记录失败: {e}")
    
    return ResponseBase(
        data={"submission_id": submission_id},
        msg="作业提交成功"
    )


@router.get("/my-submissions", response_model=ResponseBase)
async def get_my_submissions(
    task_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current user's submissions
    """
    query = select(Submission).where(Submission.student_id == current_user.id)
    
    if task_id:
        query = query.where(Submission.task_id == task_id)
    
    query = query.order_by(desc(Submission.created_at))
    
    result = await db.execute(query)
    submissions = result.scalars().all()
    
    # Convert to response format
    submission_list = []
    for sub in submissions:
        sub_info = SubmissionInfo.from_orm(sub)
        sub_info.images = sub.images if sub.images else []
        
        # Get task title
        task_result = await db.execute(select(Task).where(Task.id == sub.task_id))
        task = task_result.scalar_one_or_none()
        if task:
            sub_info.task_title = task.title
        
        submission_list.append(sub_info.dict())
    
    return ResponseBase(data=submission_list)


@router.get("/{submission_id}", response_model=ResponseBase)
async def get_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get submission details
    """
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="提交记录不存在"
        )
    
    # Check permission (student can only see own, teacher can see all)
    if current_user.role == UserRole.STUDENT and submission.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权查看此提交"
        )
    
    sub_info = SubmissionInfo.from_orm(submission)
    sub_info.images = submission.images if submission.images else []
    
    # Get related info
    student_result = await db.execute(select(User).where(User.id == submission.student_id))
    student = student_result.scalar_one_or_none()
    if student:
        sub_info.student_nickname = student.nickname
        sub_info.student_avatar = student.avatar
    
    task_result = await db.execute(select(Task).where(Task.id == submission.task_id))
    task = task_result.scalar_one_or_none()
    if task:
        sub_info.task_title = task.title
    
    return ResponseBase(data=sub_info.dict())


@router.post("/grade", response_model=ResponseBase)
async def grade_submission(
    grade_data: SubmissionGrade,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Grade a submission (teacher only)
    """
    # Get submission
    result = await db.execute(
        select(Submission).where(Submission.id == grade_data.submission_id)
    )
    submission = result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="提交记录不存在"
        )
    
    # Update grading info
    submission.score = grade_data.score
    submission.grade = Grade(grade_data.grade)
    submission.feedback = grade_data.feedback
    submission.graded_by = current_user.id
    submission.graded_at = datetime.utcnow()
    submission.status = SubmissionStatus.GRADED
    
    await db.commit()
    
    # V1.0 学习数据统计：触发质量积分更新
    try:
        await trigger_grading_score_async(
            user_id=submission.student_id,
            submission_id=submission.id,
            task_id=submission.task_id,
            grade=submission.grade,
            db=db
        )
    except Exception as e:
        # 学习数据记录失败不应影响主业务流程
        print(f"批改积分记录失败: {e}")
    
    # V1.0 微信通知：发送批改完成通知
    try:
        # 获取学生信息
        student_result = await db.execute(
            select(User).where(User.id == submission.student_id)
        )
        student = student_result.scalar_one_or_none()
        
        # 获取任务信息
        task_result = await db.execute(
            select(Task).where(Task.id == submission.task_id)
        )
        task = task_result.scalar_one_or_none()
        
        if student and task:
            # await notification_service.send_grade_notification(
            #     openid=student.openid,
            #     task_title=task.title,
            #     grade=submission.grade.value,
            #     comment=submission.feedback,
            #     user_id=student.id
            # )
            pass
    except Exception as e:
        # 通知发送失败不应影响主业务流程
        print(f"批改完成通知发送失败: {e}")
    
    return ResponseBase(msg="批改完成")


@router.get("/pending-grading", response_model=ResponseBase)
async def get_pending_submissions(
    task_id: Optional[int] = None,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Get submissions pending grading (teacher only)
    """
    query = select(Submission).where(Submission.status == SubmissionStatus.SUBMITTED)
    
    if task_id:
        query = query.where(Submission.task_id == task_id)
    
    query = query.order_by(Submission.created_at)
    
    result = await db.execute(query)
    submissions = result.scalars().all()
    
    # Convert to response format
    submission_list = []
    for sub in submissions:
        sub_info = SubmissionInfo.from_orm(sub)
        sub_info.images = sub.images if sub.images else []
        
        # Get student info
        student_result = await db.execute(select(User).where(User.id == sub.student_id))
        student = student_result.scalar_one_or_none()
        if student:
            sub_info.student_nickname = student.nickname
            sub_info.student_avatar = student.avatar
        
        # Get task info
        task_result = await db.execute(select(Task).where(Task.id == sub.task_id))
        task = task_result.scalar_one_or_none()
        if task:
            sub_info.task_title = task.title
        
        submission_list.append(sub_info.dict())
    
    return ResponseBase(data=submission_list)

# 增强版批改API，集成微信通知
from fastapi import BackgroundTasks
# from app.utils.notification import notification_service

@router.post("/grade-enhanced", response_model=ResponseBase)
async def grade_submission_enhanced(
    grade_data: SubmissionGrade,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Enhanced submission grading with WeChat notification
    """
    # Get submission
    result = await db.execute(
        select(Submission).where(Submission.id == grade_data.submission_id)
    )
    submission = result.scalar_one_or_none()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="提交记录不存在"
        )
    
    # Get task and student info
    task_result = await db.execute(select(Task).where(Task.id == submission.task_id))
    task = task_result.scalar_one_or_none()
    
    student_result = await db.execute(select(User).where(User.id == submission.student_id))
    student = student_result.scalar_one_or_none()
    
    if not task or not student:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="相关任务或学生信息不存在"
        )
    
    # Update submission
    submission.score = grade_data.score
    submission.grade = Grade(grade_data.grade)
    submission.comment = grade_data.feedback
    submission.status = SubmissionStatus.GRADED
    submission.graded_by = current_user.id
    submission.graded_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(submission)
    
    # V1.0 学习数据统计：触发质量积分更新
    try:
        await trigger_grading_score_async(
            user_id=submission.student_id,
            submission_id=submission.id,
            task_id=submission.task_id,
            grade=submission.grade,
            db=db
        )
    except Exception as e:
        # 学习数据记录失败不应影响主业务流程
        print(f"批改积分记录失败: {e}")
    
    # 异步发送微信通知
    # if student.openid:
    #     background_tasks.add_task(
    #         notification_service.send_grade_notification,
    #         openid=student.openid,
    #         task_title=task.title,
    #         grade=grade_data.grade,
    #         user_id=student.id
    #     )
    
    return ResponseBase(
        data={
            "submission_id": submission.id,
            "score": submission.score,
            "grade": submission.grade.value,
            "graded_at": submission.graded_at.isoformat(),
            "notification_sent": bool(student.openid)
        },
        msg="批改完成"
    )

