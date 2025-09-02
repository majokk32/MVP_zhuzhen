"""
Pydantic models for request/response validation
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Any
from datetime import datetime
from enum import Enum


# Enums
class UserRoleEnum(str, Enum):
    student = "student"
    teacher = "teacher"


class TaskStatusEnum(str, Enum):
    ongoing = "ongoing"
    ended = "ended"


class GradeEnum(str, Enum):
    pending = "待复盘"
    good = "优秀"
    excellent = "极佳"


# Base response model
class ResponseBase(BaseModel):
    code: int = Field(default=0, description="状态码，0表示成功")
    msg: str = Field(default="ok", description="响应消息")
    data: Optional[Any] = Field(default=None, description="响应数据")


# User schemas
class UserLogin(BaseModel):
    code: str = Field(..., description="微信登录code")


class UserUpdateProfile(BaseModel):
    nickname: Optional[str] = Field(None, max_length=50, description="用户昵称")
    avatar: Optional[str] = Field(None, max_length=500, description="头像URL")


class UserInfo(BaseModel):
    id: int
    nickname: str
    avatar: Optional[str]
    role: UserRoleEnum
    phone: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


# Task schemas
class TaskCreate(BaseModel):
    title: str = Field(..., max_length=200, description="任务标题")
    course: str = Field(..., max_length=100, description="课程名称")
    desc: str = Field(..., description="题目详情")
    total_score: float = Field(default=40, gt=0, description="总分")
    deadline: Optional[datetime] = Field(None, description="截止时间")


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    course: Optional[str] = Field(None, max_length=100)
    desc: Optional[str] = None
    total_score: Optional[float] = Field(None, gt=0)
    deadline: Optional[datetime] = None
    status: Optional[TaskStatusEnum] = None


class TaskInfo(BaseModel):
    id: int
    title: str
    course: str
    desc: str
    total_score: float
    deadline: Optional[datetime]
    status: TaskStatusEnum
    created_by: int
    created_at: datetime
    
    # Additional fields for student view
    submission_status: Optional[str] = Field(None, description="学生的提交状态")
    submission_grade: Optional[GradeEnum] = Field(None, description="学生的评价")
    submission_score: Optional[float] = Field(None, description="学生的得分")
    
    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    tasks: List[TaskInfo]
    total: int


# Submission schemas
class SubmissionCreate(BaseModel):
    task_id: int = Field(..., description="任务ID")
    images: List[str] = Field(..., min_items=1, max_items=6, description="图片URL列表")
    text: Optional[str] = Field(None, description="文字内容")
    
    @validator('images')
    def validate_images(cls, v):
        if not v or len(v) == 0:
            raise ValueError('至少需要上传一张图片')
        if len(v) > 6:
            raise ValueError('最多只能上传6张图片')
        return v


class SubmissionGrade(BaseModel):
    submission_id: int = Field(..., description="提交ID")
    score: float = Field(..., ge=0, description="得分")
    grade: GradeEnum = Field(..., description="评价档位")
    comment: Optional[str] = Field(None, description="评语")


class SubmissionInfo(BaseModel):
    id: int
    task_id: int
    student_id: int
    images: List[str]
    text: Optional[str]
    submit_count: int
    status: str
    score: Optional[float]
    grade: Optional[GradeEnum]
    comment: Optional[str]
    graded_by: Optional[int]
    graded_at: Optional[datetime]
    created_at: datetime
    
    # Nested relationships
    student_nickname: Optional[str] = None
    student_avatar: Optional[str] = None
    task_title: Optional[str] = None
    
    class Config:
        from_attributes = True


# Admin schemas
class TaskProgress(BaseModel):
    task_id: int
    task_title: str
    total_students: int
    submitted_count: int
    graded_count: int
    pending_count: int


class StudentStats(BaseModel):
    student_id: int
    nickname: str
    avatar: Optional[str]
    total_submissions: int
    total_tasks: int
    completion_rate: float
    average_score: Optional[float]


# File upload response
class FileUploadResponse(BaseModel):
    url: str = Field(..., description="上传后的文件URL")
    filename: str = Field(..., description="文件名")
    size: int = Field(..., description="文件大小（字节）")