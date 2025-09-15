"""
File storage utilities for Aliyun OSS
"""

import os
import uuid
import oss2
from typing import BinaryIO, Optional
from datetime import datetime
from app.config import settings


class StorageError(Exception):
    """Storage operation error"""
    pass


class OSSStorage:
    """Aliyun OSS storage handler"""
    
    def __init__(self):
        """Initialize OSS client"""
        # Check if OSS credentials are properly configured (not placeholder values)
        oss_configured = (
            settings.OSS_ACCESS_KEY and 
            settings.OSS_SECRET_KEY and 
            settings.OSS_ENDPOINT and 
            settings.OSS_BUCKET and
            settings.OSS_ACCESS_KEY != "your-oss-access-key" and
            settings.OSS_SECRET_KEY != "your-oss-secret-key" and
            not settings.OSS_ACCESS_KEY.startswith("your-") and
            not settings.OSS_SECRET_KEY.startswith("your-")
        )
        
        if not oss_configured or settings.ENVIRONMENT == "development":
            # For development or missing credentials, use local storage
            print(f"[STORAGE] 使用本地存储 (开发环境或OSS未配置)")
            self.use_local = True
            self.local_dir = "uploads"
            os.makedirs(self.local_dir, exist_ok=True)
        else:
            print(f"[STORAGE] 使用阿里云OSS存储")
            self.use_local = False
            try:
                self.auth = oss2.Auth(settings.OSS_ACCESS_KEY, settings.OSS_SECRET_KEY)
                self.bucket = oss2.Bucket(self.auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET)
            except Exception as e:
                print(f"[STORAGE] OSS初始化失败，回退到本地存储: {e}")
                self.use_local = True
                self.local_dir = "uploads"
                os.makedirs(self.local_dir, exist_ok=True)
    
    async def upload_image(self, file_content: bytes, filename: str, 
                          content_type: str = "image/jpeg") -> str:
        """
        Upload image to OSS or local storage
        
        Args:
            file_content: File content as bytes
            filename: Original filename
            content_type: MIME type of the file
        
        Returns:
            URL of the uploaded file
        
        Raises:
            StorageError: If upload fails
        """
        try:
            # Generate unique filename
            ext = filename.split('.')[-1] if '.' in filename else 'jpg'
            date_path = datetime.now().strftime("%Y%m%d")
            unique_filename = f"{uuid.uuid4().hex}.{ext}"
            object_name = f"submissions/{date_path}/{unique_filename}"
            
            if self.use_local:
                # Local storage for development
                local_path = os.path.join(self.local_dir, object_name)
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                
                with open(local_path, 'wb') as f:
                    f.write(file_content)
                
                # Return a local URL (you'll need to serve this via FastAPI)
                return f"/uploads/{object_name}"
            else:
                # Upload to OSS
                result = self.bucket.put_object(
                    object_name, 
                    file_content,
                    headers={'Content-Type': content_type}
                )
                
                if result.status != 200:
                    raise StorageError(f"OSS upload failed with status {result.status}")
                
                # Return public URL
                return f"https://{settings.OSS_BUCKET}.{settings.OSS_ENDPOINT}/{object_name}"
                
        except Exception as e:
            raise StorageError(f"Failed to upload file: {str(e)}")
    
    async def delete_file(self, file_url: str) -> bool:
        """
        Delete file from storage
        
        Args:
            file_url: URL of the file to delete
        
        Returns:
            True if successful
        """
        try:
            if self.use_local:
                # Extract local path from URL
                if file_url.startswith("/uploads/"):
                    local_path = file_url.replace("/uploads/", "")
                    full_path = os.path.join(self.local_dir, local_path)
                    if os.path.exists(full_path):
                        os.remove(full_path)
                    return True
            else:
                # Extract object name from URL
                object_name = file_url.split(f"{settings.OSS_BUCKET}.{settings.OSS_ENDPOINT}/")[-1]
                self.bucket.delete_object(object_name)
                return True
                
        except Exception:
            # Silently fail for delete operations
            return False
    
    async def get_upload_token(self) -> Optional[dict]:
        """
        Get STS token for direct upload from client (advanced feature)
        
        Returns:
            STS token configuration or None
        """
        # TODO: Implement STS token generation for direct client uploads
        # This is an optimization for later
        return None


# Global storage instance
storage = OSSStorage()