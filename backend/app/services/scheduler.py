"""
定时任务调度服务
处理课前提醒、连续打卡检查等定时任务
"""

import asyncio
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

from app.database import get_db
from app.models import Task, User, Submission, TaskStatus
from app.utils.notification import notification_service
from app.services.review_service import review_service
from app.services.ebbinghaus_service import ebbinghaus_service

logger = logging.getLogger(__name__)


class SchedulerService:
    """定时任务调度服务"""
    
    def __init__(self):
        self.is_running = False
    
    async def start(self):
        """启动定时任务调度"""
        if self.is_running:
            logger.warning("定时任务已在运行中")
            return
            
        self.is_running = True
        logger.info("定时任务调度器启动")
        
        while self.is_running:
            try:
                # 每小时执行一次检查
                await self.run_hourly_tasks()
                await asyncio.sleep(3600)  # 1小时
            except Exception as e:
                logger.error(f"定时任务执行异常: {e}")
                await asyncio.sleep(300)  # 出错时5分钟后重试
    
    async def stop(self):
        """停止定时任务调度"""
        self.is_running = False
        logger.info("定时任务调度器停止")
    
    async def run_hourly_tasks(self):
        """执行每小时任务"""
        logger.info("执行每小时定时任务")
        
        db_gen = get_db()
        db = await db_gen.__anext__()
        try:
            await self.check_deadline_reminders(db)
            
            # 每天凌晨0点（中国时间）生成艾宾浩斯复盘队列
            current_hour = datetime.now().hour
            if current_hour == 0:
                await self.generate_ebbinghaus_queue(db)
            
            # 每天早上8点检查复盘提醒
            if current_hour == 8:
                await self.check_review_reminders(db)
        finally:
            await db.close()
    
    async def check_deadline_reminders(self, db: AsyncSession):
        """
        检查需要发送截止提醒的任务
        在直播课开始前2小时发送提醒
        """
        try:
            # 查找2小时后开始的直播课任务
            two_hours_later = datetime.utcnow() + timedelta(hours=2)
            two_hours_range_start = two_hours_later - timedelta(minutes=30)  # 2小时前30分钟
            two_hours_range_end = two_hours_later + timedelta(minutes=30)  # 2小时后30分钟
            
            # 查询即将开始的直播课
            result = await db.execute(
                select(Task).where(
                    Task.deadline.between(two_hours_range_start, two_hours_range_end),
                    Task.status == TaskStatus.ONGOING,
                    Task.task_type == "live"  # 只有直播课需要课前提醒
                )
            )
            tasks_to_notify = result.scalars().all()
            
            logger.info(f"找到{len(tasks_to_notify)}个需要发送截止提醒的任务")
            
            for task in tasks_to_notify:
                await self.send_deadline_reminders_for_task(task, db)
                
        except Exception as e:
            logger.error(f"检查截止提醒任务失败: {e}")
    
    async def send_deadline_reminders_for_task(self, task: Task, db: AsyncSession):
        """
        为特定任务发送截止提醒
        
        Args:
            task: 任务对象
            db: 数据库会话
        """
        try:
            # 获取所有付费学生（试用用户不发送通知）
            students_result = await db.execute(
                select(User).where(
                    User.role == "student",
                    User.subscription_type.in_(["premium", "trial"])  # 包含试用和付费用户
                )
            )
            students = students_result.scalars().all()
            
            success_count = 0
            total_count = 0
            
            for student in students:
                # 检查学生是否已提交该任务的作业
                submission_result = await db.execute(
                    select(Submission).where(
                        Submission.task_id == task.id,
                        Submission.student_id == student.id
                    )
                )
                existing_submission = submission_result.scalar_one_or_none()
                
                # 如果未提交作业，发送提醒
                if not existing_submission:
                    total_count += 1
                    success = await notification_service.send_deadline_reminder(
                        openid=student.openid,
                        task_title=task.title,
                        deadline=task.deadline,
                        user_id=student.id
                    )
                    if success:
                        success_count += 1
            
            logger.info(f"任务 {task.title}: 向{total_count}名学生发送提醒，成功{success_count}条")
            
        except Exception as e:
            logger.error(f"发送任务截止提醒失败 {task.title}: {e}")
    
    async def check_review_reminders(self, db: AsyncSession):
        """
        检查并创建复盘提醒任务
        每天早上8点执行一次
        
        Args:
            db: 数据库会话
        """
        try:
            created_count = await review_service.check_and_create_scheduled_reviews(db)
            logger.info(f"复盘提醒检查完成，创建了{created_count}个新的复盘任务")
        except Exception as e:
            logger.error(f"检查复盘提醒任务失败: {e}")
    
    async def generate_ebbinghaus_queue(self, db: AsyncSession):
        """
        生成艾宾浩斯复盘队列
        每天凌晨0点（中国时间）执行
        
        Args:
            db: 数据库会话
        """
        try:
            logger.info("开始生成艾宾浩斯复盘队列")
            created_count = await ebbinghaus_service.generate_daily_review_queue(db)
            logger.info(f"艾宾浩斯复盘队列生成完成，创建了{created_count}个新的复盘任务")
        except Exception as e:
            logger.error(f"生成艾宾浩斯复盘队列失败: {e}")


# 全局调度器实例
scheduler_service = SchedulerService()


async def start_scheduler():
    """启动定时任务调度器"""
    await scheduler_service.start()


async def stop_scheduler():
    """停止定时任务调度器"""
    await scheduler_service.stop()