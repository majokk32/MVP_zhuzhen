"""
微信模板消息通知模块
处理作业批改完成、课前提醒等通知
"""

import httpx
import asyncio
import json
from typing import Dict, Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import settings
from app.database import get_db
from app.models import NotificationSettings
import logging

logger = logging.getLogger(__name__)


class NotificationService:
    """通知服务"""
    
    def __init__(self):
        self.base_url = "https://api.weixin.qq.com/cgi-bin"
        self.access_token = None
        self.token_expire_time = None
        
        # 模板消息ID配置
        self.templates = {
            "grade_complete": getattr(settings, 'WECHAT_GRADE_TEMPLATE_ID', ''),
            "deadline_reminder": getattr(settings, 'WECHAT_DEADLINE_TEMPLATE_ID', ''),
            "new_task": getattr(settings, 'WECHAT_NEWTASK_TEMPLATE_ID', '')
        }
    
    async def get_access_token(self) -> Optional[str]:
        """
        获取微信AccessToken
        
        Returns:
            AccessToken字符串或None（获取失败时）
        """
        # 检查token是否已存在且未过期
        if (self.access_token and self.token_expire_time and 
            datetime.now() < self.token_expire_time - timedelta(minutes=5)):
            return self.access_token
        
        try:
            url = f"{self.base_url}/token"
            params = {
                "grant_type": "client_credential",
                "appid": settings.WECHAT_APPID,
                "secret": settings.WECHAT_SECRET
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params)
                data = response.json()
                
                if "access_token" in data:
                    self.access_token = data["access_token"]
                    # token有效期7200秒，提前5分钟过期
                    self.token_expire_time = datetime.now() + timedelta(seconds=data.get("expires_in", 7200))
                    logger.info("微信AccessToken获取成功")
                    return self.access_token
                else:
                    logger.error(f"获取AccessToken失败: {data}")
                    return None
                    
        except Exception as e:
            logger.error(f"获取AccessToken异常: {str(e)}")
            return None
    
    async def send_template_message(self, template_data: Dict) -> bool:
        """
        发送模板消息的通用方法
        
        Args:
            template_data: 模板消息数据
            
        Returns:
            是否发送成功
        """
        access_token = await self.get_access_token()
        if not access_token:
            logger.error("无法获取AccessToken，通知发送失败")
            return False
        
        try:
            url = f"{self.base_url}/message/template/send?access_token={access_token}"
            
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=template_data)
                result = response.json()
                
                if result.get("errcode") == 0:
                    logger.info(f"模板消息发送成功: {template_data.get('touser')}")
                    return True
                else:
                    logger.error(f"模板消息发送失败: {result}")
                    return False
                    
        except Exception as e:
            logger.error(f"发送模板消息异常: {str(e)}")
            return False
        
    async def send_grade_notification(
        self, 
        openid: str, 
        task_title: str, 
        grade: str,
        comment: Optional[str] = None,
        user_id: Optional[int] = None
    ) -> bool:
        """
        发送批改完成通知
        
        Args:
            openid: 用户的微信openid
            task_title: 任务标题
            grade: 评价档位
            comment: 评语（可选）
            user_id: 用户ID（用于检查通知偏好）
        
        Returns:
            是否发送成功
        """
        # 检查用户通知偏好
        if user_id and not await self._check_notification_allowed(user_id, "grade_complete"):
            logger.info(f"用户 {user_id} 已关闭批改完成通知或在免打扰时间内")
            return True  # 返回True避免影响业务流程
        
        if not self.templates["grade_complete"]:
            logger.warning("批改完成通知模板ID未配置，使用日志记录")
            print(f"[通知] 发送批改完成通知给 {openid}: {task_title} - {grade}")
            return True
        
        # 处理评价档位显示
        grade_display_map = {
            "waiting_review": "待复盘",
            "excellent": "优秀",
            "perfect": "极佳"
        }
        grade_display = grade_display_map.get(grade, grade)
        
        # 构建模板消息数据
        template_data = {
            "touser": openid,
            "template_id": self.templates["grade_complete"],
            "data": {
                "first": {
                    "value": f"您的作业已批改完成",
                    "color": "#173177"
                },
                "keyword1": {
                    "value": task_title,
                    "color": "#173177"
                },
                "keyword2": {
                    "value": grade_display,
                    "color": "#FF6B35" if grade == "waiting_review" else "#4CAF50"
                },
                "keyword3": {
                    "value": datetime.now().strftime("%Y-%m-%d %H:%M"),
                    "color": "#173177"
                },
                "remark": {
                    "value": comment[:50] + "..." if comment and len(comment) > 50 else (comment or "点击查看详细评语"),
                    "color": "#666666"
                }
            },
            # 点击跳转到任务详情页
            "url": f"{getattr(settings, 'MINIPROGRAM_DOMAIN', '')}/pages/task-detail/task-detail"
        }
        
        return await self.send_template_message(template_data)
    
    async def send_deadline_reminder(
        self,
        openid: str,
        task_title: str,
        deadline: datetime,
        user_id: Optional[int] = None
    ) -> bool:
        """
        发送截止时间提醒（课前2小时）
        
        Args:
            openid: 用户的微信openid
            task_title: 任务标题
            deadline: 截止时间
            user_id: 用户ID（用于检查通知偏好）
        
        Returns:
            是否发送成功
        """
        # 检查用户通知偏好
        if user_id and not await self._check_notification_allowed(user_id, "deadline_reminder"):
            logger.info(f"用户 {user_id} 已关闭截止提醒通知或在免打扰时间内")
            return True  # 返回True避免影响业务流程
        
        if not self.templates["deadline_reminder"]:
            logger.warning("截止提醒通知模板ID未配置，使用日志记录")
            print(f"[通知] 发送截止提醒给 {openid}: {task_title}")
            return True
        
        # 计算剩余时间
        now = datetime.now()
        time_left = deadline - now
        hours_left = max(0, int(time_left.total_seconds() // 3600))
        minutes_left = max(0, int((time_left.total_seconds() % 3600) // 60))
        
        if hours_left > 0:
            time_display = f"{hours_left}小时{minutes_left}分钟"
        else:
            time_display = f"{minutes_left}分钟"
        
        # 构建模板消息数据
        template_data = {
            "touser": openid,
            "template_id": self.templates["deadline_reminder"],
            "data": {
                "first": {
                    "value": f"课前作业即将截止",
                    "color": "#FF6B35"
                },
                "keyword1": {
                    "value": task_title,
                    "color": "#173177"
                },
                "keyword2": {
                    "value": deadline.strftime("%Y-%m-%d %H:%M"),
                    "color": "#173177"
                },
                "keyword3": {
                    "value": time_display,
                    "color": "#FF6B35"
                },
                "remark": {
                    "value": "若您在开课前半小时内提交，请在听完课并二次修改后再次上传，作业将由督学老师批改。",
                    "color": "#666666"
                }
            },
            # 点击跳转到任务列表页
            "url": f"{getattr(settings, 'MINIPROGRAM_DOMAIN', '')}/pages/index/index"
        }
        
        return await self.send_template_message(template_data)
    
    async def send_new_task_notification(
        self,
        openid: str,
        task_title: str,
        course: str,
        user_id: Optional[int] = None
    ) -> bool:
        """
        发送新任务通知（V2.0功能，预留）
        
        Args:
            openid: 用户的微信openid
            task_title: 任务标题
            course: 课程名称
            user_id: 用户ID（用于检查通知偏好）
        
        Returns:
            是否发送成功
        """
        # 检查用户通知偏好
        if user_id and not await self._check_notification_allowed(user_id, "new_task"):
            logger.info(f"用户 {user_id} 已关闭新任务通知或在免打扰时间内")
            return True  # 返回True避免影响业务流程
        
        # V2.0 功能预留
        print(f"[通知] 新任务通知给 {openid}: {course} - {task_title}")
        return True


    async def _check_notification_allowed(
        self, 
        user_id: int, 
        notification_type: str
    ) -> bool:
        """
        检查用户是否允许接收指定类型的通知
        
        Args:
            user_id: 用户ID
            notification_type: 通知类型
            
        Returns:
            是否允许发送通知
        """
        try:
            async with get_db() as db:
                # 获取用户通知设置
                result = await db.execute(
                    select(NotificationSettings).where(NotificationSettings.user_id == user_id)
                )
                settings = result.scalar_one_or_none()
                
                # 默认设置：所有通知都开启
                if not settings:
                    return True
                
                # 检查对应类型的开关
                type_mapping = {
                    "grade_complete": settings.grade_complete_enabled,
                    "deadline_reminder": settings.deadline_reminder_enabled,
                    "new_task": settings.new_task_enabled,
                    "streak_break_reminder": settings.streak_break_reminder
                }
                
                is_enabled = type_mapping.get(notification_type, True)
                if not is_enabled:
                    return False
                
                # 检查免打扰时间
                now = datetime.now()
                current_hour = now.hour
                
                # 处理跨日的免打扰时间
                if settings.quiet_hours_start > settings.quiet_hours_end:
                    # 例如：22:00-08:00 (次日)
                    in_quiet_hours = (current_hour >= settings.quiet_hours_start or 
                                    current_hour <= settings.quiet_hours_end)
                else:
                    # 例如：08:00-22:00 (同日)
                    in_quiet_hours = (settings.quiet_hours_start <= current_hour <= settings.quiet_hours_end)
                    in_quiet_hours = not in_quiet_hours  # 取反，因为这是免打扰时间
                
                if in_quiet_hours:
                    return False
                
                return True
                
        except Exception as e:
            logger.error(f"检查通知偏好失败: {str(e)}")
            # 出错时默认允许发送，避免影响业务流程
            return True


# 全局通知服务实例
notification_service = NotificationService()