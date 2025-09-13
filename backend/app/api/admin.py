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
            subscription_type="trial",  # 暂时使用默认值
            total_submissions=total_submissions,
            total_tasks=unique_tasks,
            completion_rate=completion_rate,
            average_score=avg_score
        )
        
        student_stats_list.append(stats.dict())
    
    # 添加统计数据 - 暂时使用固定值
    paid_students = 0  # 暂时没有付费学员
    trial_students = total  # 所有学员都是试用学员
    
    return ResponseBase(
        data={
            "students": student_stats_list,
            "total": total,
            "page": page,
            "page_size": page_size,
            # 新增统计字段
            "total_students": total,
            "paid_students": paid_students,
            "trial_students": trial_students
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
            "submission_count": sub.submission_count,
            "status": sub.status.value,
            "score": sub.score,
            "grade": sub.grade.value if sub.grade else None,
            "feedback": sub.feedback,
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
        
        images = sub.images if sub.images else []
        
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


@router.get("/stats", response_model=ResponseBase)
async def get_admin_stats(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取管理员统计数据
    """
    try:
        # 统计所有任务总数（方案B：教师可以看到所有任务）
        total_tasks_result = await db.execute(
            select(func.count(Task.id))
        )
        total_tasks = total_tasks_result.scalar() or 0
        
        # 统计待批改的作业数（所有任务的提交）
        pending_grade_result = await db.execute(
            select(func.count(Submission.id))
            .where(Submission.status == SubmissionStatus.SUBMITTED)
        )
        pending_grade = pending_grade_result.scalar() or 0
        
        # 统计学生总数（所有学生用户）
        total_students_result = await db.execute(
            select(func.count(User.id))
            .where(User.role == UserRole.STUDENT)
        )
        total_students = total_students_result.scalar() or 0
        
        # 统计最近7天创建的任务数（所有任务）
        from datetime import datetime, timedelta
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_tasks_result = await db.execute(
            select(func.count(Task.id))
            .where(Task.created_at >= week_ago)
        )
        recent_tasks = recent_tasks_result.scalar() or 0
        
        # 统计活跃学生数（最近7天有提交作业的学生，所有任务）
        active_students_result = await db.execute(
            select(func.count(func.distinct(Submission.student_id)))
            .where(Submission.created_at >= week_ago)
        )
        active_students = active_students_result.scalar() or 0
        
        return ResponseBase(
            data={
                "total_tasks": total_tasks,
                "pending_grade": pending_grade,
                "total_students": total_students,
                "recent_tasks": recent_tasks,
                "active_students": active_students
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get admin stats: {str(e)}"
        )


@router.get("/grading/stats", response_model=ResponseBase)
async def get_grading_stats(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取批改统计数据
    """
    try:
        from datetime import datetime, timedelta
        today = datetime.utcnow().date()
        
        # 统计待批改作业数
        total_pending_result = await db.execute(
            select(func.count(Submission.id))
            .where(Submission.status == SubmissionStatus.SUBMITTED)
        )
        total_pending = total_pending_result.scalar() or 0
        
        # 统计今日已批改数量
        today_reviewed_result = await db.execute(
            select(func.count(Submission.id))
            .where(
                Submission.status == SubmissionStatus.GRADED,
                func.date(Submission.graded_at) == today
            )
        )
        today_reviewed = today_reviewed_result.scalar() or 0
        
        # 统计紧急任务数（临近截止时间的待批改作业）
        urgent_deadline = datetime.utcnow() + timedelta(days=1)
        urgent_count_result = await db.execute(
            select(func.count(Submission.id))
            .join(Task, Task.id == Submission.task_id)
            .where(
                Submission.status == SubmissionStatus.SUBMITTED,
                Task.deadline <= urgent_deadline
            )
        )
        urgent_count = urgent_count_result.scalar() or 0
        
        return ResponseBase(
            data={
                "total_pending": total_pending,
                "today_reviewed": today_reviewed,
                "urgent_count": urgent_count
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get grading stats: {str(e)}"
        )


@router.get("/grading/tasks", response_model=ResponseBase)
async def get_grading_tasks(
    filter: str = Query("all", description="筛选条件: all, pending, urgent"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=50, description="每页数量"),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取批改任务列表
    """
    try:
        # 构建基础查询：获取待批改的提交
        query = select(Submission).where(Submission.status == SubmissionStatus.SUBMITTED)
        
        # 根据筛选条件调整查询
        if filter == "urgent":
            from datetime import datetime, timedelta
            urgent_deadline = datetime.utcnow() + timedelta(days=1)
            query = query.join(Task, Task.id == Submission.task_id).where(
                Task.deadline <= urgent_deadline
            )
        
        # 排序：按创建时间倒序
        query = query.order_by(desc(Submission.created_at))
        
        # 分页
        offset = (page - 1) * page_size
        result = await db.execute(query.offset(offset).limit(page_size))
        submissions = result.scalars().all()
        
        # 检查是否还有更多数据
        has_more = len(submissions) == page_size
        
        # 格式化返回数据
        tasks = []
        for submission in submissions:
            # 获取任务信息
            task_result = await db.execute(select(Task).where(Task.id == submission.task_id))
            task = task_result.scalar_one_or_none()
            
            # 获取学生信息
            student_result = await db.execute(select(User).where(User.id == submission.student_id))
            student = student_result.scalar_one_or_none()
            
            if task and student:
                tasks.append({
                    "submission_id": submission.id,
                    "task_id": task.id,
                    "task_title": task.title,
                    "student_name": student.nickname,
                    "student_avatar": student.avatar,
                    "submission_count": submission.submission_count,
                    "images": submission.images or [],
                    "text": submission.text,
                    "created_at": submission.created_at.isoformat(),
                    "deadline": task.deadline.isoformat() if task.deadline else None,
                    "is_urgent": task.deadline and task.deadline <= datetime.utcnow() + timedelta(days=1) if task.deadline else False
                })
        
        return ResponseBase(
            data={
                "tasks": tasks,
                "has_more": has_more,
                "total": len(tasks)
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get grading tasks: {str(e)}"
        )