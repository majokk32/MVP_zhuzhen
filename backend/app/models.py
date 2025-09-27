"""
Database models for the application
All models in one file for simplicity
"""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Enum as SQLEnum, Float, Date, Boolean, JSON
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime, date
import enum


class UserRole(str, enum.Enum):
    STUDENT = "student"
    TEACHER = "teacher"


class SubscriptionType(str, enum.Enum):
    TRIAL = "TRIAL"        # 试用用户 (7天试用期)
    PREMIUM = "PREMIUM"    # 付费用户
    EXPIRED = "EXPIRED"    # 过期用户


class TaskStatus(str, enum.Enum):
    DRAFT = "draft"
    ONGOING = "ongoing" 
    ENDED = "ended"


class TaskType(str, enum.Enum):
    LIVE = "live"  # 直播课
    EXTRA = "extra"  # 课后加餐
    NORMAL = "normal"  # 普通任务


class SubmissionStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    GRADED = "graded"


class Grade(str, enum.Enum):
    REVIEW = "review"
    GOOD = "good"
    EXCELLENT = "excellent"


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    openid = Column(String(100), unique=True, index=True, nullable=False)
    unionid = Column(String(100), unique=True, index=True, nullable=True)
    nickname = Column(String(50), nullable=False)
    avatar = Column(String(500), nullable=True)
    phone = Column(String(20), nullable=True)
    role = Column(SQLEnum(UserRole), default=UserRole.STUDENT, nullable=False)
    
    # V1.0 学习数据统计字段
    current_streak = Column(Integer, default=0, nullable=False)  # 当前连续学习天数
    best_streak = Column(Integer, default=0, nullable=False)     # 历史最佳连续天数
    total_score = Column(Integer, default=0, nullable=False)     # 累计积分
    monthly_score = Column(Integer, default=0, nullable=False)   # 月度积分
    quarterly_score = Column(Integer, default=0, nullable=False) # 季度积分
    last_checkin_date = Column(Date, nullable=True)             # 最后打卡日期
    total_submissions = Column(Integer, default=0, nullable=False)  # 累计提交次数
    
    # V1.0 订阅和权限控制字段
    subscription_type = Column(SQLEnum(SubscriptionType), default=SubscriptionType.TRIAL, nullable=False)  # 订阅类型
    subscription_expires_at = Column(DateTime, nullable=True)  # 订阅到期时间
    trial_started_at = Column(DateTime, nullable=True)  # 试用开始时间
    is_active = Column(Boolean, default=True, nullable=False)  # 账户状态
    
    # 技术预留：V2.0徽章相关字段
    # achievements = Column(JSON, default=list, nullable=False)    # 已获得徽章列表
    # notification_enabled = Column(Boolean, default=True, nullable=False)  # 通知开关
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    created_tasks = relationship("Task", back_populates="creator", foreign_keys="Task.created_by")
    task_tag_usages = relationship("TaskTagUsage", back_populates="creator")
    submissions = relationship("Submission", back_populates="student", foreign_keys="Submission.student_id")
    graded_submissions = relationship("Submission", back_populates="grader", foreign_keys="Submission.graded_by")
    checkins = relationship("UserCheckin", back_populates="user")
    score_records = relationship("UserScoreRecord", back_populates="user")
    notification_settings = relationship("NotificationSettings", back_populates="user", uselist=False)
    review_settings = relationship("ReviewSettings", back_populates="user", uselist=False)


