"""
任务状态计算工具
根据PRD要求计算前端显示状态
"""

from datetime import datetime
from typing import Dict, Optional
from app.models import Task, Submission, TaskType, TaskStatus, SubmissionStatus, Grade


def calculate_display_status(task: Task, submission: Optional[Submission] = None) -> Dict[str, str]:
    """
    Calculate display status for frontend according to PRD requirements
    
    返回前端需要的状态显示：
    - right_status: 右上角显示（待提交/待批改/评价档位）
    - left_status: 左下角显示（正在进行中/课后加餐/已结束/已完成）
    - card_style: 卡片样式（normal/ended/completed）
    
    Args:
        task: 任务对象
        submission: 用户提交记录（可选）
    
    Returns:
        包含显示状态的字典
    """
    now = datetime.utcnow()
    
    # 计算右上角状态
    if not submission:
        right_status = "待提交"
    elif submission.status == SubmissionStatus.SUBMITTED:
        right_status = "待批改"
    else:  # SubmissionStatus.GRADED
        right_status = submission.grade.value if submission.grade else "已批改"
    
    # 计算左下角状态
    if task.task_type == TaskType.EXTRA:
        left_status = "课后加餐"
    elif task.status == TaskStatus.ONGOING:
        if task.deadline and now > task.deadline:
            left_status = "已结束"
        else:
            left_status = "正在进行中"
    elif task.status == TaskStatus.ENDED:
        if submission and submission.status == SubmissionStatus.GRADED:
            left_status = "已完成"
        else:
            left_status = "已结束"
    else:
        left_status = "正在进行中"
    
    # 计算卡片样式
    if left_status == "已完成":
        card_style = "completed"
    elif left_status == "已结束":
        card_style = "ended"
    else:
        card_style = "normal"
    
    return {
        "right_status": right_status,
        "left_status": left_status,
        "card_style": card_style
    }


def should_pin_task(task: Task) -> bool:
    """
    判断任务是否应该置顶显示
    
    根据PRD要求：
    - 课后加餐任务需要置顶，直到学生完成
    
    Args:
        task: 任务对象
    
    Returns:
        是否应该置顶
    """
    return task.task_type == TaskType.EXTRA


def get_task_priority(task: Task, submission: Optional[Submission] = None) -> int:
    """
    获取任务显示优先级，用于排序
    
    优先级规则：
    1. 课后加餐任务（未完成）- 优先级最高
    2. 正在进行中的任务
    3. 已结束但未批改的任务
    4. 已完成的任务
    
    Args:
        task: 任务对象
        submission: 用户提交记录（可选）
    
    Returns:
        优先级数值，数值越小优先级越高
    """
    # 课后加餐任务且未完成 - 最高优先级
    if (task.task_type == TaskType.EXTRA and 
        (not submission or submission.status != SubmissionStatus.GRADED)):
        return 1
    
    # 正在进行中的任务
    if task.status == TaskStatus.ONGOING:
        return 2
    
    # 已结束但未批改
    if (task.status == TaskStatus.ENDED and 
        submission and submission.status == SubmissionStatus.SUBMITTED):
        return 3
    
    # 已完成的任务
    if (submission and submission.status == SubmissionStatus.GRADED):
        return 4
    
    # 其他情况
    return 5