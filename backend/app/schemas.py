from __future__ import annotations
"""
Pydantic models for request/response validation
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Any, Generic, TypeVar
from datetime import datetime
from enum import Enum



# Enums
class UserRoleEnum(str, Enum):
    student = "student"
    teacher = "teacher"


class TaskStatusEnum(str, Enum):
    draft = "draft"
    ongoing = "ongoing"
    ended = "ended"


class SubscriptionTypeEnum(str, Enum):
    trial = "TRIAL"
    premium = "PREMIUM"


class GradeEnum(str, Enum):
    review = "review"
    good = "good"
    excellent = "excellent"


# Type variable for generic response
T = TypeVar('T')

# Base response model
class BaseResponse(BaseModel, Generic[T]):
    code: int = Field(default=0, description="状态码，0表示成功")
    msg: str = Field(default="ok", description="响应消息")
    data: Optional[T] = Field(default=None, description="响应数据")

# Alias for backward compatibility
ResponseBase = BaseResponse


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
    subscription_type: Optional[SubscriptionTypeEnum]
    subscription_expires_at: Optional[datetime]
    
    class Config:
        from_attributes = True


# Task schemas
class TaskCreate(BaseModel):
    title: str = Field(..., max_length=200, description="任务标题")
    course: str = Field(..., max_length=100, description="课程名称")
    desc: str = Field(..., description="题目详情")
    total_score: float = Field(default=40, gt=0, description="总分")
    deadline: Optional[datetime] = Field(None, description="截止时间")
    live_start_time: Optional[datetime] = Field(None, description="直播开始时间")
    status: Optional[TaskStatusEnum] = Field(default=TaskStatusEnum.ongoing, description="任务状态")


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    course: Optional[str] = Field(None, max_length=100)
    desc: Optional[str] = None
    total_score: Optional[float] = Field(None, gt=0)
    deadline: Optional[datetime] = None
    live_start_time: Optional[datetime] = None
    status: Optional[TaskStatusEnum] = None


class TaskInfo(BaseModel):
    id: int
    title: str
    course: str
    desc: str
    total_score: float
    deadline: Optional[datetime]
    live_start_time: Optional[datetime]
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
    
    @field_validator('images')
    @classmethod
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
    feedback: Optional[str] = Field(None, description="评语")


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


# Teacher management schemas
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
    subscription_type: str = Field(..., description="订阅类型: trial, premium, expired")
    total_submissions: int
    total_tasks: int
    completion_rate: float
    average_score: Optional[float]


# File upload response
class FileUploadResponse(BaseModel):
    url: str = Field(..., description="上传后的文件URL")
    filename: str = Field(..., description="文件名")
    size: int = Field(..., description="文件大小（字节）")


# Notification Settings Schemas
class NotificationSettingsBase(BaseModel):
    grade_complete_enabled: bool = Field(default=True, description="作业批改完成通知")
    deadline_reminder_enabled: bool = Field(default=True, description="课前截止提醒")
    new_task_enabled: bool = Field(default=True, description="新任务发布通知")
    streak_break_reminder: bool = Field(default=True, description="连续打卡中断提醒")
    quiet_hours_start: int = Field(default=22, ge=0, le=23, description="免打扰开始时间")
    quiet_hours_end: int = Field(default=8, ge=0, le=23, description="免打扰结束时间")


class NotificationSettingsCreate(NotificationSettingsBase):
    pass


class NotificationSettingsUpdate(BaseModel):
    grade_complete_enabled: Optional[bool] = None
    deadline_reminder_enabled: Optional[bool] = None
    new_task_enabled: Optional[bool] = None
    streak_break_reminder: Optional[bool] = None
    quiet_hours_start: Optional[int] = Field(None, ge=0, le=23)
    quiet_hours_end: Optional[int] = Field(None, ge=0, le=23)


class NotificationSettingsResponse(NotificationSettingsBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Review Settings Schemas
class ReviewFrequencyEnum(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    custom = "custom"


class ReviewStatusEnum(str, Enum):
    pending = "pending"
    completed = "completed"
    skipped = "skipped"


class ReviewSettingsBase(BaseModel):
    frequency: ReviewFrequencyEnum = Field(default=ReviewFrequencyEnum.weekly, description="复盘频率")
    custom_days: Optional[int] = Field(None, ge=1, le=365, description="自定义周期天数")
    preferred_time: int = Field(default=20, ge=0, le=23, description="偏好复盘时间")
    reminder_enabled: bool = Field(default=True, description="复盘提醒开关")
    include_scores: bool = Field(default=True, description="包含成绩统计")
    include_mistakes: bool = Field(default=True, description="包含错题回顾")
    include_progress: bool = Field(default=True, description="包含学习进度")
    include_suggestions: bool = Field(default=True, description="包含AI学习建议")


class ReviewSettingsCreate(ReviewSettingsBase):
    pass


class ReviewSettingsUpdate(BaseModel):
    frequency: Optional[ReviewFrequencyEnum] = None
    custom_days: Optional[int] = Field(None, ge=1, le=365)
    preferred_time: Optional[int] = Field(None, ge=0, le=23)
    reminder_enabled: Optional[bool] = None
    include_scores: Optional[bool] = None
    include_mistakes: Optional[bool] = None
    include_progress: Optional[bool] = None
    include_suggestions: Optional[bool] = None


class ReviewSettingsResponse(ReviewSettingsBase):
    id: int
    user_id: int
    last_review_date: Optional[datetime]
    next_review_date: Optional[datetime]
    total_reviews: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserReviewBase(BaseModel):
    review_date: datetime
    period_start: datetime
    period_end: datetime
    status: ReviewStatusEnum
    user_notes: Optional[str] = Field(None, description="用户笔记")


class UserReviewCreate(BaseModel):
    user_notes: Optional[str] = Field(None, max_length=2000, description="用户笔记")


class UserReviewUpdate(BaseModel):
    status: Optional[ReviewStatusEnum] = None
    user_notes: Optional[str] = Field(None, max_length=2000)
    completion_duration: Optional[int] = Field(None, ge=0, description="完成耗时（分钟）")


class UserReviewResponse(UserReviewBase):
    id: int
    user_id: int
    score_summary: Optional[dict]
    mistake_analysis: Optional[dict]
    progress_data: Optional[dict]
    ai_suggestions: Optional[str]
    completed_at: Optional[datetime]
    completion_duration: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


# Material Schemas
class MaterialTypeEnum(str, Enum):
    video = "video"
    document = "document"
    audio = "audio"
    link = "link"
    image = "image"


class MaterialStatusEnum(str, Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class MaterialBase(BaseModel):
    title: str = Field(..., max_length=200, description="资料标题")
    description: Optional[str] = Field(None, description="资料描述")
    material_type: MaterialTypeEnum = Field(..., description="资料类型")
    file_url: Optional[str] = Field(None, max_length=500, description="文件URL")
    external_url: Optional[str] = Field(None, max_length=500, description="外部链接")
    content: Optional[str] = Field(None, description="文本内容")
    category: Optional[str] = Field(None, max_length=50, description="分类")
    tags: Optional[List[str]] = Field(default_factory=list, description="标签")
    is_public: bool = Field(default=True, description="是否公开")
    required_subscription: bool = Field(default=False, description="是否需要订阅")
    priority: int = Field(default=0, description="优先级")


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    material_type: Optional[MaterialTypeEnum] = None
    status: Optional[MaterialStatusEnum] = None
    file_url: Optional[str] = Field(None, max_length=500)
    external_url: Optional[str] = Field(None, max_length=500)
    content: Optional[str] = None
    category: Optional[str] = Field(None, max_length=50)
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    required_subscription: Optional[bool] = None
    priority: Optional[int] = None
    sort_order: Optional[int] = None


class MaterialResponse(MaterialBase):
    id: int
    status: MaterialStatusEnum
    file_size: Optional[int]
    duration: Optional[int]
    file_format: Optional[str]
    thumbnail_url: Optional[str]
    sort_order: int
    view_count: int
    download_count: int
    like_count: int
    created_by: int
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]
    
    # 用户相关信息
    is_collected: Optional[bool] = Field(default=False, description="当前用户是否收藏")
    is_liked: Optional[bool] = Field(default=False, description="当前用户是否点赞")
    
    class Config:
        from_attributes = True


class MaterialListResponse(BaseModel):
    materials: List[MaterialResponse]
    total: int
    page: int
    per_page: int
    has_next: bool


class MaterialCollectionCreate(BaseModel):
    material_id: int = Field(..., description="资料ID")
    notes: Optional[str] = Field(None, max_length=1000, description="笔记")


class MaterialCollectionResponse(BaseModel):
    id: int
    user_id: int
    material_id: int
    collected_at: datetime
    notes: Optional[str]
    
    # 嵌入的资料信息
    material: Optional[MaterialResponse] = None
    
    class Config:
        from_attributes = True


class MaterialStatsResponse(BaseModel):
    total_materials: int
    published_count: int
    draft_count: int
    total_views: int
    total_downloads: int
    total_likes: int
    categories: List[dict]  # [{"name": "category", "count": 10}]
    popular_materials: List[MaterialResponse]


# Task Tag Schemas
class TagLevelEnum(str, Enum):
    primary = "primary"
    secondary = "secondary"
    tertiary = "tertiary"


class TaskTagBase(BaseModel):
    name: str = Field(..., max_length=50, description="标签名称")
    level: TagLevelEnum = Field(..., description="标签级别")
    parent_id: Optional[int] = Field(None, description="父标签 ID")
    display_name: Optional[str] = Field(None, max_length=100, description="显示名称")
    description: Optional[str] = Field(None, description="标签描述")
    color: Optional[str] = Field(None, max_length=20, description="显示颜色")
    icon: Optional[str] = Field(None, max_length=50, description="图标")
    sort_order: int = Field(default=0, description="排序顺序")
    is_active: bool = Field(default=True, description="是否启用")


class TaskTagCreate(TaskTagBase):
    pass


class TaskTagUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    display_name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = Field(None, max_length=20)
    icon: Optional[str] = Field(None, max_length=50)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class TaskTagResponse(TaskTagBase):
    id: int
    usage_count: int
    created_at: datetime
    updated_at: datetime
    
    # 子标签（只在需要时返回）
    children: Optional[List['TaskTagResponse']] = Field(default_factory=list)
    
    class Config:
        from_attributes = True


class TaskTagHierarchyResponse(BaseModel):
    primary_tags: List[TaskTagResponse]
    

class TaskTagStatsResponse(BaseModel):
    total_tags: int
    primary_count: int
    secondary_count: int
    tertiary_count: int
    most_used_tags: List[TaskTagResponse]
    
    
# Enhanced Task Schemas with Tags
class TaskCreateWithTags(TaskCreate):
    primary_tag: Optional[str] = Field(None, max_length=50, description="一级标签")
    secondary_tag: Optional[str] = Field(None, max_length=50, description="二级标签")
    tertiary_tags: Optional[List[str]] = Field(default_factory=list, description="三级标签")
    difficulty_level: int = Field(default=1, ge=1, le=5, description="难度级别")
    importance_level: int = Field(default=1, ge=1, le=5, description="重要性级别")


class TaskUpdateWithTags(TaskUpdate):
    primary_tag: Optional[str] = Field(None, max_length=50)
    secondary_tag: Optional[str] = Field(None, max_length=50)
    tertiary_tags: Optional[List[str]] = None
    difficulty_level: Optional[int] = Field(None, ge=1, le=5)
    importance_level: Optional[int] = Field(None, ge=1, le=5)


class TaskInfoWithTags(TaskInfo):
    primary_tag: Optional[str]
    secondary_tag: Optional[str]
    tertiary_tags: Optional[List[str]]
    difficulty_level: int
    importance_level: int