"""
订阅和权限控制服务
管理用户的订阅状态、试用期限制和付费功能权限
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import User, SubscriptionType


class SubscriptionService:
    """订阅服务"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def init_trial_user(self, user: User) -> User:
        """初始化试用用户（注册时调用）"""
        user.subscription_type = SubscriptionType.TRIAL
        user.trial_started_at = datetime.utcnow()
        # 7天试用期
        user.subscription_expires_at = datetime.utcnow() + timedelta(days=7)
        user.is_active = True
        
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def check_subscription_status(self, user: User) -> Dict[str, Any]:
        """检查用户订阅状态"""
        now = datetime.utcnow()
        
        # 检查是否过期
        if user.subscription_expires_at and now > user.subscription_expires_at:
            if user.subscription_type != SubscriptionType.EXPIRED:
                user.subscription_type = SubscriptionType.EXPIRED
                self.db.commit()
        
        # 计算剩余天数
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
    
    def get_subscription_display_text(self, user: User) -> str:
        """获取订阅状态显示文本"""
        status = self.check_subscription_status(user)
        
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
    
    def upgrade_to_premium(self, user: User, days: int = 365) -> User:
        """升级为付费用户"""
        user.subscription_type = SubscriptionType.PREMIUM
        user.subscription_expires_at = datetime.utcnow() + timedelta(days=days)
        user.is_active = True
        
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def has_feature_access(self, user: User, feature: str) -> bool:
        """检查用户是否有权限访问特定功能"""
        status = self.check_subscription_status(user)
        
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
    
    def get_feature_limits(self, user: User) -> Dict[str, Any]:
        """获取用户的功能限制"""
        status = self.check_subscription_status(user)
        
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


# 权限装饰器
def require_subscription(subscription_types: list = None):
    """
    权限装饰器 - 检查用户订阅状态
    subscription_types: 允许的订阅类型列表，如 [SubscriptionType.PREMIUM]
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            # 这里需要根据具体的认证框架实现
            # 示例实现，实际使用时需要适配具体的认证系统
            pass
        return wrapper
    return decorator


def require_feature_access(feature: str):
    """
    功能权限装饰器 - 检查用户是否有权限访问特定功能
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            # 这里需要根据具体的认证框架实现
            pass
        return wrapper
    return decorator