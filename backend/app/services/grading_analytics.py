"""
教师批改效率分析服务
提供批改统计、效率分析、学生成绩分布等功能
"""

from datetime import datetime, date, timedelta
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc, asc, case

from app.models import (
    User, Task, Submission, SubmissionStatus, Grade, UserRole,
    UserScoreRecord, ScoreType
)


class GradingAnalyticsService:
    """批改效率分析服务类"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ================================
    # 教师批改效率分析
    # ================================
    
    def get_teacher_grading_overview(self, teacher_id: int, days: int = 30) -> Dict:
        """
        获取教师批改效率总览
        包含关键指标和趋势分析
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # 基础批改统计
        base_stats = self._get_basic_grading_stats(teacher_id, start_date, end_date)
        
        # 效率分析
        efficiency_stats = self._analyze_grading_efficiency(teacher_id, start_date, end_date)
        
        # 质量分析
        quality_stats = self._analyze_grading_quality(teacher_id, start_date, end_date)
        
        # 时间分布分析
        time_distribution = self._analyze_grading_time_distribution(teacher_id, start_date, end_date)
        
        # 趋势分析（本周 vs 上周）
        trend_analysis = self._analyze_grading_trends(teacher_id)
        
        return {
            "teacher_id": teacher_id,
            "period_days": days,
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
            "basic_stats": base_stats,
            "efficiency_stats": efficiency_stats,
            "quality_stats": quality_stats,
            "time_distribution": time_distribution,
            "trend_analysis": trend_analysis,
            "generated_at": datetime.now().isoformat()
        }
    
    def _get_basic_grading_stats(self, teacher_id: int, start_date: datetime, end_date: datetime) -> Dict:
        """获取基础批改统计数据"""
        # 总批改数量
        total_graded = self.db.query(Submission).filter(
            and_(
                Submission.graded_by == teacher_id,
                Submission.graded_at >= start_date,
                Submission.graded_at <= end_date,
                Submission.status == SubmissionStatus.GRADED
            )
        ).count()
        
        # 待批改数量
        pending_count = self.db.query(Submission).join(
            Task, Submission.task_id == Task.id
        ).filter(
            and_(
                Task.created_by == teacher_id,
                Submission.status == SubmissionStatus.SUBMITTED
            )
        ).count()
        
        # 今日批改数量
        today = date.today()
        today_graded = self.db.query(Submission).filter(
            and_(
                Submission.graded_by == teacher_id,
                func.date(Submission.graded_at) == today,
                Submission.status == SubmissionStatus.GRADED
            )
        ).count()
        
        # 平均每日批改量
        if (end_date - start_date).days > 0:
            avg_daily = round(total_graded / (end_date - start_date).days, 1)
        else:
            avg_daily = total_graded
        
        return {
            "total_graded": total_graded,
            "pending_count": pending_count,
            "today_graded": today_graded,
            "avg_daily_graded": avg_daily
        }
    
    def _analyze_grading_efficiency(self, teacher_id: int, start_date: datetime, end_date: datetime) -> Dict:
        """分析批改效率"""
        graded_submissions = self.db.query(Submission).filter(
            and_(
                Submission.graded_by == teacher_id,
                Submission.graded_at >= start_date,
                Submission.graded_at <= end_date,
                Submission.status == SubmissionStatus.GRADED,
                Submission.created_at.isnot(None),
                Submission.graded_at.isnot(None)
            )
        ).all()
        
        if not graded_submissions:
            return {
                "avg_response_time_hours": 0,
                "fastest_response_hours": 0,
                "slowest_response_hours": 0,
                "efficiency_rating": "N/A"
            }
        
        # 计算响应时间（从提交到批改的时间）
        response_times = []
        for submission in graded_submissions:
            if submission.graded_at and submission.created_at:
                response_time = (submission.graded_at - submission.created_at).total_seconds() / 3600
                response_times.append(response_time)
        
        if response_times:
            avg_response_time = sum(response_times) / len(response_times)
            fastest_response = min(response_times)
            slowest_response = max(response_times)
            
            # 效率评级
            if avg_response_time <= 24:
                efficiency_rating = "优秀"  # 24小时内
            elif avg_response_time <= 48:
                efficiency_rating = "良好"  # 48小时内  
            elif avg_response_time <= 72:
                efficiency_rating = "一般"  # 72小时内
            else:
                efficiency_rating = "需改进"
            
            return {
                "avg_response_time_hours": round(avg_response_time, 2),
                "fastest_response_hours": round(fastest_response, 2),
                "slowest_response_hours": round(slowest_response, 2),
                "efficiency_rating": efficiency_rating
            }
        
        return {
            "avg_response_time_hours": 0,
            "fastest_response_hours": 0,
            "slowest_response_hours": 0,
            "efficiency_rating": "N/A"
        }
    
    def _analyze_grading_quality(self, teacher_id: int, start_date: datetime, end_date: datetime) -> Dict:
        """分析批改质量分布"""
        grade_distribution = self.db.query(
            Submission.grade,
            func.count(Submission.id).label('count')
        ).filter(
            and_(
                Submission.graded_by == teacher_id,
                Submission.graded_at >= start_date,
                Submission.graded_at <= end_date,
                Submission.status == SubmissionStatus.GRADED,
                Submission.grade.isnot(None)
            )
        ).group_by(Submission.grade).all()
        
        total_graded = sum(item.count for item in grade_distribution)
        
        distribution_dict = {}
        for grade, count in grade_distribution:
            percentage = round((count / total_graded * 100), 1) if total_graded > 0 else 0
            distribution_dict[grade.value if grade else "未评级"] = {
                "count": count,
                "percentage": percentage
            }
        
        # 质量指标
        excellent_rate = distribution_dict.get("极佳", {}).get("percentage", 0)
        good_rate = distribution_dict.get("优秀", {}).get("percentage", 0)
        pending_rate = distribution_dict.get("待复盘", {}).get("percentage", 0)
        
        return {
            "total_graded": total_graded,
            "grade_distribution": distribution_dict,
            "quality_metrics": {
                "excellent_rate": excellent_rate,
                "good_rate": good_rate,
                "pending_rate": pending_rate,
                "high_quality_rate": excellent_rate + good_rate
            }
        }
    
    def _analyze_grading_time_distribution(self, teacher_id: int, start_date: datetime, end_date: datetime) -> Dict:
        """分析批改时间分布"""
        graded_submissions = self.db.query(
            func.extract('hour', Submission.graded_at).label('hour'),
            func.count(Submission.id).label('count')
        ).filter(
            and_(
                Submission.graded_by == teacher_id,
                Submission.graded_at >= start_date,
                Submission.graded_at <= end_date,
                Submission.status == SubmissionStatus.GRADED
            )
        ).group_by(func.extract('hour', Submission.graded_at)).all()
        
        # 按小时分布
        hourly_distribution = {str(hour): 0 for hour in range(24)}
        for hour, count in graded_submissions:
            hourly_distribution[str(int(hour))] = count
        
        # 找出最活跃的时间段
        peak_hours = sorted(
            hourly_distribution.items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:3]
        
        # 时间段分类
        morning = sum(hourly_distribution[str(h)] for h in range(6, 12))    # 6-12点
        afternoon = sum(hourly_distribution[str(h)] for h in range(12, 18)) # 12-18点
        evening = sum(hourly_distribution[str(h)] for h in range(18, 24))   # 18-24点
        night = sum(hourly_distribution[str(h)] for h in range(0, 6))       # 0-6点
        
        return {
            "hourly_distribution": hourly_distribution,
            "peak_hours": [{"hour": hour, "count": count} for hour, count in peak_hours],
            "period_distribution": {
                "morning": morning,
                "afternoon": afternoon, 
                "evening": evening,
                "night": night
            }
        }
    
    def _analyze_grading_trends(self, teacher_id: int) -> Dict:
        """分析批改趋势（本周 vs 上周）"""
        today = datetime.now()
        
        # 本周数据
        this_week_start = today - timedelta(days=today.weekday())
        this_week_graded = self.db.query(Submission).filter(
            and_(
                Submission.graded_by == teacher_id,
                Submission.graded_at >= this_week_start,
                Submission.graded_at <= today,
                Submission.status == SubmissionStatus.GRADED
            )
        ).count()
        
        # 上周数据
        last_week_end = this_week_start - timedelta(seconds=1)
        last_week_start = last_week_end - timedelta(days=6)
        last_week_graded = self.db.query(Submission).filter(
            and_(
                Submission.graded_by == teacher_id,
                Submission.graded_at >= last_week_start,
                Submission.graded_at <= last_week_end,
                Submission.status == SubmissionStatus.GRADED
            )
        ).count()
        
        # 趋势计算
        if last_week_graded > 0:
            change_rate = round((this_week_graded - last_week_graded) / last_week_graded * 100, 1)
            if change_rate > 10:
                trend = "上升"
            elif change_rate < -10:
                trend = "下降"
            else:
                trend = "稳定"
        else:
            change_rate = 0
            trend = "新开始" if this_week_graded > 0 else "无数据"
        
        return {
            "this_week_graded": this_week_graded,
            "last_week_graded": last_week_graded,
            "change_rate": change_rate,
            "trend": trend
        }
    
    # ================================
    # 学生成绩分布分析
    # ================================
    
    def get_student_grade_distribution(self, teacher_id: Optional[int] = None, 
                                     task_id: Optional[int] = None,
                                     days: int = 30) -> Dict:
        """
        获取学生成绩分布分析
        可按教师或具体任务过滤
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # 构建查询条件
        query = self.db.query(Submission).filter(
            and_(
                Submission.status == SubmissionStatus.GRADED,
                Submission.graded_at >= start_date,
                Submission.graded_at <= end_date,
                Submission.grade.isnot(None)
            )
        )
        
        if teacher_id:
            query = query.filter(Submission.graded_by == teacher_id)
        
        if task_id:
            query = query.filter(Submission.task_id == task_id)
        
        submissions = query.all()
        
        if not submissions:
            return {
                "total_submissions": 0,
                "grade_distribution": {},
                "score_distribution": {},
                "insights": []
            }
        
        # 成绩等级分布
        grade_counts = {}
        score_ranges = {"0-20": 0, "21-30": 0, "31-40": 0}  # 假设满分40
        
        for submission in submissions:
            # 等级分布
            grade_key = submission.grade.value if submission.grade else "未评级"
            grade_counts[grade_key] = grade_counts.get(grade_key, 0) + 1
            
            # 分数分布
            if submission.score:
                if submission.score <= 20:
                    score_ranges["0-20"] += 1
                elif submission.score <= 30:
                    score_ranges["21-30"] += 1
                else:
                    score_ranges["31-40"] += 1
        
        total = len(submissions)
        
        # 转换为百分比
        grade_distribution = {}
        for grade, count in grade_counts.items():
            grade_distribution[grade] = {
                "count": count,
                "percentage": round(count / total * 100, 1)
            }
        
        score_distribution = {}
        for range_key, count in score_ranges.items():
            score_distribution[range_key] = {
                "count": count,
                "percentage": round(count / total * 100, 1)
            }
        
        # 生成洞察分析
        insights = self._generate_grade_insights(grade_distribution, score_distribution, total)
        
        return {
            "total_submissions": total,
            "period_days": days,
            "grade_distribution": grade_distribution,
            "score_distribution": score_distribution,
            "insights": insights,
            "generated_at": datetime.now().isoformat()
        }
    
    def _generate_grade_insights(self, grade_dist: Dict, score_dist: Dict, total: int) -> List[Dict]:
        """生成成绩分布洞察"""
        insights = []
        
        # 优秀率分析
        excellent_rate = grade_dist.get("极佳", {}).get("percentage", 0)
        good_rate = grade_dist.get("优秀", {}).get("percentage", 0)
        high_quality_rate = excellent_rate + good_rate
        
        if high_quality_rate > 70:
            insights.append({
                "type": "positive",
                "title": "学习质量优秀",
                "message": f"高质量作业比例达{high_quality_rate}%，学生整体表现出色！",
                "priority": "high"
            })
        elif high_quality_rate < 30:
            insights.append({
                "type": "attention",
                "title": "需要关注学习质量",
                "message": f"高质量作业比例仅{high_quality_rate}%，建议加强指导。",
                "priority": "high"
            })
        
        # 复盘率分析
        pending_rate = grade_dist.get("待复盘", {}).get("percentage", 0)
        if pending_rate > 20:
            insights.append({
                "type": "attention",
                "title": "复盘比例较高",
                "message": f"{pending_rate}%的作业需要复盘，可能需要调整教学重点。",
                "priority": "medium"
            })
        
        # 样本量分析
        if total < 10:
            insights.append({
                "type": "info",
                "title": "样本量较小",
                "message": f"当前分析基于{total}份作业，增加样本量可提高分析准确性。",
                "priority": "low"
            })
        
        return insights
    
    # ================================
    # 批改工作量预测
    # ================================
    
    def predict_grading_workload(self, teacher_id: int, days: int = 7) -> Dict:
        """预测未来几天的批改工作量"""
        # 基于历史数据预测
        historical_data = self._get_historical_submission_pattern(teacher_id, days * 2)
        
        # 当前待批改数量
        current_pending = self.db.query(Submission).join(
            Task, Submission.task_id == Task.id
        ).filter(
            and_(
                Task.created_by == teacher_id,
                Submission.status == SubmissionStatus.SUBMITTED
            )
        ).count()
        
        # 预测新增提交（基于历史模式）
        predicted_new = self._predict_new_submissions(teacher_id, days)
        
        return {
            "current_pending": current_pending,
            "predicted_new": predicted_new,
            "total_predicted": current_pending + predicted_new,
            "recommended_daily_target": max(1, (current_pending + predicted_new) // days),
            "historical_pattern": historical_data
        }
    
    def _get_historical_submission_pattern(self, teacher_id: int, days: int) -> List[Dict]:
        """获取历史提交模式"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        daily_submissions = self.db.query(
            func.date(Submission.created_at).label('date'),
            func.count(Submission.id).label('count')
        ).join(
            Task, Submission.task_id == Task.id
        ).filter(
            and_(
                Task.created_by == teacher_id,
                Submission.created_at >= start_date,
                Submission.created_at <= end_date
            )
        ).group_by(func.date(Submission.created_at)).all()
        
        return [
            {"date": item.date.isoformat(), "submissions": item.count}
            for item in daily_submissions
        ]
    
    def _predict_new_submissions(self, teacher_id: int, days: int) -> int:
        """预测新增提交数量（简化版）"""
        # 获取过去两周的平均日提交量
        two_weeks_ago = datetime.now() - timedelta(days=14)
        
        avg_daily = self.db.query(
            func.count(Submission.id) / 14.0
        ).join(
            Task, Submission.task_id == Task.id
        ).filter(
            and_(
                Task.created_by == teacher_id,
                Submission.created_at >= two_weeks_ago
            )
        ).scalar() or 0
        
        return int(avg_daily * days)


# ================================
# 便捷函数
# ================================

def get_grading_analytics_service(db: Session) -> GradingAnalyticsService:
    """获取批改分析服务实例"""
    return GradingAnalyticsService(db)