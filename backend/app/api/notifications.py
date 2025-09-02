"""
通知相关API接口
处理各类消息通知
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, Task, Submission
from app.schemas import ResponseBase
from app.auth import get_current_teacher
from app.utils.notification import notification_service

router = APIRouter(prefix="/notifications")


@router.post("/test-grade", response_model=ResponseBase)
async def test_grade_notification(
    submission_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    测试批改完成通知（教师专用）
    """
    # 获取提交记录
    sub_result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = sub_result.scalar_one_or_none()
    
    if not submission or not submission.grade:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到已批改的作业"
        )
    
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
        # 发送通知
        success = await notification_service.send_grade_notification(
            openid=student.openid,
            task_title=task.title,
            grade=submission.grade.value,
            comment=submission.comment
        )
        
        if success:
            return ResponseBase(msg="通知发送成功")
    
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="通知发送失败"
    )


@router.post("/test-deadline", response_model=ResponseBase)
async def test_deadline_notification(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    测试截止时间提醒（教师专用）
    """
    # 获取任务
    task_result = await db.execute(
        select(Task).where(Task.id == task_id)
    )
    task = task_result.scalar_one_or_none()
    
    if not task or not task.deadline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到有截止时间的任务"
        )
    
    # 获取所有学生（简化版，实际应该获取选课学生）
    students_result = await db.execute(
        select(User).where(User.role == "student")
    )
    students = students_result.scalars().all()
    
    success_count = 0
    for student in students:
        # 检查是否已提交
        sub_result = await db.execute(
            select(Submission).where(
                Submission.task_id == task_id,
                Submission.student_id == student.id
            )
        )
        if not sub_result.scalar_one_or_none():
            # 未提交，发送提醒
            success = await notification_service.send_deadline_reminder(
                openid=student.openid,
                task_title=task.title,
                deadline=task.deadline
            )
            if success:
                success_count += 1
    
    return ResponseBase(
        data={"notified_count": success_count},
        msg=f"已向{success_count}名学生发送提醒"
    )


@router.get("/schedule-check", response_model=ResponseBase)
async def check_deadline_tasks(
    db: AsyncSession = Depends(get_db)
):
    """
    检查需要发送截止提醒的任务
    应该由定时任务调用（每小时执行一次）
    """
    # 查找2小时后截止的任务
    two_hours_later = datetime.utcnow() + timedelta(hours=2)
    two_hours_ago = datetime.utcnow() + timedelta(hours=1, minutes=50)
    
    tasks_result = await db.execute(
        select(Task).where(
            Task.deadline.between(two_hours_ago, two_hours_later),
            Task.status == "ongoing"
        )
    )
    tasks_to_notify = tasks_result.scalars().all()
    
    tasks_info = []
    for task in tasks_to_notify:
        tasks_info.append({
            "id": task.id,
            "title": task.title,
            "deadline": task.deadline.isoformat()
        })
    
    return ResponseBase(
        data={
            "tasks_count": len(tasks_info),
            "tasks": tasks_info
        },
        msg=f"找到{len(tasks_info)}个需要发送提醒的任务"
    )