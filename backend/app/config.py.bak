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
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/app.db"
    
    # WeChat Mini Program
    WX_APPID: str = ""
    WX_SECRET: str = ""
    
    # Aliyun OSS
    OSS_ACCESS_KEY: str = ""
    OSS_SECRET_KEY: str = ""
    OSS_ENDPOINT: str = "oss-cn-shanghai.aliyuncs.com"
    OSS_BUCKET: str = "zhuzhen"
    
    # CORS settings
    CORS_ORIGINS: str = '["*"]'  # Will be parsed as JSON
    
    # File upload settings
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    MAX_IMAGES_PER_SUBMISSION: int = 6
    
    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()