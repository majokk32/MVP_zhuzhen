"""
异步订阅和权限控制服务
管理用户的订阅状态、试用期限制和付费功能权限
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models import User, SubscriptionType, UserRole


class AsyncSubscriptionService:
    """异步订阅服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def init_trial_user(self, user: User) -> User:
        """初始化试用用户（注册时调用）"""
        user.subscription_type = SubscriptionType.TRIAL
        user.trial_started_at = datetime.utcnow()
        # 7天试用期
        user.subscription_expires_at = datetime.utcnow() + timedelta(days=7)
        user.is_active = True
        
        await self.db.commit()
        await self.db.refresh(user)
        return user
    
    async def check_subscription_status(self, user: User) -> Dict[str, Any]:
        """检查用户订阅状态"""
        # Teachers always have premium status
        if user.role == UserRole.TEACHER:
            return {
                "subscription_type": SubscriptionType.PREMIUM,
                "is_active": True,
                "expires_at": None,  # No expiration for teachers
                "days_remaining": 999999,  # Unlimited
                "is_trial": False,
                "is_premium": True,
                "is_expired": False
            }
            
        now = datetime.utcnow()
        
        # Check for expiration (students only)
        if user.subscription_expires_at and now > user.subscription_expires_at:
            if user.subscription_type != SubscriptionType.EXPIRED:
                user.subscription_type = SubscriptionType.EXPIRED
                await self.db.commit()
        
        # Calculate remaining days
        days_remaining = 0
        if user.subscription_expires_at:
            remaining = user.subscription_expires_at - now
            days_remaining = max(0, remaining.days)
        
        return {
            "subscription_type": user.subscription_type,
            "is_active": user.is_active and user.subscription_type != SubscriptionType.EXPIRED,
            "expires_at": user.subscription_expires_at,
            "days_remaining": days_remaining,
            "is_trial": user.subscription_type == SubscriptionType.TRIAL,
            "is_premium": user.subscription_type == SubscriptionType.PREMIUM,
            "is_expired": user.subscription_type == SubscriptionType.EXPIRED
        }
    
    async def get_subscription_display_text(self, user: User) -> str:
        """获取订阅状态显示文本（仅限学生）"""
        # Teachers don't need subscription display
        if user.role == UserRole.TEACHER:
            return ""
            
        status = await self.check_subscription_status(user)
        
        if status["is_premium"]:
            return "付费用户"
        elif status["is_trial"]:
            days = status["days_remaining"]
            if days > 0:
                return f"试用用户 (剩余{days}天)"
            else:
                return "试用已过期"
        else:
            return "试用已过期"
    
    async def upgrade_to_premium(self, user: User, days: int = 365) -> User:
        """升级为付费用户"""
        user.subscription_type = SubscriptionType.PREMIUM
        user.subscription_expires_at = datetime.utcnow() + timedelta(days=days)
        user.is_active = True
        
        await self.db.commit()
        await self.db.refresh(user)
        return user
    
    async def has_feature_access(self, user: User, feature: str) -> bool:
        """检查用户是否有权限访问特定功能"""
        # Teachers always have premium access
        if user.role == UserRole.TEACHER:
            return True
            
        status = await self.check_subscription_status(user)
        
        # 如果是过期用户，只能访问基础功能
        if status["is_expired"]:
            return feature in ["basic_tasks", "basic_submissions"]
        
        # 试用用户的限制
        if status["is_trial"]:
            trial_limits = {
                "leaderboard": True,           # 排行榜（所有用户可用）
                "learning_data": True,         # 学习数据（所有用户可用）
                "advanced_analytics": False,   # 高级分析（付费功能）
                "export_data": False,          # 数据导出（付费功能）
                "unlimited_submissions": False, # 无限提交（试用限制）
                "premium_support": False       # 优先客服（付费功能）
            }
            return trial_limits.get(feature, True)
        
        # 付费用户拥有所有功能
        if status["is_premium"]:
            return True
        
        return False
    
    async def get_feature_limits(self, user: User) -> Dict[str, Any]:
        """获取用户的功能限制"""
        status = await self.check_subscription_status(user)
        
        if status["is_premium"]:
            return {
                "daily_submissions": -1,      # 无限制
                "monthly_tasks": -1,          # 无限制
                "data_export": True,
                "advanced_features": True
            }
        elif status["is_trial"]:
            return {
                "daily_submissions": 5,       # 每日5次提交
                "monthly_tasks": 20,          # 每月20个任务
                "data_export": False,
                "advanced_features": False
            }
        else:  # 过期用户
            return {
                "daily_submissions": 1,       # 每日1次提交
                "monthly_tasks": 3,           # 每月3个任务
                "data_export": False,
                "advanced_features": False
            }


# 便捷函数
async def init_trial_user_async(user: User, db: AsyncSession) -> User:
    """初始化试用用户（便捷函数）"""
    service = AsyncSubscriptionService(db)
    return await service.init_trial_user(user)


async def get_subscription_status_async(user: User, db: AsyncSession) -> Dict[str, Any]:
    """获取订阅状态（便捷函数）"""
    service = AsyncSubscriptionService(db)
    return await service.check_subscription_status(user)


async def get_subscription_display_async(user: User, db: AsyncSession) -> str:
    """获取订阅显示文本（便捷函数）"""
    service = AsyncSubscriptionService(db)
    return await service.get_subscription_display_text(user)