class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    course = Column(String(100), nullable=False)
    desc = Column(Text, nullable=False)
    total_score = Column(Float, default=40, nullable=False)  # 总分
    deadline = Column(DateTime, nullable=True)  # 截止时间
    live_start_time = Column(DateTime, nullable=True)  # 直播开始时间
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.ONGOING, nullable=False)
    task_type = Column(SQLEnum(TaskType), default=TaskType.LIVE, nullable=False)  # 任务类型
    
    # 预留字段（为后续版本功能）
    suite_id = Column(String(50), nullable=True, index=True)  # 套题ID
    paper_name = Column(String(100), nullable=True)  # 试卷名称
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    creator = relationship("User", back_populates="created_tasks", foreign_keys=[created_by])
    tag_usages = relationship("TaskTagUsage", back_populates="task")
    submissions = relationship("Submission", back_populates="task", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Submission content
    images = Column(JSON, nullable=False)  # JSON array of image URLs
    photo_paths = Column(JSON, nullable=True)  # JSON array of local photo paths
    text = Column(Text, nullable=True)  # Optional text content
    submit_count = Column(Integer, default=1, nullable=False)  # 第几次提交 (max 3)
    
    # Task timing information (cached from task at submission time)
    live_start_time = Column(DateTime, nullable=True)  # 直播开始时间（提交时缓存）
    
    # Grading information
    status = Column(SQLEnum(SubmissionStatus), default=SubmissionStatus.SUBMITTED, nullable=False)
    score = Column(Float, nullable=True)  # 实际得分
    grade = Column(SQLEnum(Grade), nullable=True)  # 评价档位
    comment = Column(Text, nullable=True)  # 老师评语
    graded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    graded_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    task = relationship("Task", back_populates="submissions")
    student = relationship("User", back_populates="submissions", foreign_keys=[student_id])
    grader = relationship("User", back_populates="graded_submissions", foreign_keys=[graded_by])
    
    # Composite index for faster queries
    __table_args__ = (
        # Ensure one student can only have one active submission per task
        # (We'll handle multiple submissions in application logic)
        {"mysql_engine": "InnoDB"}
    )

# V1.0 学习数据统计相关枚举
class CheckinType(str, enum.Enum):
    TASK_VIEW = "task_view"          # 查看任务详情
    COLLECTION_VIEW = "collection_view"  # 查看收藏资料
    REVIEW_COMPLETE = "review_complete"  # 完成复盘操作
    SUBMISSION = "submission"            # 提交作业


class ScoreType(str, enum.Enum):
    SUBMISSION = "submission"        # 提交作业 +1分
    GOOD_GRADE = "good_grade"       # 优秀评价 +2分
    EXCELLENT_GRADE = "excellent_grade"  # 极佳评价 +5分
    STREAK_BONUS = "streak_bonus"   # 连续打卡奖励
    REVIEW_COMPLETE = "review_complete"  # 复盘完成 +1分

class NotificationStatus(str, enum.Enum):
    PENDING = "pending"     # 待发送
    SENT = "sent"          # 已发送
    FAILED = "failed"      # 发送失败


class ReviewFrequency(str, enum.Enum):
    DAILY = "daily"        # 每日复盘
    WEEKLY = "weekly"      # 每周复盘 
    MONTHLY = "monthly"    # 每月复盘
    CUSTOM = "custom"      # 自定义周期


class ReviewStatus(str, enum.Enum):
    PENDING = "pending"    # 待复盘
    COMPLETED = "completed"  # 已完成
    SKIPPED = "skipped"    # 已跳过


class MaterialType(str, enum.Enum):
    VIDEO = "video"        # 视频资料
    DOCUMENT = "document"  # 文档资料
    AUDIO = "audio"        # 音频资料
    LINK = "link"          # 链接资料
    IMAGE = "image"        # 图片资料


class MaterialStatus(str, enum.Enum):
    DRAFT = "draft"        # 草稿
    PUBLISHED = "published"  # 已发布
    ARCHIVED = "archived"   # 已归档


class Notification(Base):
    """通知记录表"""
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # 通知类型和内容
    notification_type = Column(String(50), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    
    # 关联信息
    related_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    related_submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=True)
    
    # 发送状态
    status = Column(SQLEnum(NotificationStatus), default=NotificationStatus.PENDING, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User")
    task = relationship("Task")
    submission = relationship("Submission")


class ShareRecord(Base):
    """分享记录表"""
    __tablename__ = "share_records"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    shared_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 分享信息
    share_code = Column(String(50), nullable=False, unique=True, index=True)
    share_channel = Column(String(20), default="wechat", nullable=False)
    view_count = Column(Integer, default=0, nullable=False)
    conversion_count = Column(Integer, default=0, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    
    # Relationships
    task = relationship("Task")
    user = relationship("User")


# V1.0 学习数据统计核心表
class UserCheckin(Base):
    """用户打卡记录表 - 追踪每日学习活动"""
    __tablename__ = "user_checkins"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    checkin_date = Column(Date, nullable=False, index=True)
    checkin_type = Column(SQLEnum(CheckinType), nullable=False)
    
    # 关联信息（用于追踪具体行为）
    related_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    related_submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="checkins")
    task = relationship("Task")
    submission = relationship("Submission")
    
    # 复合索引：确保同一用户同一天不重复打卡
    __table_args__ = (
        {"mysql_engine": "InnoDB"},
    )


class UserScoreRecord(Base):
    """用户积分记录表 - 详细记录每次积分获得"""
    __tablename__ = "user_score_records"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    score_type = Column(SQLEnum(ScoreType), nullable=False)
    score_value = Column(Integer, nullable=False)  # 本次获得的积分
    description = Column(String(200), nullable=False)  # 积分获得说明
    
    # 时间维度（用于月度/季度统计）
    record_date = Column(Date, nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    quarter = Column(Integer, nullable=False, index=True)
    
    # 关联信息
    related_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    related_submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="score_records")
    task = relationship("Task")
    submission = relationship("Submission")


# V2.0 技术预留：成就徽章系统相关表
# 注意：以下表结构仅作为技术预留，V1.0不实现具体业务逻辑
class BadgeCategory(str, enum.Enum):
    BEGINNER = "beginner"    # 入门系列
    PERSISTENCE = "persistence"  # 坚持系列
    QUALITY = "quality"      # 质量系列
    COMPLETION = "completion"  # 完成系列


class BadgeRarity(str, enum.Enum):
    COMMON = "common"        # 普通级
    RARE = "rare"           # 稀有级
    EPIC = "epic"           # 史诗级
    LEGENDARY = "legendary"  # 传说级


# class Badge(Base):
#     """徽章定义表 - V2.0技术预留"""
#     __tablename__ = "badges"
#     
#     id = Column(Integer, primary_key=True, index=True)
#     name = Column(String(50), nullable=False)  # 徽章名称
#     description = Column(String(200), nullable=False)  # 徽章描述
#     icon = Column(String(50), nullable=False)  # 徽章图标
#     category = Column(SQLEnum(BadgeCategory), nullable=False)
#     rarity = Column(SQLEnum(BadgeRarity), nullable=False)
#     
#     # 获得条件（JSON格式存储）
#     unlock_conditions = Column(JSON, nullable=False)
#     
#     is_active = Column(Boolean, default=True, nullable=False)
#     created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


# class UserBadge(Base):
#     """用户徽章关联表 - V2.0技术预留"""
#     __tablename__ = "user_badges"
#     
#     id = Column(Integer, primary_key=True, index=True)
#     user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
#     badge_id = Column(Integer, ForeignKey("badges.id"), nullable=False)
#     
#     # 获得时间和情境
#     earned_at = Column(DateTime, default=datetime.utcnow, nullable=False)
#     trigger_data = Column(JSON, nullable=True)  # 触发条件的具体数据
#     
#     # Relationships
#     user = relationship("User")
#     badge = relationship("Badge")


class NotificationSettings(Base):
    """用户通知设置表"""
    __tablename__ = "notification_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    
    # 通知开关
    grade_complete_enabled = Column(Boolean, default=True, nullable=False)  # 作业批改完成通知
    deadline_reminder_enabled = Column(Boolean, default=True, nullable=False)  # 课前截止提醒
    new_task_enabled = Column(Boolean, default=True, nullable=False)  # 新任务发布通知 (V2.0)
    streak_break_reminder = Column(Boolean, default=True, nullable=False)  # 连续打卡中断提醒
    
    # 通知时间设置
    quiet_hours_start = Column(Integer, default=22, nullable=False)  # 免打扰开始时间（小时）
    quiet_hours_end = Column(Integer, default=8, nullable=False)  # 免打扰结束时间（小时）
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="notification_settings")


class ReviewSettings(Base):
    """用户复盘设置表"""
    __tablename__ = "review_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    
    # 复盘频率设置
    frequency = Column(SQLEnum(ReviewFrequency), default=ReviewFrequency.WEEKLY, nullable=False)
    custom_days = Column(Integer, nullable=True)  # 自定义周期天数（frequency=CUSTOM时使用）
    
    # 复盘时间设置
    preferred_time = Column(Integer, default=20, nullable=False)  # 偏好复盘时间（小时，0-23）
    reminder_enabled = Column(Boolean, default=True, nullable=False)  # 复盘提醒开关
    
    # 复盘内容设置
    include_scores = Column(Boolean, default=True, nullable=False)  # 包含成绩统计
    include_mistakes = Column(Boolean, default=True, nullable=False)  # 包含错题回顾
    include_progress = Column(Boolean, default=True, nullable=False)  # 包含学习进度
    include_suggestions = Column(Boolean, default=True, nullable=False)  # 包含学习建议
    
    # 复盘历史追踪
    last_review_date = Column(Date, nullable=True)  # 最后复盘日期
    next_review_date = Column(Date, nullable=True)  # 下次复盘日期
    total_reviews = Column(Integer, default=0, nullable=False)  # 总复盘次数
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="review_settings")
    reviews = relationship("UserReview", back_populates="settings")


