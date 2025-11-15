"""
艾宾浩斯复盘系统服务
基于遗忘曲线的任务复盘管理
"""

import asyncio
from datetime import datetime, date, timedelta
from typing import List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func
import pytz
import logging

from app.models import (
    User, Submission, Task, Grade,
    EbbinghausReviewRecord, EbbinghausMasteredTask, EbbinghausReviewStatus
)

logger = logging.getLogger(__name__)

# 艾宾浩斯遗忘曲线间隔（天）
EBBINGHAUS_INTERVALS = [1, 3, 7, 15, 30]


class EbbinghausReviewService:
    """艾宾浩斯复盘系统服务"""
    
    async def generate_daily_review_queue(self, db: AsyncSession) -> int:
        """
        生成今日复盘队列
        每天中国时间00:00执行
        
        Returns:
            int: 新创建的复盘任务数量
        """
        china_tz = pytz.timezone('Asia/Shanghai')
        today = datetime.now(china_tz).date()
        
        logger.info(f"开始生成{today}的艾宾浩斯复盘队列")
        
        # 获取所有用户
        users_query = select(User).where(User.role == "student", User.is_active == True)
        users_result = await db.execute(users_query)
        users = users_result.scalars().all()
        
        total_new_reviews = 0
        
        for user in users:
            try:
                new_reviews = await self._generate_user_daily_reviews(user, today, db)
                total_new_reviews += new_reviews
                logger.info(f"用户 {user.nickname} 生成了 {new_reviews} 个新复盘任务")
            except Exception as e:
                logger.error(f"为用户 {user.nickname} 生成复盘任务失败: {e}")
        
        await db.commit()
        logger.info(f"艾宾浩斯复盘队列生成完成，总计创建 {total_new_reviews} 个任务")
        
        return total_new_reviews
    
    async def _generate_user_daily_reviews(self, user: User, today: date, db: AsyncSession) -> int:
        """
        为单个用户生成今日复盘任务（改进版：支持补创建已过期的复盘任务）
        
        Args:
            user: 用户对象
            today: 今日日期
            db: 数据库会话
            
        Returns:
            int: 新创建的复盘任务数量
        """
        # 获取用户所有优秀/极佳的提交
        submissions_query = select(Submission).join(Task).where(
            and_(
                Submission.student_id == user.id,
                Submission.grade.in_([Grade.GOOD, Grade.EXCELLENT]),
                Submission.graded_at.isnot(None)
            )
        ).order_by(desc(Submission.graded_at))
        
        result = await db.execute(submissions_query)
        excellent_submissions = result.scalars().all()
        
        new_reviews_count = 0
        
        for submission in excellent_submissions:
            graded_date = submission.graded_at.date()
            
            # 检查是否已掌握该任务
            mastered_query = select(EbbinghausMasteredTask).where(
                and_(
                    EbbinghausMasteredTask.submission_id == submission.id,
                    EbbinghausMasteredTask.user_id == user.id
                )
            )
            mastered_result = await db.execute(mastered_query)
            is_mastered = mastered_result.scalar_one_or_none() is not None
            
            if is_mastered:
                continue  # 已掌握的任务跳过
            
            # 获取该提交的所有复盘记录（用于检查已完成和未完成的复盘）
            all_reviews_query = select(EbbinghausReviewRecord).where(
                and_(
                    EbbinghausReviewRecord.submission_id == submission.id,
                    EbbinghausReviewRecord.user_id == user.id
                )
            )
            all_reviews_result = await db.execute(all_reviews_query)
            existing_reviews = {r.review_count: r for r in all_reviews_result.scalars().all()}
            
            # 检查每个艾宾浩斯间隔（只创建前3次复盘：review_count 0, 1, 2）
            # 按顺序处理，确保前面的复盘先创建
            for review_count, interval_days in enumerate(EBBINGHAUS_INTERVALS[:3]):  # 只处理前3次
                scheduled_date = graded_date + timedelta(days=interval_days)
                
                # 如果到了复盘时间或已过期
                if scheduled_date <= today:
                    # 检查是否已有该复盘记录
                    existing_record = existing_reviews.get(review_count)
                    
                    if existing_record:
                        # 如果记录已存在，跳过（无论状态是PENDING还是COMPLETED）
                        continue
                    
                    # 对于已过期的任务，需要检查前面的复盘是否都存在
                    # 如果前面的复盘不存在，应该先创建前面的复盘任务
                    if scheduled_date < today:  # 已过期
                        # 检查前面的复盘是否都存在
                        for prev_review_count in range(review_count):
                            prev_record = existing_reviews.get(prev_review_count)
                            if not prev_record:
                                # 前面的复盘记录不存在，需要先创建前面的
                                prev_interval = EBBINGHAUS_INTERVALS[prev_review_count]
                                prev_scheduled_date = graded_date + timedelta(days=prev_interval)
                                
                                prev_record = EbbinghausReviewRecord(
                                    submission_id=submission.id,
                                    user_id=user.id,
                                    review_count=prev_review_count,
                                    scheduled_date=prev_scheduled_date,
                                    original_graded_date=graded_date,
                                    ebbinghaus_interval=prev_interval,
                                    status=EbbinghausReviewStatus.PENDING
                                )
                                
                                db.add(prev_record)
                                new_reviews_count += 1
                                existing_reviews[prev_review_count] = prev_record  # 更新缓存
                                
                                logger.info(
                                    f"补创建过期复盘任务: 用户{user.nickname}, "
                                    f"提交{submission.id}, 第{prev_review_count+1}次复盘, "
                                    f"计划日期{prev_scheduled_date} (已过期{(today - prev_scheduled_date).days}天)"
                                )
                    
                    # 再次检查是否已有该复盘记录（可能在补创建前面复盘时已创建）
                    if review_count not in existing_reviews:
                        # 创建新的复盘记录
                        new_record = EbbinghausReviewRecord(
                            submission_id=submission.id,
                            user_id=user.id,
                            review_count=review_count,
                            scheduled_date=scheduled_date,
                            original_graded_date=graded_date,
                            ebbinghaus_interval=interval_days,
                            status=EbbinghausReviewStatus.PENDING
                        )
                        
                        db.add(new_record)
                        new_reviews_count += 1
                        existing_reviews[review_count] = new_record  # 更新缓存
                        
                        status_text = "今天" if scheduled_date == today else f"已过期{(today - scheduled_date).days}天"
                        logger.info(
                            f"创建复盘任务: 用户{user.nickname}, "
                            f"提交{submission.id}, 第{review_count+1}次复盘, "
                            f"计划日期{scheduled_date} ({status_text})"
                        )
        
        return new_reviews_count
    
    async def get_today_reviews_for_user(self, user_id: int, db: AsyncSession) -> List[dict]:
        """
        获取用户今日需要复盘的任务列表
        
        Args:
            user_id: 用户ID
            db: 数据库会话
            
        Returns:
            List[dict]: 今日复盘任务列表
        """
        today = date.today()
        
        # 查询今日待复盘的任务
        query = select(EbbinghausReviewRecord).join(Submission).join(Task).where(
            and_(
                EbbinghausReviewRecord.user_id == user_id,
                EbbinghausReviewRecord.scheduled_date <= today,  # 包含过期的任务
                EbbinghausReviewRecord.status == EbbinghausReviewStatus.PENDING
            )
        ).order_by(EbbinghausReviewRecord.scheduled_date)
        
        result = await db.execute(query)
        review_records = result.scalars().all()
        
        formatted_tasks = []
        for record in review_records:
            # 获取提交和任务信息
            submission_query = select(Submission).where(Submission.id == record.submission_id)
            submission_result = await db.execute(submission_query)
            submission = submission_result.scalar_one_or_none()
            
            if submission:
                task_query = select(Task).where(Task.id == submission.task_id)
                task_result = await db.execute(task_query)
                task = task_result.scalar_one_or_none()
                
                if task:
                    # 判断是否过期
                    is_overdue = record.scheduled_date < today
                    
                    formatted_tasks.append({
                        "id": record.submission_id,
                        "submission_id": record.submission_id,
                        "task_id": submission.task_id,
                        "title": task.title,
                        "subject": task.course,
                        "review_count": record.review_count,
                        "status": "overdue" if is_overdue else "pending",
                        "scheduled_date": record.scheduled_date.isoformat(),
                        "original_date": record.original_graded_date.isoformat(),
                        "ebbinghaus_day": record.ebbinghaus_interval,
                        "grade": submission.grade,
                        "days_overdue": (today - record.scheduled_date).days if is_overdue else 0
                    })
        
        return formatted_tasks
    
    async def complete_review(
        self, 
        user_id: int, 
        submission_id: int, 
        db: AsyncSession
    ) -> Tuple[bool, str]:
        """
        完成复盘任务
        
        Args:
            user_id: 用户ID
            submission_id: 提交ID
            db: 数据库会话
            
        Returns:
            Tuple[bool, str]: (是否成功, 消息)
        """
        try:
            # 查找当前的复盘记录
            query = select(EbbinghausReviewRecord).where(
                and_(
                    EbbinghausReviewRecord.submission_id == submission_id,
                    EbbinghausReviewRecord.user_id == user_id,
                    EbbinghausReviewRecord.status == EbbinghausReviewStatus.PENDING
                )
            ).order_by(desc(EbbinghausReviewRecord.review_count))
            
            result = await db.execute(query)
            current_record = result.scalars().first()
            
            if not current_record:
                return False, "未找到待复盘的记录"
            
            # 更新当前记录状态
            current_record.status = EbbinghausReviewStatus.COMPLETED
            current_record.completed_at = datetime.utcnow()
            
            new_review_count = current_record.review_count + 1
            is_mastered = new_review_count >= 5
            
            if is_mastered:
                # 标记为已掌握
                current_record.is_mastered = True
                current_record.mastered_at = datetime.utcnow()
                
                # 创建掌握记录
                await self._create_mastered_task_record(submission_id, user_id, db)
                message = "🎉 恭喜！你已完全掌握这个任务！"
                
            else:
                # 创建下次复盘记录
                next_interval = EBBINGHAUS_INTERVALS[new_review_count]
                next_review_date = current_record.original_graded_date + timedelta(days=next_interval)
                
                next_record = EbbinghausReviewRecord(
                    submission_id=submission_id,
                    user_id=user_id,
                    review_count=new_review_count,
                    scheduled_date=next_review_date,
                    original_graded_date=current_record.original_graded_date,
                    ebbinghaus_interval=next_interval,
                    status=EbbinghausReviewStatus.PENDING
                )
                
                db.add(next_record)
                current_record.next_review_date = next_review_date
                message = f"复盘完成！下次复盘时间：{next_review_date}"
            
            await db.commit()
            return True, message
            
        except Exception as e:
            await db.rollback()
            logger.error(f"完成复盘失败: {e}")
            return False, f"操作失败: {str(e)}"
    
    async def _create_mastered_task_record(
        self, 
        submission_id: int, 
        user_id: int, 
        db: AsyncSession
    ):
        """创建已掌握任务记录"""
        # 检查是否已存在
        existing_query = select(EbbinghausMasteredTask).where(
            and_(
                EbbinghausMasteredTask.submission_id == submission_id,
                EbbinghausMasteredTask.user_id == user_id
            )
        )
        existing_result = await db.execute(existing_query)
        if existing_result.scalar_one_or_none():
            return  # 已存在，不重复创建
        
        # 获取提交和任务信息
        submission_query = select(Submission).where(Submission.id == submission_id)
        submission_result = await db.execute(submission_query)
        submission = submission_result.scalar_one()
        
        task_query = select(Task).where(Task.id == submission.task_id)
        task_result = await db.execute(task_query)
        task = task_result.scalar_one()
        
        # 计算掌握用时
        original_graded_date = submission.graded_at.date()
        mastered_date = date.today()
        total_days = (mastered_date - original_graded_date).days
        
        # 创建掌握记录
        mastered_record = EbbinghausMasteredTask(
            submission_id=submission_id,
            user_id=user_id,
            task_id=submission.task_id,
            task_title=task.title,
            task_subject=task.course,
            original_grade=submission.grade,
            original_score=submission.score,
            total_reviews_completed=5,
            original_graded_date=original_graded_date,
            mastered_date=mastered_date,
            total_days_to_master=total_days
        )
        
        db.add(mastered_record)
        logger.info(f"用户 {user_id} 掌握了任务: {task.title}")
    
    async def get_user_mastered_stats(self, user_id: int, db: AsyncSession) -> dict:
        """
        获取用户掌握统计信息
        
        Args:
            user_id: 用户ID
            db: 数据库会话
            
        Returns:
            dict: 掌握统计信息
        """
        # 已掌握任务总数
        mastered_query = select(func.count(EbbinghausMasteredTask.id)).where(
            EbbinghausMasteredTask.user_id == user_id
        )
        mastered_result = await db.execute(mastered_query)
        mastered_count = mastered_result.scalar() or 0
        
        # 待复盘任务总数
        pending_query = select(func.count(EbbinghausReviewRecord.id)).where(
            and_(
                EbbinghausReviewRecord.user_id == user_id,
                EbbinghausReviewRecord.status == EbbinghausReviewStatus.PENDING
            )
        )
        pending_result = await db.execute(pending_query)
        pending_count = pending_result.scalar() or 0
        
        # 今日待复盘任务数
        today = date.today()
        today_query = select(func.count(EbbinghausReviewRecord.id)).where(
            and_(
                EbbinghausReviewRecord.user_id == user_id,
                EbbinghausReviewRecord.scheduled_date <= today,
                EbbinghausReviewRecord.status == EbbinghausReviewStatus.PENDING
            )
        )
        today_result = await db.execute(today_query)
        today_count = today_result.scalar() or 0
        
        return {
            "mastered_tasks": mastered_count,
            "pending_reviews": pending_count,
            "today_reviews": today_count,
            "mastery_rate": round(mastered_count / max(1, mastered_count + pending_count) * 100, 1)
        }


# 全局服务实例
ebbinghaus_service = EbbinghausReviewService()