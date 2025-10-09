"""
学习数据相关API接口
提供个人学习数据、打卡图表、排行榜等功能
"""

from datetime import datetime, date
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.auth import get_current_user
from app.models import User, CheckinType
from app.services.learning_data import get_learning_service, get_learning_insights
from app.schemas import BaseResponse


router = APIRouter(prefix="/learning", tags=["学习数据"])


# ================================
# 请求/响应模型
# ================================

class CheckinRequest(BaseModel):
    """打卡请求"""
    checkin_type: CheckinType
    related_task_id: Optional[int] = None
    related_submission_id: Optional[int] = None


class LearningDataResponse(BaseModel):
    """个人学习数据响应"""
    user_id: int
    current_streak: int          # 当前连续天数
    best_streak: int            # 历史最佳天数
    total_score: int            # 累计积分
    monthly_score: int          # 月度积分
    quarterly_score: int        # 季度积分
    total_submissions: int      # 累计提交次数
    week_checkins: int          # 本周打卡次数
    last_checkin_date: Optional[str]  # 最后打卡日期


class CheckinChartItem(BaseModel):
    """打卡图表项"""
    date: str                   # 日期
    checked: bool              # 是否打卡
    weekday: int               # 星期几 (0=周一)
    is_today: bool             # 是否今天
    submission_count: int      # 当日提交次数
    intensity_level: int       # 强度等级 (0-3)



# ================================
# API接口
# ================================