class UserReview(Base):
    """用户复盘记录表"""
    __tablename__ = "user_reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    settings_id = Column(Integer, ForeignKey("review_settings.id"), nullable=False)
    
    # 复盘基本信息
    review_date = Column(Date, nullable=False, index=True)  # 复盘日期
    period_start = Column(Date, nullable=False)  # 复盘周期开始日期
    period_end = Column(Date, nullable=False)    # 复盘周期结束日期
    status = Column(SQLEnum(ReviewStatus), default=ReviewStatus.PENDING, nullable=False)
    
    # 复盘内容（JSON格式存储）
    score_summary = Column(JSON, nullable=True)      # 成绩汇总数据
    mistake_analysis = Column(JSON, nullable=True)   # 错题分析数据
    progress_data = Column(JSON, nullable=True)      # 学习进度数据
    ai_suggestions = Column(Text, nullable=True)     # AI生成的学习建议
    user_notes = Column(Text, nullable=True)         # 用户自己的复盘笔记
    
    # 复盘完成信息
    completed_at = Column(DateTime, nullable=True)   # 完成时间
    completion_duration = Column(Integer, nullable=True)  # 完成耗时（分钟）
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User")
    settings = relationship("ReviewSettings", back_populates="reviews")


class Material(Base):
    """课后加餐资料表"""
    __tablename__ = "materials"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    material_type = Column(SQLEnum(MaterialType), nullable=False)
    status = Column(SQLEnum(MaterialStatus), default=MaterialStatus.DRAFT, nullable=False)
    
    # 资料内容
    file_url = Column(String(500), nullable=True)  # 文件URL（视频、文档、音频、图片）
    external_url = Column(String(500), nullable=True)  # 外部链接（链接类型）
    content = Column(Text, nullable=True)  # 文本内容（文档类型的补充）
    
    # 元数据
    file_size = Column(Integer, nullable=True)  # 文件大小（字节）
    duration = Column(Integer, nullable=True)   # 时长（秒，用于视频/音频）
    file_format = Column(String(20), nullable=True)  # 文件格式
    thumbnail_url = Column(String(500), nullable=True)  # 缩略图
    
    # 分类和标签
    category = Column(String(50), nullable=True, index=True)  # 分类（理论、真题、技巧等）
    tags = Column(JSON, nullable=True)  # 标签数组
    
    # 优先级和排序
    priority = Column(Integer, default=0, nullable=False)  # 优先级（数字越大优先级越高）
    sort_order = Column(Integer, default=0, nullable=False)  # 排序顺序
    
    # 访问控制
    is_public = Column(Boolean, default=True, nullable=False)  # 是否公开
    required_subscription = Column(Boolean, default=False, nullable=False)  # 是否需要付费订阅
    
    # 统计信息
    view_count = Column(Integer, default=0, nullable=False)  # 查看次数
    download_count = Column(Integer, default=0, nullable=False)  # 下载次数
    like_count = Column(Integer, default=0, nullable=False)  # 点赞数
    
    # 创建信息
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 发布时间（状态变为已发布时设置）
    published_at = Column(DateTime, nullable=True)
    
    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    collections = relationship("MaterialCollection", back_populates="material")
    views = relationship("MaterialView", back_populates="material")
    likes = relationship("MaterialLike", back_populates="material")
    
    # 索引
    __table_args__ = (
        {"mysql_engine": "InnoDB"},
    )


