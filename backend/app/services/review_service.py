"""
复盘服务
处理复盘周期计算、复盘内容生成等核心逻辑
"""

import json
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func
from app.models import (
    User, Task, Submission, UserReview, ReviewSettings, 
    ReviewFrequency, ReviewStatus, Grade, UserScoreRecord,
    UserCheckin, CheckinType
)
from app.database import get_db
import logging

logger = logging.getLogger(__name__)


class ReviewService:
    """复盘服务类"""
    
    async def calculate_next_review_date(self, settings: ReviewSettings, db: AsyncSession) -> date:
        """
        根据复盘设置计算下次复盘日期
        
        Args:
            settings: 复盘设置对象
            db: 数据库会话
            
        Returns:
            下次复盘日期
        """
        today = date.today()
        
        if settings.frequency == ReviewFrequency.DAILY:
            next_date = today + timedelta(days=1)
        elif settings.frequency == ReviewFrequency.WEEKLY:
            next_date = today + timedelta(days=7)
        elif settings.frequency == ReviewFrequency.MONTHLY:
            # 下个月的同一天
            if today.month == 12:
                next_date = today.replace(year=today.year + 1, month=1)
            else:
                try:
                    next_date = today.replace(month=today.month + 1)
                except ValueError:
                    # 处理31号的情况（如1月31号到2月）
                    next_date = today.replace(month=today.month + 1, day=28)
        elif settings.frequency == ReviewFrequency.CUSTOM:
            days = settings.custom_days or 7
            next_date = today + timedelta(days=days)
        else:
            next_date = today + timedelta(days=7)  # 默认一周
        
        settings.next_review_date = next_date
        await db.commit()
        
        return next_date
    
    async def generate_review_for_user(self, user_id: int, db: AsyncSession) -> UserReview:
        """
        为用户生成复盘报告
        
        Args:
            user_id: 用户ID
            db: 数据库会话
            
        Returns:
            生成的复盘记录
        """
        # 获取复盘设置
        settings_result = await db.execute(
            select(ReviewSettings).where(ReviewSettings.user_id == user_id)
        )
        settings = settings_result.scalar_one_or_none()
        
        if not settings:
            raise ValueError("用户未设置复盘偏好")
        
        # 确定复盘周期
        period_end = date.today()
        if settings.frequency == ReviewFrequency.DAILY:
            period_start = period_end - timedelta(days=1)
        elif settings.frequency == ReviewFrequency.WEEKLY:
            period_start = period_end - timedelta(days=7)
        elif settings.frequency == ReviewFrequency.MONTHLY:
            period_start = period_end - timedelta(days=30)
        elif settings.frequency == ReviewFrequency.CUSTOM:
            days = settings.custom_days or 7
            period_start = period_end - timedelta(days=days)
        else:
            period_start = period_end - timedelta(days=7)
        
        # 生成复盘内容
        score_summary = None
        mistake_analysis = None
        progress_data = None
        ai_suggestions = None
        
        if settings.include_scores:
            score_summary = await self._generate_score_summary(user_id, period_start, period_end, db)
        
        if settings.include_mistakes:
            mistake_analysis = await self._generate_mistake_analysis(user_id, period_start, period_end, db)
        
        if settings.include_progress:
            progress_data = await self._generate_progress_data(user_id, period_start, period_end, db)
        
        if settings.include_suggestions:
            ai_suggestions = await self._generate_ai_suggestions(user_id, period_start, period_end, db)
        
        # 创建复盘记录
        review = UserReview(
            user_id=user_id,
            settings_id=settings.id,
            review_date=period_end,
            period_start=period_start,
            period_end=period_end,
            status=ReviewStatus.PENDING,
            score_summary=score_summary,
            mistake_analysis=mistake_analysis,
            progress_data=progress_data,
            ai_suggestions=ai_suggestions
        )
        
        db.add(review)
        await db.commit()
        await db.refresh(review)
        
        return review
    
    async def _generate_score_summary(
        self, 
        user_id: int, 
        start_date: date, 
        end_date: date, 
        db: AsyncSession
    ) -> Dict:
        """生成成绩汇总数据"""
        
        # 获取期间内的所有提交记录
        result = await db.execute(
            select(Submission).join(Task).where(
                and_(
                    Submission.student_id == user_id,
                    Submission.status == "graded",
                    func.date(Submission.graded_at).between(start_date, end_date)
                )
            )
        )
        submissions = result.scalars().all()
        
        if not submissions:
            return {
                "total_submissions": 0,
                "total_score": 0,
                "average_score": 0,
                "grade_distribution": {},
                "improvement_trend": "暂无数据"
            }
        
        # 计算统计数据
        total_score = sum(s.score for s in submissions if s.score)
        average_score = round(total_score / len(submissions), 1) if submissions else 0
        
        # 评价分布
        grade_counts = {}
        for submission in submissions:
            if submission.grade:
                grade = submission.grade.value
                grade_counts[grade] = grade_counts.get(grade, 0) + 1
        
        # 获取积分记录
        score_result = await db.execute(
            select(UserScoreRecord).where(
                and_(
                    UserScoreRecord.user_id == user_id,
                    UserScoreRecord.record_date.between(start_date, end_date)
                )
            ).order_by(UserScoreRecord.record_date)
        )
        score_records = score_result.scalars().all()
        
        total_points = sum(r.score_value for r in score_records)
        
        return {
            "period": f"{start_date} 至 {end_date}",
            "total_submissions": len(submissions),
            "total_score": total_score,
            "average_score": average_score,
            "total_points": total_points,
            "grade_distribution": grade_counts,
            "excellent_rate": round(grade_counts.get("极佳", 0) / len(submissions) * 100, 1),
            "good_rate": round(grade_counts.get("优秀", 0) / len(submissions) * 100, 1)
        }
    
    async def _generate_mistake_analysis(
        self, 
        user_id: int, 
        start_date: date, 
        end_date: date, 
        db: AsyncSession
    ) -> Dict:
        """生成错题分析数据"""
        
        # 获取需要复盘的提交记录（待复盘状态）
        result = await db.execute(
            select(Submission).join(Task).where(
                and_(
                    Submission.student_id == user_id,
                    Submission.grade == Grade.PENDING,
                    func.date(Submission.created_at).between(start_date, end_date)
                )
            )
        )
        pending_submissions = result.scalars().all()
        
        # 获取已批改但分数较低的提交
        result = await db.execute(
            select(Submission).join(Task).where(
                and_(
                    Submission.student_id == user_id,
                    Submission.status == "graded",
                    Submission.score < 30,  # 低于30分的作业
                    func.date(Submission.graded_at).between(start_date, end_date)
                )
            )
        )
        low_score_submissions = result.scalars().all()
        
        return {
            "pending_review_count": len(pending_submissions),
            "low_score_count": len(low_score_submissions),
            "pending_tasks": [
                {
                    "task_title": s.task.title if s.task else "未知任务",
                    "submit_date": s.created_at.strftime("%Y-%m-%d"),
                    "submission_id": s.id
                }
                for s in pending_submissions[:5]  # 最多显示5个
            ],
            "improvement_suggestions": [
                "建议对待复盘作业进行重新整理和分析",
                "重点关注分数较低的题目，找出知识薄弱点",
                "可以将错题整理成笔记，加强记忆"
            ] if (pending_submissions or low_score_submissions) else []
        }
    
    async def _generate_progress_data(
        self, 
        user_id: int, 
        start_date: date, 
        end_date: date, 
        db: AsyncSession
    ) -> Dict:
        """生成学习进度数据"""
        
        # 获取打卡记录
        checkin_result = await db.execute(
            select(UserCheckin).where(
                and_(
                    UserCheckin.user_id == user_id,
                    UserCheckin.checkin_date.between(start_date, end_date)
                )
            ).order_by(UserCheckin.checkin_date)
        )
        checkins = checkin_result.scalars().all()
        
        # 按日期分组统计打卡
        daily_checkins = {}
        for checkin in checkins:
            check_date = checkin.checkin_date.strftime("%Y-%m-%d")
            if check_date not in daily_checkins:
                daily_checkins[check_date] = []
            daily_checkins[check_date].append(checkin.checkin_type.value)
        
        # 统计各类型活动
        activity_stats = {}
        for checkin in checkins:
            activity_type = checkin.checkin_type.value
            activity_stats[activity_type] = activity_stats.get(activity_type, 0) + 1
        
        # 获取连续学习天数（从用户表）
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        
        return {
            "period": f"{start_date} 至 {end_date}",
            "active_days": len(daily_checkins),
            "total_period_days": (end_date - start_date).days + 1,
            "activity_rate": round(len(daily_checkins) / ((end_date - start_date).days + 1) * 100, 1),
            "current_streak": user.current_streak if user else 0,
            "best_streak": user.best_streak if user else 0,
            "activity_breakdown": activity_stats,
            "daily_activities": daily_checkins
        }
    
    async def _generate_ai_suggestions(
        self, 
        user_id: int, 
        start_date: date, 
        end_date: date, 
        db: AsyncSession
    ) -> str:
        """生成AI学习建议"""
        
        # 这里可以集成真实的AI服务，目前先提供基础建议
        
        # 获取用户基本数据
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        
        if not user:
            return "用户信息异常，无法生成建议"
        
        # 获取最近提交记录
        submission_result = await db.execute(
            select(Submission).join(Task).where(
                and_(
                    Submission.student_id == user_id,
                    func.date(Submission.created_at).between(start_date, end_date)
                )
            ).order_by(desc(Submission.created_at)).limit(5)
        )
        recent_submissions = submission_result.scalars().all()
        
        # 基于数据生成建议
        suggestions = []
        
        if user.current_streak >= 7:
            suggestions.append(f"🎉 太棒了！您已经连续学习{user.current_streak}天，请继续保持这个良好的学习习惯。")
        elif user.current_streak >= 3:
            suggestions.append(f"👍 您已连续学习{user.current_streak}天，再坚持几天就能突破一周大关！")
        else:
            suggestions.append("💪 建议建立稳定的学习节奏，每天坚持完成学习任务，养成良好的学习习惯。")
        
        # 根据最近提交情况给建议
        if len(recent_submissions) == 0:
            suggestions.append("📚 本周期内暂无作业提交记录，建议及时跟上学习进度，完成相关任务。")
        else:
            graded_submissions = [s for s in recent_submissions if s.grade and s.grade != Grade.PENDING]
            if graded_submissions:
                excellent_count = len([s for s in graded_submissions if s.grade == Grade.EXCELLENT])
                if excellent_count >= len(graded_submissions) * 0.7:
                    suggestions.append("🌟 您的作业质量很高，大部分都获得了极佳评价，请继续保持！")
                else:
                    suggestions.append("📖 建议在作业提交前多花时间检查和完善，争取获得更好的评价。")
        
        # 根据学习频率给建议
        if user.total_submissions > 0:
            avg_score = user.total_score / user.total_submissions if user.total_submissions else 0
            if avg_score < 2:
                suggestions.append("🎯 建议多参与课堂讨论和资料学习，提高学习的深度和广度。")
        
        return "\n\n".join(suggestions)
    
    async def check_and_create_scheduled_reviews(self, db: AsyncSession):
        """
        检查并创建定时复盘任务
        应该由定时任务调用
        """
        today = date.today()
        
        # 查找到期需要复盘的用户设置
        result = await db.execute(
            select(ReviewSettings).where(
                and_(
                    ReviewSettings.next_review_date <= today,
                    ReviewSettings.reminder_enabled == True
                )
            )
        )
        settings_list = result.scalars().all()
        
        created_count = 0
        for settings in settings_list:
            try:
                # 检查是否已存在未完成的复盘
                existing_result = await db.execute(
                    select(UserReview).where(
                        and_(
                            UserReview.user_id == settings.user_id,
                            UserReview.status == ReviewStatus.PENDING
                        )
                    )
                )
                
                if existing_result.scalar_one_or_none():
                    continue  # 已有未完成的复盘，跳过
                
                # 生成新的复盘任务
                await self.generate_review_for_user(settings.user_id, db)
                created_count += 1
                
                logger.info(f"为用户 {settings.user_id} 创建了定时复盘任务")
                
            except Exception as e:
                logger.error(f"为用户 {settings.user_id} 创建复盘任务失败: {e}")
        
        return created_count


# 全局复盘服务实例
review_service = ReviewService()