"""
Task management API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models import Task, TaskStatus, User, Submission, SubmissionStatus
from app.schemas import (
    ResponseBase, TaskCreate, TaskUpdate, TaskInfo, 
    TaskListResponse
)
from app.auth import get_current_user, get_current_teacher

router = APIRouter(prefix="/tasks")


@router.post("/", response_model=ResponseBase)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new task (teacher only)
    """
    # Create new task
    new_task = Task(
        title=task_data.title,
        course=task_data.course,
        desc=task_data.desc,
        total_score=task_data.total_score,
        deadline=task_data.deadline,
        created_by=current_user.id
    )
    
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    
    return ResponseBase(
        data={"id": new_task.id},
        msg="任务创建成功"
    )


@router.get("/", response_model=ResponseBase)
async def list_tasks(
    status: Optional[TaskStatus] = Query(None, description="任务状态筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all tasks with submission status for current user
    """
    # Build query
    query = select(Task).order_by(desc(Task.created_at))
    
    if status:
        query = query.where(Task.status == status)
    
    # Execute query with pagination
    offset = (page - 1) * page_size
    result = await db.execute(query.offset(offset).limit(page_size))
    tasks = result.scalars().all()
    
    # Get total count
    count_query = select(Task)
    if status:
        count_query = count_query.where(Task.status == status)
    count_result = await db.execute(count_query)
    total = len(count_result.scalars().all())
    
    # For each task, get submission status for current user
    task_list = []
    for task in tasks:
        task_info = TaskInfo.from_orm(task)
        
        # Get submission for this task by current user
        sub_result = await db.execute(
            select(Submission).where(
                and_(
                    Submission.task_id == task.id,
                    Submission.student_id == current_user.id
                )
            )
        )
        submission = sub_result.scalar_one_or_none()
        
        if submission:
            task_info.submission_status = submission.status.value
            task_info.submission_grade = submission.grade.value if submission.grade else None
            task_info.submission_score = submission.score
        else:
            task_info.submission_status = "未提交"
        
        task_list.append(task_info.dict())
    
    return ResponseBase(
        data={
            "tasks": task_list,
            "total": total,
            "page": page,
            "page_size": page_size
        }
    )


@router.get("/{task_id}", response_model=ResponseBase)
async def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get task details
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    task_info = TaskInfo.from_orm(task)
    
    # Get submission status for current user
    sub_result = await db.execute(
        select(Submission).where(
            and_(
                Submission.task_id == task_id,
                Submission.student_id == current_user.id
            )
        )
    )
    submission = sub_result.scalar_one_or_none()
    
    if submission:
        task_info.submission_status = submission.status.value
        task_info.submission_grade = submission.grade.value if submission.grade else None
        task_info.submission_score = submission.score
    else:
        task_info.submission_status = "未提交"
    
    return ResponseBase(data=task_info.dict())


@router.put("/{task_id}", response_model=ResponseBase)
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Update task (teacher only)
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Check ownership
    if task.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能修改自己创建的任务"
        )
    
    # Update fields
    update_data = task_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    
    await db.commit()
    await db.refresh(task)
    
    return ResponseBase(msg="任务更新成功")


@router.delete("/{task_id}", response_model=ResponseBase)
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete task (teacher only)
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Check ownership
    if task.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能删除自己创建的任务"
        )
    
    # Check if there are submissions
    sub_result = await db.execute(
        select(Submission).where(Submission.task_id == task_id)
    )
    if sub_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已有学生提交作业，无法删除任务"
        )
    
    await db.delete(task)
    await db.commit()
    
    return ResponseBase(msg="任务删除成功")


@router.post("/{task_id}/toggle-status", response_model=ResponseBase)
async def toggle_task_status(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Toggle task status between ongoing and ended (teacher only)
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Toggle status
    task.status = TaskStatus.ENDED if task.status == TaskStatus.ONGOING else TaskStatus.ONGOING
    await db.commit()
    
    return ResponseBase(
        data={"new_status": task.status.value},
        msg=f"任务状态已更新为: {task.status.value}"
    )


@router.post("/{task_id}/share", response_model=ResponseBase)
async def generate_share_link(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate share link for task (teacher only)
    生成任务分享链接，支持微信分享和深链接
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Generate share data
    share_data = {
        "path": f"/pages/task-detail/task-detail?id={task_id}&share=1",
        "title": task.title,
        "imageUrl": "/assets/images/share-default.png",  # 默认分享图
        "task_id": task_id,
        "share_code": f"TASK{task_id}",  # 分享码，用于统计
    }
    
    return ResponseBase(
        data=share_data,
        msg="分享链接生成成功"
    )