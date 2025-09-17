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
from app.utils.storage import storage, StorageError, enhanced_storage
from app.config import settings
from app.services.async_learning_data import trigger_checkin_async, trigger_submission_score_async, trigger_grading_score_async
from app.utils.notification import notification_service

router = APIRouter(prefix="/submissions")

# Test endpoint to manually trigger auto-merge
@router.post("/test-merge/{task_id}")
async def test_auto_merge(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test endpoint to manually trigger auto-merge for debugging"""
    await auto_merge_recent_uploads(task_id, current_user.id, db)
    return {"code": 0, "msg": "Auto-merge attempted", "data": None}

# Supported file types with their max sizes (in bytes)
SUPPORTED_FILE_TYPES = {
    # Images - 支持前端显示的所有格式
    'image/jpeg': 10 * 1024 * 1024,
    'image/png': 10 * 1024 * 1024,
    'image/gif': 10 * 1024 * 1024,
    'image/webp': 10 * 1024 * 1024,
    'image/bmp': 10 * 1024 * 1024,
    
    # Documents - 支持前端显示的所有文档格式
    'application/pdf': 10 * 1024 * 1024,
    'application/msword': 10 * 1024 * 1024,  # .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10 * 1024 * 1024,  # .docx
    'text/plain': 10 * 1024 * 1024,  # .txt
    'application/rtf': 10 * 1024 * 1024,  # .rtf
}


@router.post("/upload-image", response_model=ResponseBase)
async def upload_image(
    file: UploadFile = File(...),
    task_id: int = Form(None),
    text_content: str = Form(""),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a single image file
    """
    print(f"[DEBUG] Upload request received - filename: {file.filename}, content_type: {file.content_type}")
    print(f"[DEBUG] Current user: {current_user.id if current_user else 'None'}")
    print(f"[DEBUG] Allowed types: {settings.ALLOWED_IMAGE_TYPES}")
    
    # Validate file type
    if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
        print(f"[ERROR] Invalid content type: {file.content_type}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型: {file.content_type}"
        )
    
    # Validate file size
    contents = await file.read()
    print(f"[DEBUG] File size: {len(contents)} bytes, max allowed: {settings.MAX_UPLOAD_SIZE} bytes")
    
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        print(f"[ERROR] File too large: {len(contents)} > {settings.MAX_UPLOAD_SIZE}")
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
        
        # If task_id is provided, create a submission record
        if task_id:
            print(f"🚀 [DEBUG] Creating submission for task {task_id}")
            
            # Validate task exists
            task_result = await db.execute(select(Task).where(Task.id == task_id))
            task = task_result.scalar_one_or_none()
            
            if task:
                # Check submission count limit
                existing_submissions = await db.execute(
                    select(Submission).where(
                        and_(Submission.task_id == task_id, Submission.student_id == current_user.id)
                    )
                )
                current_count = len(existing_submissions.scalars().all())
                print(f"📊 [DEBUG] Current submission count: {current_count}/3")
                
                if current_count < 3:
                    # Create submission record
                    submission = Submission(
                        task_id=task_id,
                        student_id=current_user.id,
                        images=[url],
                        text=text_content.strip() if text_content.strip() else None,
                        submit_count=current_count + 1,
                        status=SubmissionStatus.SUBMITTED
                    )
                    
                    db.add(submission)
                    await db.commit()
                    await db.refresh(submission)
                    
                    print(f"🔍 [DEBUG] Submission created with ID: {submission.id}")
                    
                    # Auto-merge logic: temporarily disabled for debugging
                    # await auto_merge_recent_uploads(task_id, current_user.id, db)
                else:
                    print(f"❌ [DEBUG] Submission limit reached!")
        
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


@router.post("/upload-files", response_model=ResponseBase)
async def upload_multiple_files(
    task_id: int = Form(...),
    files: List[UploadFile] = File(...),
    text_content: str = Form(""),
    batch_id: str = Form(""),
    file_index: int = Form(0),
    total_files: int = Form(1),
    is_batch_upload: str = Form("false"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload multiple files (images, documents, text) for a submission
    支持图片、文件、文字上传，统一10MB限制
    """
    print(f"🚀 [DEBUG] Upload started - task_id: {task_id}, files: {len(files)}, text: '{text_content}', batch: {is_batch_upload}")
    
    # Validate task exists
    task_result = await db.execute(select(Task).where(Task.id == task_id))
    task = task_result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Handle batch upload logic (new method)
    if is_batch_upload.lower() == "true" and batch_id:
        return await handle_batch_upload(
            task_id, current_user.id, files, text_content, 
            batch_id, file_index, total_files, db
        )
    
    # Auto-merge will be called AFTER submission creation
    
    # Check submission count limit using database
    existing_submissions = await db.execute(
        select(Submission).where(
            and_(Submission.task_id == task_id, Submission.student_id == current_user.id)
        )
    )
    current_count = len(existing_submissions.scalars().all())
    print(f"📊 [DEBUG] Current submission count: {current_count}/3")
    if current_count >= 3:
        print(f"❌ [DEBUG] Submission limit reached!")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已达到最大提交次数（3次）"
        )
    
    # Prepare files data for upload
    files_data = []
    
    # Process uploaded files
    for file in files:
        # Validate file type
        if file.content_type not in SUPPORTED_FILE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的文件类型: {file.content_type}"
            )
        
        # Validate file size
        contents = await file.read()
        max_size = SUPPORTED_FILE_TYPES[file.content_type]
        
        if len(contents) > max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"文件 {file.filename} 超过大小限制 10MB"
            )
        
        files_data.append({
            'content': contents,
            'filename': file.filename,
            'content_type': file.content_type
        })
    
    try:
        # Handle file upload or text-only submission
        if files_data:
            # Upload files if any
            upload_result = await enhanced_storage.upload_files_to_submission(
                files_data, task_id, current_user.id
            )
            
            if not upload_result['success']:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"部分文件上传失败: {upload_result['failed_files']}"
                )
            
            file_urls = [file['url'] for file in upload_result['uploaded_files']]
            # Use database count for consistency (current_count + 1)
            submission_count = current_count + 1
        else:
            # Text-only submission
            if not text_content.strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="请至少上传文件或添加文字说明"
                )
            
            # Use same count calculation for text-only
            submission_count = current_count + 1
            file_urls = []
        
        # Create submission record in database
        submission = Submission(
            task_id=task_id,
            student_id=current_user.id,
            images=file_urls,  # Store file URLs (empty list if text-only)
            text=text_content.strip() if text_content.strip() else None,  # Store text description
            submit_count=submission_count,
            status=SubmissionStatus.SUBMITTED
        )
        
        db.add(submission)
        await db.commit()
        await db.refresh(submission)
        
        # Auto-merge logic: temporarily disabled for debugging
        # await auto_merge_recent_uploads(task_id, current_user.id, db)
        print(f"🔍 [DEBUG] Submission created with ID: {submission.id}")
        
        return ResponseBase(
            data={
                'submission_id': submission.id,
                'submission_count': submission_count,
                'uploaded_files': upload_result.get('uploaded_files', []) if files_data else [],
                'folder_path': upload_result.get('folder_path', '') if files_data else '',
                'submission_time': upload_result.get('submission_time', submission.created_at.isoformat()) if files_data else submission.created_at.isoformat(),
                'text_description': text_content.strip(),
                'remaining_attempts': 3 - submission_count
            },
            msg=f"作业提交成功！第 {submission_count} 次提交"
        )
        
    except StorageError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/submission-count/{task_id}", response_model=ResponseBase)
async def get_submission_count(
    task_id: int,
    current_user: User = Depends(get_current_user)
):
    """
    Get current submission count for a student's task
    获取学生某个任务的提交次数
    """
    try:
        count = await enhanced_storage.get_submission_count(task_id, current_user.id)
        
        return ResponseBase(
            data={
                'task_id': task_id,
                'submission_count': count,
                'remaining_attempts': 3 - count,
                'can_submit': count < 3
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取提交次数失败: {str(e)}"
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
        if existing.submit_count >= 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="已达到最大提交次数（3次）"
            )
        
        # Update existing submission
        existing.images = submission_data.images
        existing.text = submission_data.text
        existing.submit_count += 1
        existing.status = SubmissionStatus.SUBMITTED
        existing.grade = None  # Reset grade
        existing.comment = None
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
            submit_count=1,
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
    submission.comment = grade_data.feedback
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


# Batch upload handler to solve frontend multiple file upload limitation
import asyncio
from typing import Dict, Set

# Global storage for batch uploads
batch_storage: Dict[str, Dict] = {}

async def handle_batch_upload(
    task_id: int, 
    student_id: int, 
    files: List[UploadFile], 
    text_content: str,
    batch_id: str,
    file_index: int,
    total_files: int,
    db: AsyncSession
) -> ResponseBase:
    """
    Handle batch file uploads from frontend
    Collects multiple files with same batch_id and creates single submission when all files received
    """
    print(f"🔄 [BATCH] Processing batch upload - batch_id: {batch_id}, file_index: {file_index}/{total_files}")
    global batch_storage
    
    # Initialize batch if not exists
    if batch_id not in batch_storage:
        batch_storage[batch_id] = {
            'task_id': task_id,
            'student_id': student_id,
            'files_data': [],
            'text_content': text_content,
            'total_files': total_files,
            'received_files': 0,
            'created_at': datetime.utcnow()
        }
    
    batch_info = batch_storage[batch_id]
    
    # Process current file
    try:
        for file in files:
            # Validate file type
            if file.content_type not in SUPPORTED_FILE_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"不支持的文件类型: {file.content_type}"
                )
            
            # Validate file size
            contents = await file.read()
            max_size = SUPPORTED_FILE_TYPES[file.content_type]
            
            if len(contents) > max_size:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"文件 {file.filename} 超过大小限制 10MB"
                )
            
            batch_info['files_data'].append({
                'content': contents,
                'filename': file.filename,
                'content_type': file.content_type,
                'index': file_index
            })
        
        batch_info['received_files'] += len(files)
        
        # If all files received, create submission
        if batch_info['received_files'] >= batch_info['total_files']:
            return await create_batch_submission(batch_id, db)
        else:
            # Return temporary success for intermediate files
            return ResponseBase(
                data={
                    'batch_id': batch_id,
                    'received_files': batch_info['received_files'],
                    'total_files': batch_info['total_files'],
                    'status': 'partial'
                },
                msg=f"已接收 {batch_info['received_files']}/{batch_info['total_files']} 个文件"
            )
            
    except Exception as e:
        # Clean up batch on error
        if batch_id in batch_storage:
            del batch_storage[batch_id]
        raise e


async def create_batch_submission(batch_id: str, db: AsyncSession) -> ResponseBase:
    """
    Create final submission record when all batch files are received
    """
    global batch_storage
    
    if batch_id not in batch_storage:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="批次上传信息不存在"
        )
    
    batch_info = batch_storage[batch_id]
    
    try:
        # Upload files to storage
        upload_result = await enhanced_storage.upload_files_to_submission(
            batch_info['files_data'], batch_info['task_id'], batch_info['student_id']
        )
        
        if not upload_result['success']:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"部分文件上传失败: {upload_result['failed_files']}"
            )
        
        file_urls = [file['url'] for file in upload_result['uploaded_files']]
        
        # Check current submission count
        existing_submissions = await db.execute(
            select(Submission).where(
                and_(Submission.task_id == batch_info['task_id'], 
                     Submission.student_id == batch_info['student_id'])
            )
        )
        current_count = len(existing_submissions.scalars().all())
        submission_count = current_count + 1
        
        # Create submission record
        submission = Submission(
            task_id=batch_info['task_id'],
            student_id=batch_info['student_id'],
            images=file_urls,
            text=batch_info['text_content'].strip() if batch_info['text_content'].strip() else None,
            submit_count=submission_count,
            status=SubmissionStatus.SUBMITTED
        )
        
        db.add(submission)
        await db.commit()
        await db.refresh(submission)
        
        # Clean up batch storage
        del batch_storage[batch_id]
        
        return ResponseBase(
            data={
                'submission_id': submission.id,
                'submission_count': submission_count,
                'uploaded_files': upload_result['uploaded_files'],
                'folder_path': upload_result['folder_path'],
                'submission_time': upload_result['submission_time'],
                'text_description': batch_info['text_content'].strip(),
                'remaining_attempts': 3 - submission_count,
                'batch_complete': True
            },
            msg=f"批量上传完成！第 {submission_count} 次提交，共 {len(file_urls)} 个文件"
        )
        
    except Exception as e:
        # Clean up batch on error
        if batch_id in batch_storage:
            del batch_storage[batch_id]
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建提交记录失败: {str(e)}"
        )


async def auto_merge_recent_uploads(task_id: int, student_id: int, db: AsyncSession):
    """
    Auto-merge multiple submissions uploaded within 3 seconds into a single submission
    This solves the frontend limitation where each file creates a separate request
    """
    try:
        # Find submissions from the last 3 seconds for this task/student
        from datetime import timedelta
        cutoff_time = datetime.utcnow() - timedelta(seconds=3)
        
        recent_submissions = await db.execute(
            select(Submission).where(
                and_(
                    Submission.task_id == task_id,
                    Submission.student_id == student_id,
                    Submission.created_at > cutoff_time,
                    Submission.status == SubmissionStatus.SUBMITTED
                )
            ).order_by(Submission.created_at)
        )
        
        submissions_list = recent_submissions.scalars().all()
        
        # If we have multiple submissions within 3 seconds, merge them
        if len(submissions_list) > 1:
            print(f"🔄 [AUTO-MERGE] 发现 {len(submissions_list)} 个近期提交（3秒内），开始自动合并...")
            
            # Keep the first submission, merge others into it
            main_submission = submissions_list[0]
            merge_submissions = submissions_list[1:]
            
            # Collect all images and text from all submissions
            all_images = list(main_submission.images) if main_submission.images else []
            all_text_parts = []
            
            if main_submission.text and main_submission.text.strip():
                all_text_parts.append(main_submission.text.strip())
            
            # Merge data from other submissions
            for sub in merge_submissions:
                if sub.images:
                    all_images.extend(sub.images)
                if sub.text and sub.text.strip():
                    all_text_parts.append(sub.text.strip())
            
            # Update main submission with merged data
            main_submission.images = all_images
            main_submission.text = ' '.join(all_text_parts) if all_text_parts else None
            
            # Delete the duplicate submissions
            for sub in merge_submissions:
                await db.delete(sub)
            
            await db.commit()
            
            print(f"✅ [AUTO-MERGE] 成功合并到提交 ID {main_submission.id}，包含 {len(all_images)} 个文件")
            
    except Exception as e:
        print(f"❌ [AUTO-MERGE] 自动合并失败: {e}")
        # Don't raise the error, just log it - this is a background optimization

