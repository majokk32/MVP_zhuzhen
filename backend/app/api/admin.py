"""
Admin/Teacher management API endpoints
"""

import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models import User, Task, Submission, SubmissionStatus, UserRole
from app.schemas import ResponseBase, TaskProgress, StudentStats
from app.auth import get_current_teacher

router = APIRouter(prefix="/admin")


@router.get("/task-progress", response_model=ResponseBase)
async def get_task_progress(
    task_id: Optional[int] = None,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Get task submission progress (teacher only)
    """
    # Build query
    if task_id:
        task_result = await db.execute(select(Task).where(Task.id == task_id))
        tasks = [task_result.scalar_one_or_none()]
        if not tasks[0]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="任务不存在"
            )
    else:
        task_result = await db.execute(
            select(Task).order_by(desc(Task.created_at))
        )
        tasks = task_result.scalars().all()
    
    progress_list = []
    
    for task in tasks:
        # Get submission statistics
        sub_result = await db.execute(
            select(Submission).where(Submission.task_id == task.id)
        )
        submissions = sub_result.scalars().all()
        
        submitted_count = len(submissions)
        graded_count = len([s for s in submissions if s.status == SubmissionStatus.GRADED])
        pending_count = submitted_count - graded_count
        
        # Get total student count (for now, we'll use submitted as proxy)
        # In a real system, you might have a course enrollment table
        total_students = submitted_count  # This is a simplification
        
        progress = TaskProgress(
            task_id=task.id,
            task_title=task.title,
            total_students=total_students,
            submitted_count=submitted_count,
            graded_count=graded_count,
            pending_count=pending_count
        )
        
        progress_list.append(progress.dict())
    
    return ResponseBase(data=progress_list)


@router.get("/students", response_model=ResponseBase)
async def get_student_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Get list of all students with statistics (teacher only)
    """
    # Get all students
    offset = (page - 1) * page_size
    student_result = await db.execute(
        select(User)
        .where(User.role == UserRole.STUDENT)
        .offset(offset)
        .limit(page_size)
    )
    students = student_result.scalars().all()
    
    # Get total count
    count_result = await db.execute(
        select(func.count(User.id)).where(User.role == UserRole.STUDENT)
    )
    total = count_result.scalar()
    
    # Get statistics for each student
    student_stats_list = []
    
    for student in students:
        # Get submission stats
        sub_result = await db.execute(
            select(Submission).where(Submission.student_id == student.id)
        )
        submissions = sub_result.scalars().all()
        
        total_submissions = len(submissions)
        
        # Get unique tasks count
        unique_tasks = len(set(s.task_id for s in submissions))
        
        # Calculate average score
        graded_submissions = [s for s in submissions if s.score is not None]
        avg_score = None
        if graded_submissions:
            avg_score = sum(s.score for s in graded_submissions) / len(graded_submissions)
        
        # Get total tasks available (for completion rate)
        task_count_result = await db.execute(select(func.count(Task.id)))
        total_tasks = task_count_result.scalar()
        
        completion_rate = (unique_tasks / total_tasks * 100) if total_tasks > 0 else 0
        
        stats = StudentStats(
            student_id=student.id,
            nickname=student.nickname,
            avatar=student.avatar,
            total_submissions=total_submissions,
            total_tasks=unique_tasks,
            completion_rate=completion_rate,
            average_score=avg_score
        )
        
        student_stats_list.append(stats.dict())
    
    return ResponseBase(
        data={
            "students": student_stats_list,
            "total": total,
            "page": page,
            "page_size": page_size
        }
    )


@router.get("/student/{student_id}/submissions", response_model=ResponseBase)
async def get_student_submissions(
    student_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all submissions for a specific student (teacher only)
    """
    # Check if student exists
    student_result = await db.execute(select(User).where(User.id == student_id))
    student = student_result.scalar_one_or_none()
    
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="学生不存在"
        )
    
    # Get all submissions
    sub_result = await db.execute(
        select(Submission)
        .where(Submission.student_id == student_id)
        .order_by(desc(Submission.created_at))
    )
    submissions = sub_result.scalars().all()
    
    # Format response
    submission_list = []
    for sub in submissions:
        # Get task info
        task_result = await db.execute(select(Task).where(Task.id == sub.task_id))
        task = task_result.scalar_one_or_none()
        
        sub_data = {
            "id": sub.id,
            "task_id": sub.task_id,
            "task_title": task.title if task else "Unknown",
            "submit_count": sub.submit_count,
            "status": sub.status.value,
            "score": sub.score,
            "grade": sub.grade.value if sub.grade else None,
            "comment": sub.comment,
            "created_at": sub.created_at.isoformat(),
            "graded_at": sub.graded_at.isoformat() if sub.graded_at else None
        }
        submission_list.append(sub_data)
    
    return ResponseBase(
        data={
            "student": {
                "id": student.id,
                "nickname": student.nickname,
                "avatar": student.avatar
            },
            "submissions": submission_list
        }
    )


@router.post("/batch-download/{task_id}", response_model=ResponseBase)
async def request_batch_download(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Request batch download of submissions for a task (teacher only)
    Note: In MVP, this returns URLs directly. In production, use background task
    """
    # Check task exists
    task_result = await db.execute(select(Task).where(Task.id == task_id))
    task = task_result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Get all submissions for this task
    sub_result = await db.execute(
        select(Submission).where(Submission.task_id == task_id)
    )
    submissions = sub_result.scalars().all()
    
    # Collect all image URLs with student info
    download_list = []
    
    for sub in submissions:
        # Get student info
        student_result = await db.execute(select(User).where(User.id == sub.student_id))
        student = student_result.scalar_one_or_none()
        
        images = json.loads(sub.images) if sub.images else []
        
        for idx, img_url in enumerate(images):
            download_list.append({
                "url": img_url,
                "filename": f"{student.nickname if student else 'unknown'}_{task.title}_{idx+1}.jpg"
            })
    
    # In production, this would trigger a background task to zip files
    # For MVP, we return the list directly
    return ResponseBase(
        data={
            "download_list": download_list,
            "message": "请使用下载工具批量下载这些文件"
        }
    )