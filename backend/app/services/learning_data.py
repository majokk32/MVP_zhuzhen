"""
学习数据统计核心服务
处理连续天数计算、积分计算、打卡判定等核心逻辑
"""

from datetime import datetime, date, timedelta
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc

from app.models import User, UserCheckin, UserScoreRecord, CheckinType, ScoreType, Submission, Grade
from app.database import get_db


class LearningDataService:
    """学习数据统计服务类"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ================================
    # 打卡相关逻辑
    # ================================
    
    def record_checkin(self, user_id: int, checkin_type: CheckinType, 
                      related_task_id: Optional[int] = None,
                      related_submission_id: Optional[int] = None) -> bool:
        """
        记录用户打卡行为
        每天只能记录一次有效打卡，重复操作不累计
        """
        today = date.today()
        
        # 检查今天是否已经打卡
        existing_checkin = self.db.query(UserCheckin).filter(
            and_(
                UserCheckin.user_id == user_id,
                UserCheckin.checkin_date == today
            )
        ).first()
        
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
        self._update_user_streak(user_id, today)
        
        # 如果是连续打卡，给予奖励积分
        self._check_streak_bonus(user_id)
        
        self.db.commit()
        return True
    
    def _update_user_streak(self, user_id: int, checkin_date: date):
        """
        更新用户连续打卡天数
        增强版：处理边界情况、中断恢复机制
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return
        
        # 防止未来日期打卡
        today = date.today()
        if checkin_date > today:
            checkin_date = today
        
        if user.last_checkin_date is None:
            # 首次打卡
            user.current_streak = 1
            user.best_streak = max(user.best_streak, 1)
        else:
            days_diff = (checkin_date - user.last_checkin_date).days
            
            if days_diff == 0:
                # 同一天重复打卡，不更新连续天数
                return
            elif days_diff == 1:
                # 连续打卡
                user.current_streak += 1
                user.best_streak = max(user.best_streak, user.current_streak)
            elif days_diff == 2:
                # 间隔一天（特殊情况：周末或节假日容错机制）
                # 检查是否为周末间隔
                last_weekday = user.last_checkin_date.weekday()  # 0=周一, 6=周日
                current_weekday = checkin_date.weekday()
                
                if (last_weekday == 4 and current_weekday == 0) or \  # 周五->周一
                   (last_weekday == 5 and current_weekday == 0):      # 周六->周一
                    # 周末间隔，继续连续
                    user.current_streak += 1
                    user.best_streak = max(user.best_streak, user.current_streak)
                else:
                    # 普通间隔，重置为1
                    user.current_streak = 1
            elif days_diff > 2:
                # 中断太久，重新开始
                user.current_streak = 1
            elif days_diff < 0:
                # 异常情况：日期回退，不更新
                return
        
        user.last_checkin_date = checkin_date
        self.db.add(user)
    
    def _check_streak_bonus(self, user_id: int):
        """
        检查连续打卡奖励
        增强版：分级奖励机制，更多激励节点
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return
        
        current_streak = user.current_streak
        
        # 分级奖励机制：连续天数越高，奖励越丰原
        bonus_config = {
            3: (2, "连续3天学习，初级坚持者🔥"),
            7: (5, "连续一周学习，中级坚持者🏆"),
            15: (15, "连续半月学习，高级坚持者🎆"),
            30: (50, "连续一月学习，学习之星⭐️"),
            60: (150, "连续两月学习，学习大师🎓"),
            100: (300, "连续百日学习，学习传说🏅")
        }
        
        if current_streak in bonus_config:
            bonus_points, description = bonus_config[current_streak]
            
            # 检查是否已经获得过该等级的奖励以防止重复领取
            today = date.today()
            existing_bonus = self.db.query(UserScoreRecord).filter(
                and_(
                    UserScoreRecord.user_id == user_id,
                    UserScoreRecord.score_type == ScoreType.STREAK_BONUS,
                    UserScoreRecord.score_value == bonus_points,
                    UserScoreRecord.record_date == today
                )
            ).first()
            
            if not existing_bonus:
                self.add_score_record(
                    user_id=user_id,
                    score_type=ScoreType.STREAK_BONUS,
                    score_value=bonus_points,
                    description=description
                )
                return bonus_points, description
        
        return None, None
    
    # ================================
    # 积分相关逻辑
    # ================================
    
    def add_score_record(self, user_id: int, score_type: ScoreType, 
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
        user = self.db.query(User).filter(User.id == user_id).first()
        if user:
            user.total_score += score_value
            user.monthly_score += score_value
            user.quarterly_score += score_value
            self.db.add(user)
        
        self.db.commit()
        return True
    
    def handle_submission_score(self, user_id: int, submission_id: int, 
                               task_id: int, grade: Optional[Grade] = None):
        """处理作业提交相关积分"""
        # 基础提交积分
        self.add_score_record(
            user_id=user_id,
            score_type=ScoreType.SUBMISSION,
            score_value=1,
            description="作业提交",
            related_task_id=task_id,
            related_submission_id=submission_id
        )
        
        # 更新提交次数
        user = self.db.query(User).filter(User.id == user_id).first()
        if user:
            user.total_submissions += 1
            self.db.add(user)
        
        # 如果有评分，给予质量积分
        if grade == Grade.GOOD:
            self.add_score_record(
                user_id=user_id,
                score_type=ScoreType.GOOD_GRADE,
                score_value=2,
                description="获得优秀评价",
                related_task_id=task_id,
                related_submission_id=submission_id
            )
        elif grade == Grade.EXCELLENT:
            self.add_score_record(
                user_id=user_id,
                score_type=ScoreType.EXCELLENT_GRADE,
                score_value=5,
                description="获得极佳评价",
                related_task_id=task_id,
                related_submission_id=submission_id
            )
        
        self.db.commit()
    
    # ================================
    # 数据查询逻辑
    # ================================
    
    def get_user_learning_data(self, user_id: int) -> Dict:
        """获取用户学习数据概览"""
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return {}
        
        # 本周打卡天数
        week_start = date.today() - timedelta(days=date.today().weekday())
        week_checkins = self.db.query(UserCheckin).filter(
            and_(
                UserCheckin.user_id == user_id,
                UserCheckin.checkin_date >= week_start,
                UserCheckin.checkin_date <= date.today()
            )
        ).count()
        
        return {
            "user_id": user_id,
            "current_streak": user.current_streak,
            "best_streak": user.best_streak,
            "total_score": user.total_score,
            "monthly_score": user.monthly_score,
            "quarterly_score": user.quarterly_score,
            "total_submissions": user.total_submissions,
            "week_checkins": week_checkins,
            "last_checkin_date": user.last_checkin_date.isoformat() if user.last_checkin_date else None
        }
    
    def get_14day_checkin_chart(self, user_id: int) -> List[Dict]:
        """
        获取14天打卡图数据
        返回格式：[{date: "2023-11-01", checked: true}, ...]
        """
        end_date = date.today()
        start_date = end_date - timedelta(days=13)  # 包含今天在内的14天
        
        # 获取这14天的打卡记录
        checkins = self.db.query(UserCheckin.checkin_date).filter(
            and_(
                UserCheckin.user_id == user_id,
                UserCheckin.checkin_date >= start_date,
                UserCheckin.checkin_date <= end_date
            )
        ).all()
        
        checkin_dates = set(checkin.checkin_date for checkin in checkins)
        
        # 生成14天的数据
        chart_data = []
        current_date = start_date
        
        while current_date <= end_date:
            chart_data.append({
                "date": current_date.isoformat(),
                "checked": current_date in checkin_dates,
                "weekday": current_date.weekday(),  # 0=周一, 6=周日
                "is_today": current_date == end_date
            })
            current_date += timedelta(days=1)
        
        return chart_data
    
    def get_monthly_leaderboard(self, year: int, month: int, limit: int = 100) -> List[Dict]:
        """获取月度积分排行榜"""
        leaderboard_query = self.db.query(
            User.id,
            User.nickname,
            User.avatar,
            func.sum(UserScoreRecord.score_value).label('total_score')
        ).join(
            UserScoreRecord, User.id == UserScoreRecord.user_id
        ).filter(
            and_(
                UserScoreRecord.year == year,
                UserScoreRecord.month == month
            )
        ).group_by(User.id).order_by(desc('total_score')).limit(limit)
        
        results = leaderboard_query.all()
        
        leaderboard = []
        for rank, result in enumerate(results, 1):
            leaderboard.append({
                "rank": rank,
                "user_id": result.id,
                "nickname": result.nickname,
                "avatar": result.avatar,
                "score": result.total_score,
                "is_current_user": False  # 前端需要自己判断
            })
        
        return leaderboard
    
    def get_quarterly_leaderboard(self, year: int, quarter: int, limit: int = 100) -> List[Dict]:
        """获取季度积分排行榜"""
        leaderboard_query = self.db.query(
            User.id,
            User.nickname,
            User.avatar,
            func.sum(UserScoreRecord.score_value).label('total_score')
        ).join(
            UserScoreRecord, User.id == UserScoreRecord.user_id
        ).filter(
            and_(
                UserScoreRecord.year == year,
                UserScoreRecord.quarter == quarter
            )
        ).group_by(User.id).order_by(desc('total_score')).limit(limit)
        
        results = leaderboard_query.all()
        
        leaderboard = []
        for rank, result in enumerate(results, 1):
            leaderboard.append({
                "rank": rank,
                "user_id": result.id,
                "nickname": result.nickname,
                "avatar": result.avatar,
                "score": result.total_score,
                "is_current_user": False  # 前端需要自己判断
            })
        
        return leaderboard
    
    def get_user_rank_in_leaderboard(self, user_id: int, year: int, month: int) -> Optional[int]:
        """获取用户在月度排行榜中的排名"""
        # 获取该用户的月度总积分
        user_score = self.db.query(func.sum(UserScoreRecord.score_value)).filter(
            and_(
                UserScoreRecord.user_id == user_id,
                UserScoreRecord.year == year,
                UserScoreRecord.month == month
            )
        ).scalar()
        
        if not user_score:
            return None
        
        # 计算排名（有多少人积分比该用户高）
        higher_scores_count = self.db.query(func.count(func.distinct(UserScoreRecord.user_id))).filter(
            and_(
                UserScoreRecord.year == year,
                UserScoreRecord.month == month,
                UserScoreRecord.user_id != user_id
            )
        ).having(func.sum(UserScoreRecord.score_value) > user_score).scalar()
        
        return (higher_scores_count or 0) + 1
    
    # ================================
    # 月度数据重置逻辑
    # ================================
    
    def reset_monthly_scores(self, year: int, month: int):
        """重置所有用户的月度积分（每月1日调用）"""
        users = self.db.query(User).all()
        for user in users:
            user.monthly_score = 0
            self.db.add(user)
        
        self.db.commit()
    
    def reset_quarterly_scores(self, year: int, quarter: int):
        """重置所有用户的季度积分（每季度第一天调用）"""
        users = self.db.query(User).all()
        for user in users:
            user.quarterly_score = 0
            self.db.add(user)
        
        self.db.commit()


# ================================
# 便捷函数
# ================================

def get_learning_service(db: Session) -> LearningDataService:
    """获取学习数据服务实例"""
    return LearningDataService(db)


def trigger_checkin(user_id: int, checkin_type: CheckinType, db: Session,
                   related_task_id: Optional[int] = None,
                   related_submission_id: Optional[int] = None) -> bool:
    """触发打卡的便捷函数"""
    service = get_learning_service(db)
    return service.record_checkin(
        user_id=user_id,
        checkin_type=checkin_type,
        related_task_id=related_task_id,
        related_submission_id=related_submission_id
    )