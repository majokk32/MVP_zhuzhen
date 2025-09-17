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


class LeaderboardItem(BaseModel):
    """排行榜项"""
    rank: int                  # 排名
    user_id: int              # 用户ID
    nickname: str             # 昵称
    avatar: Optional[str]     # 头像
    score: int                # 积分
    is_current_user: bool     # 是否当前用户


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
        
        # 2. Calculate total score from graded submissions
        score_result = await db.execute(
            select(func.sum(Submission.score)).where(
                and_(
                    Submission.student_id == current_user.id,
                    Submission.status == SubmissionStatus.GRADED,
                    Submission.score.is_not(None)
                )
            )
        )
        total_score = int(score_result.scalar() or 0)
        
        # 3. Calculate monthly score (last 30 days)
        thirty_days_ago = datetime.now() - timedelta(days=30)
        monthly_score_result = await db.execute(
            select(func.sum(Submission.score)).where(
                and_(
                    Submission.student_id == current_user.id,
                    Submission.status == SubmissionStatus.GRADED,
                    Submission.score.is_not(None),
                    Submission.created_at >= thirty_days_ago
                )
            )
        )
        monthly_score = int(monthly_score_result.scalar() or 0)
        
        # 4. Calculate quarterly score (last 90 days)
        ninety_days_ago = datetime.now() - timedelta(days=90)
        quarterly_score_result = await db.execute(
            select(func.sum(Submission.score)).where(
                and_(
                    Submission.student_id == current_user.id,
                    Submission.status == SubmissionStatus.GRADED,
                    Submission.score.is_not(None),
                    Submission.created_at >= ninety_days_ago
                )
            )
        )
        quarterly_score = int(quarterly_score_result.scalar() or 0)
        
        # 5. Calculate this week's submissions (as proxy for checkins)
        week_start = datetime.now() - timedelta(days=datetime.now().weekday())
        week_checkins_result = await db.execute(
            select(func.count(func.distinct(func.date(Submission.created_at)))).where(
                and_(
                    Submission.student_id == current_user.id,
                    Submission.created_at >= week_start
                )
            )
        )
        week_checkins = int(week_checkins_result.scalar() or 0)
        
        # 6. Calculate streak data (consecutive days with submissions)
        # Get all submission dates for this user, ordered by date
        streak_result = await db.execute(
            select(func.date(Submission.created_at)).where(
                Submission.student_id == current_user.id
            ).distinct().order_by(func.date(Submission.created_at).desc())
        )
        submission_dates = [row[0] for row in streak_result.fetchall()]
        
        current_streak = 0
        best_streak = 0
        temp_streak = 0
        
        if submission_dates:
            # Calculate current streak
            today = datetime.now().date()
            current_date = today
            for date in submission_dates:
                if date == current_date or date == current_date - timedelta(days=1):
                    current_streak += 1
                    current_date = date - timedelta(days=1)
                else:
                    break
            
            # Calculate best streak
            if len(submission_dates) > 1:
                for i in range(len(submission_dates)):
                    temp_streak = 1
                    current_check_date = submission_dates[i]
                    
                    for j in range(i + 1, len(submission_dates)):
                        expected_date = current_check_date - timedelta(days=1)
                        if submission_dates[j] == expected_date:
                            temp_streak += 1
                            current_check_date = expected_date
                        else:
                            break
                    
                    best_streak = max(best_streak, temp_streak)
            else:
                best_streak = len(submission_dates)
        
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
        
        # Get submission dates for last 14 days
        fourteen_days_ago = today - timedelta(days=13)
        submission_dates_result = await db.execute(
            select(func.date(Submission.created_at)).where(
                and_(
                    Submission.student_id == current_user.id,
                    func.date(Submission.created_at) >= fourteen_days_ago
                )
            ).distinct()
        )
        submission_dates = {row[0] for row in submission_dates_result.fetchall()}
        
        # Generate 14 days of real data
        for i in range(14):
            current_date = today - timedelta(days=13-i)
            chart_data.append({
                "date": current_date.isoformat(),
                "checked": current_date in submission_dates,
                "weekday": current_date.weekday(),
                "is_today": current_date == today
            })
        
        chart_items = [CheckinChartItem(**item) for item in chart_data]
        
        return BaseResponse(
            code=0, 
            msg="获取成功", 
            data=chart_items
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取打卡图表失败: {str(e)}")


@router.get("/leaderboard/monthly")
async def get_monthly_leaderboard(
    year: int = Query(default=None, description="年份，默认当前年份"),
    month: int = Query(default=None, description="月份，默认当前月份"),
    limit: int = Query(default=100, ge=1, le=500, description="返回数量限制"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    获取月度积分排行榜
    """
    try:
        # 默认使用当前年月
        if not year or not month:
            today = date.today()
            year = year or today.year
            month = month or today.month
        
        # Get real leaderboard data based on submissions in the given month
        from app.models import Submission, User, SubmissionStatus
        from sqlalchemy import select, func, desc, and_
        from datetime import datetime
        
        # Calculate month start and end dates
        month_start = datetime(year, month, 1)
        if month == 12:
            month_end = datetime(year + 1, 1, 1)
        else:
            month_end = datetime(year, month + 1, 1)
        
        # Query to get user scores for the month
        leaderboard_query = await db.execute(
            select(
                User.id,
                User.nickname,
                User.avatar,
                func.coalesce(func.sum(Submission.score), 0).label('total_score')
            ).select_from(User)
            .outerjoin(
                Submission,
                and_(
                    User.id == Submission.student_id,
                    Submission.status == SubmissionStatus.GRADED,
                    Submission.score.is_not(None),
                    Submission.created_at >= month_start,
                    Submission.created_at < month_end
                )
            )
            .where(User.role == "student")  # Only students in leaderboard
            .group_by(User.id, User.nickname, User.avatar)
            .order_by(desc('total_score'))
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
                "score": int(result.total_score),
                "is_current_user": is_current_user
            })
        
        # If current user not in top results, find their rank
        if current_user_rank is None:
            # Get current user's score for the month
            user_score_query = await db.execute(
                select(func.coalesce(func.sum(Submission.score), 0))
                .where(
                    and_(
                        Submission.student_id == current_user.id,
                        Submission.status == SubmissionStatus.GRADED,
                        Submission.score.is_not(None),
                        Submission.created_at >= month_start,
                        Submission.created_at < month_end
                    )
                )
            )
            current_user_score = user_score_query.scalar() or 0
            
            # Count users with higher scores
            rank_query = await db.execute(
                select(func.count(func.distinct(User.id)))
                .select_from(User)
                .join(
                    Submission,
                    and_(
                        User.id == Submission.student_id,
                        Submission.status == SubmissionStatus.GRADED,
                        Submission.score.is_not(None),
                        Submission.created_at >= month_start,
                        Submission.created_at < month_end
                    )
                )
                .where(User.role == "student")
                .group_by(User.id)
                .having(func.sum(Submission.score) > current_user_score)
            )
            higher_ranked_users = rank_query.scalar() or 0
            current_user_rank = higher_ranked_users + 1
        
        leaderboard_items = [LeaderboardItem(**item) for item in leaderboard_data]
        
        return BaseResponse(
            code=0,
            msg="获取成功",
            data={
                "year": year,
                "month": month,
                "current_user_rank": current_user_rank,
                "leaderboard": leaderboard_items
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取月度排行榜失败: {str(e)}")


@router.get("/leaderboard/quarterly")
async def get_quarterly_leaderboard(
    year: int = Query(default=None, description="年份，默认当前年份"),
    quarter: int = Query(default=None, ge=1, le=4, description="季度(1-4)，默认当前季度"),
    limit: int = Query(default=100, ge=1, le=500, description="返回数量限制"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    获取季度积分排行榜
    """
    try:
        # 默认使用当前年份和季度
        if not year or not quarter:
            today = date.today()
            year = year or today.year
            quarter = quarter or ((today.month - 1) // 3 + 1)
        
        service = get_learning_service(db)
        leaderboard_data = service.get_quarterly_leaderboard(year, quarter, limit)
        
        # 标记当前用户
        current_user_rank = None
        for item in leaderboard_data:
            if item["user_id"] == current_user.id:
                item["is_current_user"] = True
                current_user_rank = item["rank"]
                break
        
        leaderboard_items = [LeaderboardItem(**item) for item in leaderboard_data]
        
        # 国考季特殊信息
        season_info = {}
        if ((today.month - 1) // 3 + 1) == 4:  # 第4季度
            season_info = {
                "is_exam_season": True,
                "season_title": "💯 国考冲刺季",
                "season_desc": "冲刺国考，一起加油！",
                "exam_countdown": self._calculate_exam_countdown()
            }
        
        return BaseResponse(
            code=0,
            msg="获取成功",
            data={
                "year": year,
                "quarter": quarter,
                "current_user_rank": current_user_rank,
                "leaderboard": leaderboard_items,
                "season_info": season_info
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取季度排行榜失败: {str(e)}")


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