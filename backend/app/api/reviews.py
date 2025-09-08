"""
复盘管理相关API接口
处理个性化复盘设置和复盘记录
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from datetime import datetime, date, timedelta
from typing import List, Optional

from app.database import get_db
from app.models import User, ReviewSettings, UserReview, ReviewFrequency, ReviewStatus
from app.schemas import (
    ResponseBase, ReviewSettingsResponse, ReviewSettingsUpdate,
    UserReviewResponse, UserReviewCreate, UserReviewUpdate
)
from app.auth import get_current_user
from app.services.review_service import review_service

router = APIRouter(prefix="/reviews")


@router.get("/settings", response_model=ResponseBase[ReviewSettingsResponse])
async def get_review_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户的复盘设置
    """
    # 查找用户的复盘设置
    result = await db.execute(
        select(ReviewSettings).where(ReviewSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()
    
    # 如果没有设置，创建默认设置
    if not settings:
        settings = ReviewSettings(
            user_id=current_user.id,
            frequency=ReviewFrequency.WEEKLY,
            preferred_time=20,
            reminder_enabled=True,
            include_scores=True,
            include_mistakes=True,
            include_progress=True,
            include_suggestions=True
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
        
        # 计算下次复盘日期
        await review_service.calculate_next_review_date(settings, db)
    
    return ResponseBase(data=settings)


@router.put("/settings", response_model=ResponseBase[ReviewSettingsResponse])
async def update_review_settings(
    settings_data: ReviewSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    更新用户的复盘设置
    """
    # 查找现有设置
    result = await db.execute(
        select(ReviewSettings).where(ReviewSettings.user_id == current_user.id)
    )
    settings = result.scalar_one_or_none()
    
    # 如果没有设置，先创建默认设置
    if not settings:
        settings = ReviewSettings(user_id=current_user.id)
        db.add(settings)
    
    # 更新设置
    update_data = settings_data.dict(exclude_unset=True)
    frequency_changed = False
    
    for field, value in update_data.items():
        if field == "frequency" and settings.frequency != value:
            frequency_changed = True
        setattr(settings, field, value)
    
    settings.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(settings)
    
    # 如果复盘频率发生变化，重新计算下次复盘日期
    if frequency_changed:
        await review_service.calculate_next_review_date(settings, db)
    
    return ResponseBase(data=settings, msg="复盘设置已更新")


@router.get("/history", response_model=ResponseBase[List[UserReviewResponse]])
async def get_review_history(
    limit: int = 10,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户的复盘历史记录
    """
    result = await db.execute(
        select(UserReview)
        .where(UserReview.user_id == current_user.id)
        .order_by(desc(UserReview.review_date))
        .limit(limit)
        .offset(offset)
    )
    reviews = result.scalars().all()
    
    return ResponseBase(
        data=reviews,
        msg=f"获取到{len(reviews)}条复盘记录"
    )


@router.get("/current", response_model=ResponseBase[Optional[UserReviewResponse]])
async def get_current_review(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取当前待完成的复盘任务
    """
    # 查找最近的待完成复盘
    result = await db.execute(
        select(UserReview)
        .where(
            and_(
                UserReview.user_id == current_user.id,
                UserReview.status == ReviewStatus.PENDING
            )
        )
        .order_by(UserReview.review_date)
        .limit(1)
    )
    current_review = result.scalar_one_or_none()
    
    return ResponseBase(
        data=current_review,
        msg="当前复盘任务" if current_review else "暂无待完成的复盘任务"
    )


@router.post("/generate", response_model=ResponseBase[UserReviewResponse])
async def generate_review(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    手动生成复盘报告
    """
    try:
        review = await review_service.generate_review_for_user(current_user.id, db)
        return ResponseBase(
            data=review,
            msg="复盘报告生成成功"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"生成复盘报告失败: {str(e)}"
        )


@router.post("/complete/{review_id}", response_model=ResponseBase[UserReviewResponse])
async def complete_review(
    review_id: int,
    review_data: UserReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    完成复盘任务
    """
    # 获取复盘记录
    result = await db.execute(
        select(UserReview).where(
            and_(
                UserReview.id == review_id,
                UserReview.user_id == current_user.id,
                UserReview.status == ReviewStatus.PENDING
            )
        )
    )
    review = result.scalar_one_or_none()
    
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到待完成的复盘任务"
        )
    
    # 更新复盘记录
    review.status = ReviewStatus.COMPLETED
    review.user_notes = review_data.user_notes
    review.completed_at = datetime.utcnow()
    
    # 更新用户复盘设置中的最后复盘日期
    settings_result = await db.execute(
        select(ReviewSettings).where(ReviewSettings.user_id == current_user.id)
    )
    settings = settings_result.scalar_one_or_none()
    
    if settings:
        settings.last_review_date = date.today()
        settings.total_reviews += 1
        # 计算下次复盘日期
        await review_service.calculate_next_review_date(settings, db)
    
    await db.commit()
    await db.refresh(review)
    
    return ResponseBase(
        data=review,
        msg="复盘任务已完成"
    )


@router.post("/skip/{review_id}", response_model=ResponseBase)
async def skip_review(
    review_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    跳过复盘任务
    """
    # 获取复盘记录
    result = await db.execute(
        select(UserReview).where(
            and_(
                UserReview.id == review_id,
                UserReview.user_id == current_user.id,
                UserReview.status == ReviewStatus.PENDING
            )
        )
    )
    review = result.scalar_one_or_none()
    
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到待完成的复盘任务"
        )
    
    # 标记为跳过
    review.status = ReviewStatus.SKIPPED
    review.completed_at = datetime.utcnow()
    
    await db.commit()
    
    return ResponseBase(msg="已跳过本次复盘")


@router.get("/stats", response_model=ResponseBase)
async def get_review_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取复盘统计数据
    """
    # 获取复盘设置
    settings_result = await db.execute(
        select(ReviewSettings).where(ReviewSettings.user_id == current_user.id)
    )
    settings = settings_result.scalar_one_or_none()
    
    # 统计复盘记录
    total_result = await db.execute(
        select(UserReview).where(UserReview.user_id == current_user.id)
    )
    all_reviews = total_result.scalars().all()
    
    completed_count = len([r for r in all_reviews if r.status == ReviewStatus.COMPLETED])
    skipped_count = len([r for r in all_reviews if r.status == ReviewStatus.SKIPPED])
    pending_count = len([r for r in all_reviews if r.status == ReviewStatus.PENDING])
    
    # 计算平均完成时间
    completed_reviews = [r for r in all_reviews if r.status == ReviewStatus.COMPLETED and r.completion_duration]
    avg_duration = 0
    if completed_reviews:
        avg_duration = sum(r.completion_duration for r in completed_reviews) // len(completed_reviews)
    
    stats = {
        "total_reviews": settings.total_reviews if settings else 0,
        "completed_count": completed_count,
        "skipped_count": skipped_count,
        "pending_count": pending_count,
        "completion_rate": round(completed_count / max(1, completed_count + skipped_count) * 100, 1),
        "avg_completion_duration": avg_duration,
        "last_review_date": settings.last_review_date if settings else None,
        "next_review_date": settings.next_review_date if settings else None,
        "current_frequency": settings.frequency if settings else "weekly"
    }
    
    return ResponseBase(
        data=stats,
        msg="复盘统计数据获取成功"
    )