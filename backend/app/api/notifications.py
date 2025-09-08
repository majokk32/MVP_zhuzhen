"""
通知相关API接口
处理各类消息通知
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, Task, Submission, NotificationSettings
from app.schemas import ResponseBase, NotificationSettingsResponse, NotificationSettingsUpdate
from app.auth import get_current_teacher, get_current_user
from app.utils.notification import notification_service
from app.services.scheduler import scheduler_service

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
                deadline=task.deadline,
                user_id=student.id
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


@router.post("/trigger-deadline-check", response_model=ResponseBase)
async def trigger_deadline_check(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    手动触发截止时间提醒检查（教师专用）
    """
    try:
        await scheduler_service.check_deadline_reminders(db)
        return ResponseBase(msg="截止时间提醒检查已触发")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"触发检查失败: {str(e)}"
        )


@router.post("/start-scheduler", response_model=ResponseBase)
async def start_scheduler(
    current_user: User = Depends(get_current_teacher)
):
    """
    启动定时任务调度器（教师专用）
    """
    if scheduler_service.is_running:
        return ResponseBase(msg="定时任务调度器已在运行中")
    
    # 在后台启动调度器
    import asyncio
    asyncio.create_task(scheduler_service.start())
    
    return ResponseBase(msg="定时任务调度器已启动")


@router.post("/stop-scheduler", response_model=ResponseBase) 
async def stop_scheduler(
    current_user: User = Depends(get_current_teacher)
):
    """
    停止定时任务调度器（教师专用）
    """
    await scheduler_service.stop()
    return ResponseBase(msg="定时任务调度器已停止")


@router.get("/settings", response_model=ResponseBase[NotificationSettingsResponse])
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户的通知设置
    """
    # 查找用户的通知设置
    result = await db.execute(
        select(NotificationSettings).where(NotificationSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()
    
    # 如果没有设置，创建默认设置
    if not settings:
        settings = NotificationSettings(
            user_id=current_user.id,
            grade_complete_enabled=True,
            deadline_reminder_enabled=True,
            new_task_enabled=True,
            streak_break_reminder=True,
            quiet_hours_start=22,
            quiet_hours_end=8
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    
    return ResponseBase(data=settings)


@router.put("/settings", response_model=ResponseBase[NotificationSettingsResponse])
async def update_notification_settings(
    settings_data: NotificationSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    更新用户的通知设置
    """
    # 查找现有设置
    result = await db.execute(
        select(NotificationSettings).where(NotificationSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()
    
    # 如果没有设置，先创建默认设置
    if not settings:
        settings = NotificationSettings(user_id=current_user.id)
        db.add(settings)
    
    # 更新设置
    update_data = settings_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)
    
    settings.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(settings)
    
    return ResponseBase(data=settings, msg="通知设置已更新")


@router.get("/settings/check", response_model=ResponseBase)
async def check_notification_allowed(
    notification_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    检查是否允许发送特定类型的通知
    
    Args:
        notification_type: 通知类型 (grade_complete, deadline_reminder, new_task, streak_break_reminder)
    """
    # 获取用户通知设置
    result = await db.execute(
        select(NotificationSettings).where(NotificationSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()
    
    # 默认设置：所有通知都开启
    if not settings:
        is_allowed = True
        reason = "用户未设置通知偏好，默认允许"
    else:
        # 检查对应类型的开关
        type_mapping = {
            "grade_complete": settings.grade_complete_enabled,
            "deadline_reminder": settings.deadline_reminder_enabled, 
            "new_task": settings.new_task_enabled,
            "streak_break_reminder": settings.streak_break_reminder
        }
        
        is_allowed = type_mapping.get(notification_type, True)
        
        if not is_allowed:
            reason = f"用户已关闭{notification_type}类型通知"
        else:
            # 检查免打扰时间
            now = datetime.now()
            current_hour = now.hour
            
            # 处理跨日的免打扰时间
            if settings.quiet_hours_start <= settings.quiet_hours_end:
                # 例如：22:00-08:00 (次日)
                in_quiet_hours = (settings.quiet_hours_start <= current_hour <= 23) or (0 <= current_hour <= settings.quiet_hours_end)
            else:
                # 例如：08:00-22:00 (同日)  
                in_quiet_hours = settings.quiet_hours_start <= current_hour <= settings.quiet_hours_end
                in_quiet_hours = not in_quiet_hours  # 取反，因为这是免打扰时间
            
            if in_quiet_hours:
                is_allowed = False
                reason = f"当前时间({current_hour}:00)在免打扰时间内"
            else:
                reason = "允许发送通知"
    
    return ResponseBase(
        data={
            "allowed": is_allowed,
            "reason": reason,
            "notification_type": notification_type,
            "current_time": datetime.now().isoformat()
        },
        msg=reason
    )