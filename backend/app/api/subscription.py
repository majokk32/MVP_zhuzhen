"""
订阅和权限相关API接口
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.database import get_db
from app.models import User
from app.schemas import ResponseBase
from app.auth import get_current_user
from app.services.async_subscription import (
    AsyncSubscriptionService,
    get_subscription_status_async
)

router = APIRouter(prefix="/subscription")


@router.get("/status", response_model=ResponseBase)
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取当前用户的订阅状态详情
    """
    service = AsyncSubscriptionService(db)
    status = await service.check_subscription_status(current_user)
    
    return ResponseBase(data=status)


@router.get("/limits", response_model=ResponseBase)
async def get_feature_limits(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取当前用户的功能限制信息
    """
    service = AsyncSubscriptionService(db)
    limits = await service.get_feature_limits(current_user)
    
    return ResponseBase(data=limits)


@router.get("/check-access/{feature}", response_model=ResponseBase)
async def check_feature_access(
    feature: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    检查用户是否有权限访问特定功能
    """
    service = AsyncSubscriptionService(db)
    has_access = await service.has_feature_access(current_user, feature)
    
    return ResponseBase(data={
        "feature": feature,
        "has_access": has_access,
        "subscription_type": current_user.subscription_type
    })


@router.post("/upgrade-demo", response_model=ResponseBase)
async def upgrade_to_premium_demo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    演示升级功能 - 实际生产环境中这应该与支付系统集成
    """
    service = AsyncSubscriptionService(db)
    updated_user = await service.upgrade_to_premium(current_user, days=365)
    
    status = await service.check_subscription_status(updated_user)
    display_text = await service.get_subscription_display_text(updated_user)
    
    return ResponseBase(
        data={
            "message": "升级成功！",
            "subscription_status": status,
            "display_text": display_text
        }
    )