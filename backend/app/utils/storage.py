"""
Enhanced file storage utilities with organized structure
支持图片、文件、文字上传，按任务-学生-时间组织文件
For Docker development: Using local storage only
"""

import os
import re
import uuid
# import oss2  # Commented for Docker development
from typing import BinaryIO, Optional, List, Dict
from datetime import datetime
from app.config import settings


class StorageError(Exception):
    """Storage operation error"""
    pass


class EnhancedStorage:
    """增强的文件存储管理器，支持多文件类型和组织化结构"""
    
    def __init__(self):
        """Initialize storage with local fallback (Docker mode)"""
        # For Docker development, always use local storage
        print(f"[STORAGE] 使用本地存储 (Docker开发环境)")
        self.use_local = True
        self.local_dir = "uploads"
        os.makedirs(self.local_dir, exist_ok=True)
        
        # OSS configuration commented out for Docker development
        # oss_configured = (
        #     settings.OSS_ACCESS_KEY and 
        #     settings.OSS_SECRET_KEY and 
        #     settings.OSS_ENDPOINT and 
        #     settings.OSS_BUCKET and
        #     settings.OSS_ACCESS_KEY != "your-oss-access-key" and
        #     settings.OSS_SECRET_KEY != "your-oss-secret-key" and
        #     not settings.OSS_ACCESS_KEY.startswith("your-") and
        #     not settings.OSS_SECRET_KEY.startswith("your-")
        # )
        
        # if not oss_configured or settings.ENVIRONMENT == "development":
        #     print(f"[STORAGE] 使用本地存储 (开发环境或OSS未配置)")
        #     self.use_local = True
        #     self.local_dir = "uploads"
        #     os.makedirs(self.local_dir, exist_ok=True)
        # else:
        #     print(f"[STORAGE] 使用阿里云OSS存储")
        #     self.use_local = False
        #     try:
        #         self.auth = oss2.Auth(settings.OSS_ACCESS_KEY, settings.OSS_SECRET_KEY)
        #         self.bucket = oss2.Bucket(self.auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET)
        #     except Exception as e:
        #         print(f"[STORAGE] OSS初始化失败，回退到本地存储: {e}")
        #         self.use_local = True
        #         self.local_dir = "uploads"
        #         os.makedirs(self.local_dir, exist_ok=True)
    
    def _sanitize_filename(self, filename: str) -> str:
        """Make filename safe for storage"""
        # Remove/replace unsafe characters
        safe_name = re.sub(r'[^\w\-_.]', '_', filename)
        return safe_name[:100]  # Limit length
    
    def _get_file_type_info(self, filename: str, content_type: str = None) -> tuple:
        """
        Determine file type and appropriate content type
        Returns: (file_type, content_type, max_size_mb)
        """
        ext = filename.lower().split('.')[-1] if '.' in filename else ''
        
        # Image files
        if ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']:
            # 正确的MIME类型映射
            image_types = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'bmp': 'image/bmp'
            }
            return 'image', content_type or image_types.get(ext, 'image/jpeg'), 10
        
        # Document files  
        elif ext in ['pdf', 'doc', 'docx', 'txt', 'rtf']:
            content_types = {
                'pdf': 'application/pdf',
                'doc': 'application/msword', 
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'txt': 'text/plain',
                'rtf': 'application/rtf'
            }
            return 'document', content_types.get(ext, 'application/octet-stream'), 10
        
        # Other files
        else:
            return 'file', content_type or 'application/octet-stream', 10

    def _generate_submission_path(self, task_id: int, student_id: int, 
                                 submission_time: datetime, filename: str) -> str:
        """
        Generate organized file path: task_id/student_id/timestamp/filename
        """
        time_folder = submission_time.strftime("%Y-%m-%d_%H-%M-%S")
        safe_filename = self._sanitize_filename(filename)
        
        return f"task_{task_id}/student_{student_id}/{time_folder}/{safe_filename}"

    async def get_submission_count(self, task_id: int, student_id: int) -> int:
        """
        Get the number of submissions a student has made for a task
        """
        try:
            # Always use local storage in Docker mode
            import glob
            pattern = f"{self.local_dir}/task_{task_id}/student_{student_id}/*"
            submission_dirs = glob.glob(pattern)
            return len([d for d in submission_dirs if os.path.isdir(d)])
            
        except Exception as e:
            print(f"Failed to get submission count: {e}")
            return 0

    async def create_submission_folder(self, task_id: int, student_id: int, 
                                     submission_time: datetime = None) -> tuple:
        """
        Create a new submission folder and return the folder path and count
        
        Returns:
            Tuple of (folder_path, submission_count)
        """
        if not submission_time:
            submission_time = datetime.now()
            
        time_folder = submission_time.strftime("%Y-%m-%d_%H-%M-%S")
        folder_path = f"task_{task_id}/student_{student_id}/{time_folder}"
        
        # Always use local storage in Docker mode
        full_path = os.path.join(self.local_dir, folder_path)
        os.makedirs(full_path, exist_ok=True)
        
        # Get updated count after creating folder
        count = await self.get_submission_count(task_id, student_id)
        
        return folder_path, count

    async def upload_submission_file(self, file_content: bytes, filename: str,
                                   task_id: int, student_id: int, 
                                   submission_time: datetime = None,
                                   content_type: str = None) -> str:
        """
        Upload submission file with organized folder structure
        
        Returns:
            URL of the uploaded file
            
        Raises:
            StorageError: If upload fails or file too large
        """
        try:
            if not submission_time:
                submission_time = datetime.now()
            
            # Check file size (10MB limit)
            if len(file_content) > 10 * 1024 * 1024:
                raise StorageError(f"File size exceeds 10MB limit")
            
            # Get file type info
            file_type, detected_content_type, max_size = self._get_file_type_info(filename, content_type)
            
            # Generate organized path
            object_name = self._generate_submission_path(task_id, student_id, submission_time, filename)
            
            # Always use local storage in Docker mode
            local_path = os.path.join(self.local_dir, object_name)
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            with open(local_path, 'wb') as f:
                f.write(file_content)
            
            # Return a local URL
            return f"/uploads/{object_name}"
            
            # OSS upload code commented out for Docker development
            # else:
            #     # Upload to OSS
            #     result = self.bucket.put_object(
            #         object_name, 
            #         file_content,
            #         headers={'Content-Type': detected_content_type}
            #     )
            #     
            #     if result.status != 200:
            #         raise StorageError(f"OSS upload failed with status {result.status}")
            #     
            #     # Return public URL
            #     return f"https://{settings.OSS_BUCKET}.{settings.OSS_ENDPOINT}/{object_name}"
                
        except Exception as e:
            raise StorageError(f"Failed to upload file: {str(e)}")

    async def upload_files_to_submission(self, files_data: List[Dict], task_id: int, 
                                       student_id: int, submission_time: datetime = None) -> Dict:
        """
        Upload multiple files to a submission folder
        
        Args:
            files_data: List of {'content': bytes, 'filename': str, 'content_type': str}
            task_id: Task ID
            student_id: Student ID
            submission_time: Submission timestamp
            
        Returns:
            Dict with upload results and submission count
        """
        if not submission_time:
            submission_time = datetime.now()
            
        # Create submission folder first
        folder_path, submission_count = await self.create_submission_folder(
            task_id, student_id, submission_time
        )
        
        uploaded_files = []
        failed_files = []
        
        for file_data in files_data:
            try:
                file_url = await self.upload_submission_file(
                    file_data['content'],
                    file_data['filename'], 
                    task_id,
                    student_id,
                    submission_time,
                    file_data.get('content_type')
                )
                
                uploaded_files.append({
                    'filename': file_data['filename'],
                    'url': file_url,
                    'size': len(file_data['content']),
                    'file_type': self._get_file_type_info(file_data['filename'])[0]
                })
                
            except StorageError as e:
                failed_files.append({
                    'filename': file_data['filename'],
                    'error': str(e)
                })
        
        return {
            'submission_count': submission_count,
            'folder_path': folder_path,
            'uploaded_files': uploaded_files,
            'failed_files': failed_files,
            'success': len(failed_files) == 0,
            'submission_time': submission_time.isoformat()
        }

    async def upload_image(self, file_content: bytes, filename: str, 
                          content_type: str = "image/jpeg") -> str:
        """
        Upload image to storage (legacy method for backward compatibility)
        """
        try:
            # Generate unique filename
            ext = filename.split('.')[-1] if '.' in filename else 'jpg'
            date_path = datetime.now().strftime("%Y%m%d")
            unique_filename = f"{uuid.uuid4().hex}.{ext}"
            object_name = f"submissions/{date_path}/{unique_filename}"
            
            # Always use local storage in Docker mode
            local_path = os.path.join(self.local_dir, object_name)
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            with open(local_path, 'wb') as f:
                f.write(file_content)
            
            # Return a local URL
            return f"/uploads/{object_name}"
            
            # OSS upload code commented out for Docker development
            # else:
            #     # Upload to OSS
            #     result = self.bucket.put_object(
            #         object_name, 
            #         file_content,
            #         headers={'Content-Type': content_type}
            #     )
            #     
            #     if result.status != 200:
            #         raise StorageError(f"OSS upload failed with status {result.status}")
            #     
            #     # Return public URL
            #     return f"https://{settings.OSS_BUCKET}.{settings.OSS_ENDPOINT}/{object_name}"
                
        except Exception as e:
            raise StorageError(f"Failed to upload file: {str(e)}")

    async def delete_file(self, file_url: str) -> bool:
        """Delete file from storage"""
        try:
            # Always use local storage in Docker mode
            if file_url.startswith("/uploads/"):
                local_path = file_url.replace("/uploads/", "")
                full_path = os.path.join(self.local_dir, local_path)
                if os.path.exists(full_path):
                    os.remove(full_path)
                return True
                
            # OSS delete code commented out for Docker development
            # else:
            #     # Extract object name from URL
            #     object_name = file_url.split(f"{settings.OSS_BUCKET}.{settings.OSS_ENDPOINT}/")[-1]
            #     self.bucket.delete_object(object_name)
            #     return True
                
        except Exception:
            return False

    async def get_upload_token(self) -> Optional[dict]:
        """Get STS token for direct upload (placeholder for future)"""
        return None


# Global instances for backward compatibility
storage = EnhancedStorage()
enhanced_storage = storage