@router.post("/checkin")
async def record_checkin(
    request: CheckinRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    记录用户打卡行为
    每日只能记录一次有效打卡
    """
    try:
        service = get_learning_service(db)
        success = service.record_checkin(
            user_id=current_user.id,
            checkin_type=request.checkin_type,
            related_task_id=request.related_task_id,
            related_submission_id=request.related_submission_id
        )
        
        if success:
            return BaseResponse(code=0, msg="打卡成功", data={"checked_in": True})
        else:
            return BaseResponse(code=0, msg="今日已打卡", data={"checked_in": False})
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打卡失败: {str(e)}")


@router.get("/overview")
async def get_learning_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[LearningDataResponse]:
    """
    获取个人学习数据概览
    包含连续天数、积分、提交次数等核心数据
    """
    try:
        # Get real data for current user
        from app.models import Submission, SubmissionStatus
        from sqlalchemy import select, func, and_
        from datetime import datetime, timedelta, timezone
        
        # 1. Get total submission count
        submission_count_result = await db.execute(
            select(func.count(Submission.id)).where(
                Submission.student_id == current_user.id
            )
        )
        total_submissions = submission_count_result.scalar() or 0
        
        # 2. Calculate total score from user score records (积分系统)
        from app.models import UserScoreRecord
        score_result = await db.execute(
            select(func.sum(UserScoreRecord.score_value)).where(
                UserScoreRecord.user_id == current_user.id
            )
        )
        total_score = int(score_result.scalar() or 0)
        
        # 3. Calculate monthly score (last 30 days) from user score records
        thirty_days_ago = datetime.now() - timedelta(days=30)
        monthly_score_result = await db.execute(
            select(func.sum(UserScoreRecord.score_value)).where(
                and_(
                    UserScoreRecord.user_id == current_user.id,
                    UserScoreRecord.record_date >= thirty_days_ago.date()
                )
            )
        )
        monthly_score = int(monthly_score_result.scalar() or 0)
        
        # 4. Calculate quarterly score (last 90 days) from user score records
        ninety_days_ago = datetime.now() - timedelta(days=90)
        quarterly_score_result = await db.execute(
            select(func.sum(UserScoreRecord.score_value)).where(
                and_(
                    UserScoreRecord.user_id == current_user.id,
                    UserScoreRecord.record_date >= ninety_days_ago.date()
                )
            )
        )
        quarterly_score = int(quarterly_score_result.scalar() or 0)
        
        # 5. Calculate this week's checkins from real checkin records
        from app.models import UserCheckin
        from datetime import date as date_class
        today = date_class.today()
        week_start = today - timedelta(days=today.weekday())
        week_checkins_result = await db.execute(
            select(func.count(UserCheckin.id)).where(
                and_(
                    UserCheckin.user_id == current_user.id,
                    UserCheckin.checkin_date >= week_start
                )
            )
        )
        week_checkins = int(week_checkins_result.scalar() or 0)
        
        # 6. Get streak data from user table (real streak data)
        user_result = await db.execute(
            select(User.current_streak, User.best_streak).where(User.id == current_user.id)
        )
        user_streak_data = user_result.first()
        current_streak = user_streak_data.current_streak if user_streak_data else 0
        best_streak = user_streak_data.best_streak if user_streak_data else 0
        
        # 7. Get last submission date as last checkin date
        last_submission_result = await db.execute(
            select(func.max(Submission.created_at)).where(
                Submission.student_id == current_user.id
            )
        )
        last_submission = last_submission_result.scalar()
        last_checkin_date = last_submission.strftime("%Y-%m-%d") if last_submission else None
        
        data = {
            "user_id": current_user.id,
            "current_streak": current_streak,
            "best_streak": best_streak,
            "total_score": total_score,
            "monthly_score": monthly_score,
            "quarterly_score": quarterly_score,
            "total_submissions": total_submissions,
            "week_checkins": week_checkins,
            "last_checkin_date": last_checkin_date or datetime.now().strftime("%Y-%m-%d")
        }
        
        return BaseResponse(
            code=0, 
            msg="获取成功", 
            data=LearningDataResponse(**data)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取学习数据失败: {str(e)}")


@router.get("/checkin-chart")
async def get_checkin_chart(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[List[CheckinChartItem]]:
    """
    获取14天打卡图数据
    返回包含今天在内的过去14天打卡状态
    """
    try:
        # Get real checkin data based on submission dates
        from datetime import date, timedelta
        from app.models import Submission
        from sqlalchemy import select, func, and_
        
        chart_data = []
        today = date.today()
        
        # Get submission counts by date for last 14 days
        fourteen_days_ago = today - timedelta(days=13)
        submission_counts_result = await db.execute(
            select(
                func.date(Submission.created_at).label('submission_date'),
                func.count(Submission.id).label('count')
            ).where(
                and_(
                    Submission.student_id == current_user.id,
                    func.date(Submission.created_at) >= fourteen_days_ago
                )
            ).group_by(func.date(Submission.created_at))
        )
        submission_counts = {row.submission_date: row.count for row in submission_counts_result.fetchall()}
        
        # Generate 14 days of real data with submission counts
        for i in range(14):
            current_date = today - timedelta(days=13-i)
            submission_count = submission_counts.get(current_date, 0)
            
            # Calculate intensity level based on submission count
            if submission_count == 0:
                intensity_level = 0
            elif submission_count == 1:
                intensity_level = 1
            elif submission_count == 2:
                intensity_level = 2
            else:  # 3 or more submissions
                intensity_level = 3
            
            chart_data.append({
                "date": current_date.isoformat(),
                "checked": submission_count > 0,
                "weekday": current_date.weekday(),
                "is_today": current_date == today,
                "submission_count": submission_count,
                "intensity_level": intensity_level
            })
        
        chart_items = [CheckinChartItem(**item) for item in chart_data]
        
        return BaseResponse(
            code=0, 
            msg="获取成功", 
            data=chart_items
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取打卡图表失败: {str(e)}")


@router.get("/submission-heatmap")
async def get_submission_heatmap(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    获取GitHub风格的两周提交热力图数据
    """
    try:
        from datetime import date, timedelta
        from app.models import Submission
        from sqlalchemy import select, func, and_
        
        today = date.today()
        current_weekday = today.weekday()  # 0=周一, 6=周日
        
        # 计算两周的时间范围（从上周的周一到本周日）
        end_date = today + timedelta(days=(6 - current_weekday))
        start_date = end_date - timedelta(days=13)
        
        # 按日期统计提交数量
        submission_stats_result = await db.execute(
            select(
                func.date(Submission.created_at).label('submission_date'),
                func.count(Submission.id).label('submission_count')
            ).where(
                and_(
                    Submission.student_id == current_user.id,
                    func.date(Submission.created_at).between(start_date, end_date)
                )
            ).group_by(func.date(Submission.created_at))
        )
        
        daily_submissions = {row.submission_date: row.submission_count 
                           for row in submission_stats_result.fetchall()}
        
        def calculate_level(count):
            """计算提交次数对应的颜色等级"""
            if count == 0: return 0    # 0次
            elif count == 1: return 1  # 1次  
            elif count == 2: return 2  # 2次
            elif count <= 4: return 3  # 3-4次
            else: return 4             # 5次以上
        
        # 生成14天的完整数据
        heatmap_data = []
        current_date = start_date
        while current_date <= end_date:
            count = daily_submissions.get(current_date, 0)
            heatmap_data.append({
                "date": current_date.isoformat(),
                "submission_count": count,
                "level": calculate_level(count),
                "weekday": current_date.weekday(),
                "is_today": current_date == today
            })
            current_date += timedelta(days=1)
        
        # 统计信息
        total_submissions = sum(daily_submissions.values())
        active_days = len([d for d in daily_submissions.values() if d > 0])
        
        return BaseResponse(
            code=0,
            msg="获取成功",
            data={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "total_days": 14,
                "total_submissions": total_submissions,
                "active_days": active_days,
                "data": heatmap_data
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取提交热力图失败: {str(e)}")


@router.get("/leaderboard/streak")
async def get_streak_leaderboard(
    limit: int = Query(default=50, ge=1, le=100, description="返回数量限制"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    获取连续打卡天数排行榜（坚持榜）
    """
    try:
        from app.models import User
        from sqlalchemy import select, desc
        
        # Query to get users by current streak
        leaderboard_query = await db.execute(
            select(
                User.id,
                User.nickname,
                User.avatar,
                User.current_streak
            ).where(User.role == "student")
            .order_by(desc(User.current_streak), User.id)
            .limit(limit)
        )
        
        leaderboard_results = leaderboard_query.fetchall()
        leaderboard_data = []
        current_user_rank = None
        
        for rank, result in enumerate(leaderboard_results, 1):
            is_current_user = result.id == current_user.id
            if is_current_user:
                current_user_rank = rank
            
            leaderboard_data.append({
                "rank": rank,
                "user_id": result.id,
                "nickname": result.nickname or f"用户{result.id}",
                "avatar": result.avatar or "",
                "value": result.current_streak,
                "is_current_user": is_current_user
            })
        
        return BaseResponse(
            code=0,
            msg="获取成功",
            data={
                "current_user_rank": current_user_rank or 999,
                "leaderboard": leaderboard_data
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取连续打卡排行榜失败: {str(e)}")


@router.get("/leaderboard/submissions")
async def get_submissions_leaderboard(
    limit: int = Query(default=50, ge=1, le=100, description="返回数量限制"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    获取作业完成总数排行榜（容量榜）
    """
    try:
        from app.models import User
        from sqlalchemy import select, desc
        
        # Query to get users by total submissions
        leaderboard_query = await db.execute(
            select(
                User.id,
                User.nickname,
                User.avatar,
                User.total_submissions
            ).where(User.role == "student")
            .order_by(desc(User.total_submissions), User.id)
            .limit(limit)
        )
        
        leaderboard_results = leaderboard_query.fetchall()
        leaderboard_data = []
        current_user_rank = None
        
        for rank, result in enumerate(leaderboard_results, 1):
            is_current_user = result.id == current_user.id
            if is_current_user:
                current_user_rank = rank
            
            leaderboard_data.append({
                "rank": rank,
                "user_id": result.id,
                "nickname": result.nickname or f"用户{result.id}",
                "avatar": result.avatar or "",
                "value": result.total_submissions,
                "is_current_user": is_current_user
            })
        
        return BaseResponse(
            code=0,
            msg="获取成功",
            data={
                "current_user_rank": current_user_rank or 999,
                "leaderboard": leaderboard_data
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取作业完成总数排行榜失败: {str(e)}")


@router.get("/stats")
async def get_learning_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    获取学习统计数据
    包含更详细的学习分析数据
    """
    try:
        service = get_learning_service(db)
        
        # 基础数据
        basic_data = service.get_user_learning_data(current_user.id)
        
        # 打卡图数据
        chart_data = service.get_14day_checkin_chart(current_user.id)
        recent_checkins = sum(1 for item in chart_data if item["checked"])
        
        # 本月排名
        today = date.today()
        monthly_rank = service.get_user_rank_in_leaderboard(
            current_user.id, today.year, today.month
        )
        
        stats_data = {
            **basic_data,
            "recent_14day_checkins": recent_checkins,
            "monthly_rank": monthly_rank,
            "checkin_rate": round(recent_checkins / 14 * 100, 1),  # 打卡率
        }
        
        return BaseResponse(code=0, msg="获取成功", data=stats_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计数据失败: {str(e)}")


@router.get("/insights")
async def get_learning_insights_api(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    获取智能学习洞察分析
    提供个性化学习建议和趋势分析
    """
    try:
        # Get real insights based on user's submission data
        from app.models import Submission, SubmissionStatus
        from sqlalchemy import select, func, and_
        from datetime import datetime, timedelta
        
        # Get user's recent activity
        thirty_days_ago = datetime.now() - timedelta(days=30)
        seven_days_ago = datetime.now() - timedelta(days=7)
        
        # Get submission stats
        recent_submissions = await db.execute(
            select(func.count(Submission.id)).where(
                and_(
                    Submission.student_id == current_user.id,
                    Submission.created_at >= thirty_days_ago
                )
            )
        )
        recent_count = recent_submissions.scalar() or 0
        
        # Get average score
        avg_score_result = await db.execute(
            select(func.avg(Submission.score)).where(
                and_(
                    Submission.student_id == current_user.id,
                    Submission.status == SubmissionStatus.GRADED,
                    Submission.score.is_not(None)
                )
            )
        )
        avg_score = avg_score_result.scalar() or 0
        
        # Generate insights based on real data
        insights = []
        suggestions = []
        
        # Activity level insight
        if recent_count >= 10:
            insights.append({
                "type": "success", 
                "title": "学习积极性很高", 
                "description": f"最近30天提交了{recent_count}次作业，保持得很好！", 
                "level": "high"
            })
        elif recent_count >= 5:
            insights.append({
                "type": "info", 
                "title": "学习状态良好", 
                "description": f"最近30天提交了{recent_count}次作业，继续保持", 
                "level": "medium"
            })
        else:
            insights.append({
                "type": "warning", 
                "title": "可以更积极一些", 
                "description": f"最近30天只提交了{recent_count}次作业，建议增加练习频率", 
                "level": "low"
            })
        
        # Score performance insight
        if avg_score >= 85:
            insights.append({
                "type": "success", 
                "title": "成绩表现优秀", 
                "description": f"平均分{avg_score:.1f}分，超过大部分同学", 
                "level": "high"
            })
            suggestions.append({
                "type": "maintain", 
                "title": "保持当前水平", 
                "description": "继续保持优秀的学习状态，可以挑战更难的题目", 
                "priority": "medium"
            })
        elif avg_score >= 70:
            insights.append({
                "type": "info", 
                "title": "成绩稳步提升", 
                "description": f"平均分{avg_score:.1f}分，还有进步空间", 
                "level": "medium"
            })
            suggestions.append({
                "type": "improve", 
                "title": "加强练习", 
                "description": "建议多做题目，巩固知识点", 
                "priority": "high"
            })
        else:
            suggestions.append({
                "type": "focus", 
                "title": "重点提升", 
                "description": "建议重点复习基础知识，多与老师交流", 
                "priority": "high"
            })
        
        # Default helpful suggestions
        suggestions.append({
            "type": "general", 
            "title": "定期复习", 
            "description": "建议每天安排固定时间学习，养成良好习惯", 
            "priority": "medium"
        })
        
        insights_data = {
            "insights": insights,
            "suggestions": suggestions,
            "trends": {
                "streak_trend": "improving" if recent_count > 5 else "stable",
                "score_trend": "improving" if avg_score >= 75 else "stable", 
                "consistency": "high" if recent_count >= 10 else "medium" if recent_count >= 5 else "low"
            },
            "summary": {
                "recent_submissions": recent_count,
                "average_score": round(avg_score, 1),
                "performance_level": "优秀" if avg_score >= 85 else "良好" if avg_score >= 70 else "需要提升"
            }
        }
        return BaseResponse(code=0, msg="获取成功", data=insights_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取学习洞察失败: {str(e)}")


# ================================
# 管理员接口（V2.0预留）
# ================================

@router.post("/admin/reset-monthly", include_in_schema=False)
async def admin_reset_monthly_scores(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """管理员重置月度积分"""
    # TODO: 添加管理员权限检查
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="权限不足")
    
    try:
        service = get_learning_service(db)
        service.reset_monthly_scores(year, month)
        return BaseResponse(code=0, msg="重置成功", data={})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重置失败: {str(e)}")


def _calculate_exam_countdown() -> Optional[int]:
    """计算国考倒计时（简化版，假设12月31日）"""
    try:
        today = date.today()
        exam_date = date(today.year, 12, 31)  # 简化假设
        
        if today <= exam_date:
            return (exam_date - today).days
        else:
            # 考试已过，返回下年考试
            next_exam = date(today.year + 1, 12, 31)
            return (next_exam - today).days
            
    except Exception:
        return None