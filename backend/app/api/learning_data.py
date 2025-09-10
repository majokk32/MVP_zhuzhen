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
        # Temporary fix: return mock data until async database migration is complete
        data = {
            "user_id": current_user.id,
            "current_streak": 2,
            "best_streak": 1,
            "total_score": 42,
            "monthly_score": 10,
            "quarterly_score": 15,
            "total_submissions": 5,
            "week_checkins": 2,
            "last_checkin_date": datetime.now().strftime("%Y-%m-%d")
        }
        # service = get_learning_service(db)
        # data = service.get_user_learning_data(current_user.id)
        
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
        # Temporary fix: return mock 14-day checkin chart data
        from datetime import date, timedelta
        
        chart_data = []
        today = date.today()
        
        # Generate 14 days of mock data
        for i in range(14):
            current_date = today - timedelta(days=13-i)
            chart_data.append({
                "date": current_date.isoformat(),
                "checked": False,  # All false for now
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
        
        # Temporary fix: return mock leaderboard data
        leaderboard_data = [
            {
                "rank": 1,
                "user_id": current_user.id,
                "nickname": current_user.nickname or "我",
                "avatar": current_user.avatar,
                "score": 0,
                "is_current_user": True
            }
        ]
        
        current_user_rank = 1
        
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
        # Temporary mock data until Docker volume issue is resolved
        insights_data = {
            "insights": [{"type": "info", "title": "功能开发中", "description": "学习洞察功能正在完善中", "level": "info"}],
            "suggestions": [{"type": "info", "title": "敬请期待", "description": "更多个性化建议即将推出", "priority": "low"}], 
            "trends": {"streak_trend": "stable", "score_trend": "stable", "consistency": "medium"},
            "summary": {"current_streak": 0, "best_streak": 0, "total_score": 0, "monthly_score": 0, "week_checkins": 0}
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