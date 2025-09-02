"""
微信模板消息通知模块
处理作业批改完成、课前提醒等通知
"""

import httpx
from typing import Dict, Optional
from datetime import datetime
from app.config import settings


class NotificationService:
    """通知服务"""
    
    def __init__(self):
        self.base_url = "https://api.weixin.qq.com/cgi-bin"
        
    async def send_grade_notification(
        self, 
        openid: str, 
        task_title: str, 
        grade: str,
        comment: Optional[str] = None
    ) -> bool:
        """
        发送批改完成通知
        
        Args:
            openid: 用户的微信openid
            task_title: 任务标题
            grade: 评价档位
            comment: 评语（可选）
        
        Returns:
            是否发送成功
        """
        # V1.0 简化实现，记录通知日志
        # 实际实现需要：
        # 1. 获取access_token
        # 2. 调用模板消息接口
        # 3. 处理错误重试
        
        notification_data = {
            "touser": openid,
            "template_id": "YOUR_TEMPLATE_ID",  # 需要在微信后台配置
            "data": {
                "first": {
                    "value": f"您的作业《{task_title}》已批改完成"
                },
                "keyword1": {
                    "value": task_title
                },
                "keyword2": {
                    "value": grade
                },
                "keyword3": {
                    "value": datetime.now().strftime("%Y-%m-%d %H:%M")
                },
                "remark": {
                    "value": comment[:50] if comment else "点击查看详细评语"
                }
            }
        }
        
        # TODO: 实际发送逻辑
        print(f"[通知] 发送批改完成通知给 {openid}: {task_title} - {grade}")
        return True
    
    async def send_deadline_reminder(
        self,
        openid: str,
        task_title: str,
        deadline: datetime
    ) -> bool:
        """
        发送截止时间提醒（课前2小时）
        
        Args:
            openid: 用户的微信openid
            task_title: 任务标题
            deadline: 截止时间
        
        Returns:
            是否发送成功
        """
        notification_data = {
            "touser": openid,
            "template_id": "YOUR_DEADLINE_TEMPLATE_ID",
            "data": {
                "first": {
                    "value": f"《{task_title}》即将开始，请及时提交作业"
                },
                "keyword1": {
                    "value": task_title
                },
                "keyword2": {
                    "value": deadline.strftime("%Y-%m-%d %H:%M")
                },
                "remark": {
                    "value": "课前作业收集即将结束，请尽快提交"
                }
            }
        }
        
        # TODO: 实际发送逻辑
        print(f"[通知] 发送截止提醒给 {openid}: {task_title}")
        return True
    
    async def send_new_task_notification(
        self,
        openid: str,
        task_title: str,
        course: str
    ) -> bool:
        """
        发送新任务通知（V2.0功能，预留）
        
        Args:
            openid: 用户的微信openid
            task_title: 任务标题
            course: 课程名称
        
        Returns:
            是否发送成功
        """
        # V2.0 功能预留
        print(f"[通知] 新任务通知给 {openid}: {course} - {task_title}")
        return True


# 全局通知服务实例
notification_service = NotificationService()