"""
Configuration management using pydantic-settings
"""

from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # Basic settings
    PROJECT_NAME: str = "公考督学助手"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/app.db"
    
    # WeChat Mini Program
    WX_APPID: str = ""
    WX_SECRET: str = ""
    WECHAT_APPID: str = ""  # 兼容新的命名规范
    WECHAT_SECRET: str = ""
    WECHAT_APP_ID: str = ""  # Additional alias
    WECHAT_APP_SECRET: str = ""  # Additional alias
    
    # WeChat Template Message IDs
    WECHAT_GRADE_TEMPLATE_ID: str = ""  # 作业批改完成通知模板ID
    WECHAT_DEADLINE_TEMPLATE_ID: str = ""  # 课前作业截止提醒模板ID
    WECHAT_NEWTASK_TEMPLATE_ID: str = ""  # 新任务发布通知模板ID (V2.0)
    WECHAT_NEW_TASK_TEMPLATE_ID: str = ""  # Additional alias
    
    # Mini Program Domain
    MINIPROGRAM_DOMAIN: str = ""  # 小程序域名，用于跳转链接
    
    # Aliyun OSS
    OSS_ACCESS_KEY: str = ""
    OSS_SECRET_KEY: str = ""
    OSS_ENDPOINT: str = "oss-cn-shanghai.aliyuncs.com"
    OSS_BUCKET: str = "zhuzhen"
    
    # CORS settings
    CORS_ORIGINS: str = '["*"]'  # Will be parsed as JSON
    
    # File upload settings
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "application/octet-stream"]
    MAX_IMAGES_PER_SUBMISSION: int = 6
    
    # API settings
    API_V1_STR: str = "/api/v1"
    
    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./logs/app.log"
    
    # Redis/Cache
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_ENABLED: bool = False
    
    # Scheduler
    SCHEDULER_ENABLED: bool = True
    DEADLINE_REMINDER_HOURS: int = 2
    
    # Deployment
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 1
    
    # Security
    SECURE_COOKIES: bool = False
    HTTPS_ONLY: bool = False
    
    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "allow"  # Allow extra fields from .env
    }


settings = Settings()