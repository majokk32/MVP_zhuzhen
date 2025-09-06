"""
Database models for the application
All models in one file for simplicity
"""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Enum as SQLEnum, Float
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
import enum


class UserRole(str, enum.Enum):
    STUDENT = "student"
    TEACHER = "teacher"


class TaskStatus(str, enum.Enum):
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
    PENDING = "待复盘"
    GOOD = "优秀"
    EXCELLENT = "极佳"


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    openid = Column(String(100), unique=True, index=True, nullable=False)
    unionid = Column(String(100), unique=True, index=True, nullable=True)
    nickname = Column(String(50), nullable=False)
    avatar = Column(String(500), nullable=True)
    phone = Column(String(20), nullable=True)
    role = Column(SQLEnum(UserRole), default=UserRole.STUDENT, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    created_tasks = relationship("Task", back_populates="creator", foreign_keys="Task.created_by")
    submissions = relationship("Submission", back_populates="student", foreign_keys="Submission.student_id")
    graded_submissions = relationship("Submission", back_populates="grader", foreign_keys="Submission.graded_by")


class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    course = Column(String(100), nullable=False)
    desc = Column(Text, nullable=False)
    total_score = Column(Float, default=40, nullable=False)  # 总分
    deadline = Column(DateTime, nullable=True)
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
    submissions = relationship("Submission", back_populates="task", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"
    
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Submission content
    images = Column(Text, nullable=False)  # JSON array of image URLs
    text = Column(Text, nullable=True)  # Optional text content
    submit_count = Column(Integer, default=1, nullable=False)  # 第几次提交 (max 3)
    
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

# 增强数据模型 - 新增表
from sqlalchemy import JSON, Boolean

class NotificationStatus(str, enum.Enum):
    PENDING = "pending"     # 待发送
    SENT = "sent"          # 已发送
    FAILED = "failed"      # 发送失败


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