class MaterialCollection(Base):
    """用户资料收藏表"""
    __tablename__ = "material_collections"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    
    # 收藏信息
    collected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)  # 用户笔记
    
    # Relationships
    user = relationship("User")
    material = relationship("Material", back_populates="collections")
    
    # 唯一约束：同一用户不能重复收藏同一资料
    __table_args__ = (
        {"mysql_engine": "InnoDB"},
    )


class MaterialView(Base):
    """资料查看记录表"""
    __tablename__ = "material_views"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    
    # 查看信息
    viewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    duration = Column(Integer, nullable=True)  # 查看时长（秒）
    progress = Column(Float, nullable=True)    # 查看进度（0-1）
    
    # 设备信息
    device_info = Column(String(200), nullable=True)  # 设备信息
    user_agent = Column(String(500), nullable=True)   # 浏览器信息
    
    # Relationships
    user = relationship("User")
    material = relationship("Material", back_populates="views")
    
    # 索引
    __table_args__ = (
        {"mysql_engine": "InnoDB"},
    )


class MaterialLike(Base):
    """资料点赞记录表"""
    __tablename__ = "material_likes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)
    
    # 点赞信息
    liked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User")
    material = relationship("Material", back_populates="likes")
    
    # 唯一约束：同一用户不能重复点赞同一资料
    __table_args__ = (
        {"mysql_engine": "InnoDB"},
    )


# Task Tag related enums and models
class TagLevel(str, enum.Enum):
    PRIMARY = "primary"      # 一级标签
    SECONDARY = "secondary"  # 二级标签
    TERTIARY = "tertiary"    # 三级标签


class TaskTag(Base):
    """任务标签表"""
    __tablename__ = "task_tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, index=True)
    level = Column(SQLEnum(TagLevel), nullable=False)
    parent_id = Column(Integer, ForeignKey("task_tags.id"), nullable=True)
    
    # 显示信息
    display_name = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)  # 显示颜色
    icon = Column(String(50), nullable=True)   # 图标
    
    # 排序和状态
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # 统计信息
    usage_count = Column(Integer, default=0, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    parent = relationship("TaskTag", remote_side=[id], backref="children")
    usages = relationship("TaskTagUsage", back_populates="tag")


class TaskTagUsage(Base):
    """任务标签使用关系表"""
    __tablename__ = "task_tag_usages"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey("task_tags.id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    task = relationship("Task", back_populates="tag_usages")
    tag = relationship("TaskTag", back_populates="usages")
    creator = relationship("User", back_populates="task_tag_usages")


