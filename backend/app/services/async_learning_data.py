"""
异步学习数据统计服务
与现有异步API集成，处理打卡和积分逻辑
"""

from datetime import datetime, date, timedelta
from typing import List, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, func, desc, select

from app.models import User, UserCheckin, UserScoreRecord, CheckinType, ScoreType, Submission, Grade


class AsyncLearningDataService:
    """异步学习数据统计服务类"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ================================
    # 打卡相关逻辑
    # ================================
    
    async def record_checkin(self, user_id: int, checkin_type: CheckinType, 
                            related_task_id: Optional[int] = None,
                            related_submission_id: Optional[int] = None) -> bool:
        """
        记录用户打卡行为
        每天只能记录一次有效打卡，重复操作不累计
        """
        today = date.today()
        
        # 检查今天是否已经打卡
        result = await self.db.execute(
            select(UserCheckin).where(
                and_(
                    UserCheckin.user_id == user_id,
                    UserCheckin.checkin_date == today
                )
            )
        )
        existing_checkin = result.scalar_one_or_none()
        
        if existing_checkin:
            # 今天已经打卡，不重复记录
            return False
        
        # 记录新的打卡
        new_checkin = UserCheckin(
            user_id=user_id,
            checkin_date=today,
            checkin_type=checkin_type,
            related_task_id=related_task_id,
            related_submission_id=related_submission_id
        )
        self.db.add(new_checkin)
        
        # 更新用户的连续天数和最后打卡日期
        await self._update_user_streak(user_id, today)
        
        # 每日打卡基础积分 +1分
        await self.add_score_record(
            user_id=user_id,
            score_type=ScoreType.DAILY_CHECKIN,
            score_value=1,
            description="每日打卡",
            related_task_id=related_task_id,
            related_submission_id=related_submission_id
        )
        
        # 如果是连续打卡，给予奖励积分
        await self._check_streak_bonus(user_id)
        
        await self.db.commit()
        return True
    
    async def _update_user_streak(self, user_id: int, checkin_date: date):
        """更新用户连续打卡天数"""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return
        
        if user.last_checkin_date is None:
            # 首次打卡
            user.current_streak = 1
            user.best_streak = max(user.best_streak, 1)
        else:
            days_diff = (checkin_date - user.last_checkin_date).days
            
            if days_diff == 1:
                # 连续打卡
                user.current_streak += 1
                user.best_streak = max(user.best_streak, user.current_streak)
            elif days_diff > 1:
                # 中断了，重新开始
                user.current_streak = 1
        
        user.last_checkin_date = checkin_date
        self.db.add(user)
    
    async def _check_streak_bonus(self, user_id: int):
        """检查连续打卡奖励"""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return
        
        # 根据连续天数给予奖励积分
        bonus_points = 0
        description = ""
        
        if user.current_streak == 3:
            bonus_points = 1
            description = "连续3天学习奖励"
        elif user.current_streak == 7:
            bonus_points = 3
            description = "连续7天学习奖励"
        elif user.current_streak == 15:
            bonus_points = 10
            description = "连续15天学习奖励"
        
        if bonus_points > 0:
            await self.add_score_record(
                user_id=user_id,
                score_type=ScoreType.STREAK_BONUS,
                score_value=bonus_points,
                description=description
            )
    
    # ================================
    # 积分相关逻辑
    # ================================
    
    async def add_score_record(self, user_id: int, score_type: ScoreType, 
                              score_value: int, description: str,
                              related_task_id: Optional[int] = None,
                              related_submission_id: Optional[int] = None) -> bool:
        """添加积分记录并更新用户总积分"""
        today = date.today()
        
        # 创建积分记录
        score_record = UserScoreRecord(
            user_id=user_id,
            score_type=score_type,
            score_value=score_value,
            description=description,
            record_date=today,
            year=today.year,
            month=today.month,
            quarter=(today.month - 1) // 3 + 1,
            related_task_id=related_task_id,
            related_submission_id=related_submission_id
        )
        self.db.add(score_record)
        
        # 更新用户积分
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.total_score += score_value
            user.monthly_score += score_value
            user.quarterly_score += score_value
            self.db.add(user)
        
        await self.db.commit()
        return True
    
    async def handle_submission_score(self, user_id: int, submission_id: int, 
                                     task_id: int, is_first_submission: bool = True):
        """处理作业提交相关积分"""
        # 基础提交积分
        await self.add_score_record(
            user_id=user_id,
            score_type=ScoreType.SUBMISSION,
            score_value=1,
            description="作业提交",
            related_task_id=task_id,
            related_submission_id=submission_id
        )
        
        # 更新提交次数（仅首次提交时更新）
        if is_first_submission:
            result = await self.db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                user.total_submissions += 1
                self.db.add(user)
                await self.db.commit()
    
    async def handle_grading_score(self, user_id: int, submission_id: int, 
                                  task_id: int, grade: Grade):
        """处理批改评分相关积分"""
        if grade == Grade.GOOD:
            await self.add_score_record(
                user_id=user_id,
                score_type=ScoreType.GOOD_GRADE,
                score_value=2,
                description="获得优秀评价",
                related_task_id=task_id,
                related_submission_id=submission_id
            )
        elif grade == Grade.EXCELLENT:
            await self.add_score_record(
                user_id=user_id,
                score_type=ScoreType.EXCELLENT_GRADE,
                score_value=5,
                description="获得极佳评价",
                related_task_id=task_id,
                related_submission_id=submission_id
            )


# ================================
# 便捷函数
# ================================

async def trigger_checkin_async(user_id: int, checkin_type: CheckinType, db: AsyncSession,
                               related_task_id: Optional[int] = None,
                               related_submission_id: Optional[int] = None) -> bool:
    """异步触发打卡的便捷函数"""
    service = AsyncLearningDataService(db)
    return await service.record_checkin(
        user_id=user_id,
        checkin_type=checkin_type,
        related_task_id=related_task_id,
        related_submission_id=related_submission_id
    )


async def trigger_submission_score_async(user_id: int, submission_id: int, task_id: int,
                                        db: AsyncSession, is_first_submission: bool = True):
    """异步触发提交积分的便捷函数"""
    service = AsyncLearningDataService(db)
    await service.handle_submission_score(
        user_id=user_id,
        submission_id=submission_id,
        task_id=task_id,
        is_first_submission=is_first_submission
    )


async def trigger_grading_score_async(user_id: int, submission_id: int, task_id: int,
                                     grade: Grade, db: AsyncSession):
    """异步触发批改积分的便捷函数"""
    service = AsyncLearningDataService(db)
    await service.handle_grading_score(
        user_id=user_id,
        submission_id=submission_id,
        task_id=task_id,
        grade=grade
    )