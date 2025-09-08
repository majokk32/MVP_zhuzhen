"""
Task management API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models import Task, TaskStatus, User, Submission, SubmissionStatus, CheckinType
from app.utils.task_status import calculate_display_status, get_task_priority
from app.services.async_learning_data import trigger_checkin_async
from app.schemas import (
    ResponseBase, TaskCreate, TaskUpdate, TaskInfo, 
    TaskListResponse, TaskCreateWithTags, TaskUpdateWithTags, TaskInfoWithTags
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
        
        # 使用新的状态计算工具
        display_status = calculate_display_status(task, submission)
        
        # 将状态信息添加到任务信息中
        task_data = task_info.dict()
        task_data.update({
            "display_right_status": display_status["right_status"],
            "display_left_status": display_status["left_status"],
            "display_card_style": display_status["card_style"],
            "sort_priority": get_task_priority(task, submission)
        })
        
        task_list.append(task_data)
    
    # 根据优先级和创建时间排序
    task_list.sort(key=lambda x: (x["sort_priority"], -x.get("created_at", 0) if isinstance(x.get("created_at"), (int, float)) else 0))
    
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
    
    # V1.0 学习数据统计：记录任务查看打卡
    try:
        await trigger_checkin_async(
            user_id=current_user.id,
            checkin_type=CheckinType.TASK_VIEW,
            db=db,
            related_task_id=task_id
        )
    except Exception as e:
        # 学习数据记录失败不应影响主业务流程
        print(f"任务查看打卡记录失败: {e}")
    
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
# 在现有tasks.py末尾添加增强版任务概况API
@router.get("/summary", response_model=ResponseBase) 
async def get_task_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get task summary for current user
    获取用户任务概况统计
    """
    from sqlalchemy import func
    
    # Get all tasks
    tasks_result = await db.execute(select(Task))
    all_tasks = tasks_result.scalars().all()
    
    # Get user submissions
    submissions_result = await db.execute(
        select(Submission).where(Submission.student_id == current_user.id)
    )
    submissions = submissions_result.scalars().all()
    
    # Create submission lookup
    submission_by_task = {s.task_id: s for s in submissions}
    
    # Calculate statistics
    stats = {
        "total_tasks": len(all_tasks),
        "submitted": 0,
        "graded": 0,
        "pending_submission": 0,
        "pending_grading": 0,
        "average_score": 0,
        "grade_distribution": {"待复盘": 0, "优秀": 0, "极佳": 0}
    }
    
    graded_scores = []
    
    for task in all_tasks:
        submission = submission_by_task.get(task.id)
        
        if not submission:
            stats["pending_submission"] += 1
        elif submission.status == SubmissionStatus.SUBMITTED:
            stats["submitted"] += 1
            stats["pending_grading"] += 1
        else:  # GRADED
            stats["graded"] += 1
            if submission.score:
                graded_scores.append(submission.score)
            if submission.grade:
                stats["grade_distribution"][submission.grade.value] = \
                    stats["grade_distribution"].get(submission.grade.value, 0) + 1
    
    # Calculate average score
    if graded_scores:
        stats["average_score"] = round(sum(graded_scores) / len(graded_scores), 1)
    
    return ResponseBase(
        data=stats,
        msg="获取任务统计成功"
    )

