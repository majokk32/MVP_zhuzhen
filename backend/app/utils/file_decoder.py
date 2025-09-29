"""
文件解码工具 - 多文件上传解码解决方案
将前端编码的base64数据解码并保存为文件
"""

import base64
import os
import uuid
from datetime import datetime
from typing import List, Dict, Any
from pathlib import Path

from app.config import settings


class FileDecoder:
    """文件解码器"""
    
    def __init__(self):
        # 支持的图片格式
        self.supported_extensions = {
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'
        }
        
        # MIME类型映射
        self.mime_types = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg', 
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp'
        }
    
    def decode_base64_file(self, base64_data: str, filename: str) -> bytes:
        """
        解码base64数据为文件内容
        
        Args:
            base64_data: base64编码的文件数据
            filename: 文件名
            
        Returns:
            bytes: 解码后的文件内容
        """
        try:
            # 解码base64数据
            file_content = base64.b64decode(base64_data)
            return file_content
        except Exception as e:
            raise ValueError(f"解码文件 {filename} 失败: {str(e)}")
    
    def validate_file(self, filename: str, file_size: int, content: bytes) -> None:
        """
        验证文件
        
        Args:
            filename: 文件名
            file_size: 文件大小
            content: 文件内容
        """
        # 检查文件扩展名
        ext = filename.split('.')[-1].lower() if '.' in filename else ''
        if ext not in self.supported_extensions:
            raise ValueError(f"不支持的文件类型: {ext}")
        
        # 检查文件大小
        if file_size > 10 * 1024 * 1024:  # 10MB
            raise ValueError(f"文件 {filename} 超过10MB限制")
        
        # 检查解码后的内容大小是否匹配
        if len(content) != file_size:
            print(f"⚠️ [DECODER] 文件大小不匹配 - 预期: {file_size}, 实际: {len(content)}")
    
    def create_submission_folder(self, task_id: int, student_id: int) -> str:
        """
        创建提交文件夹
        
        Args:
            task_id: 任务ID
            student_id: 学生ID
            
        Returns:
            str: 文件夹路径
        """
        # 创建时间戳文件夹
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        folder_name = f"task_{task_id}/student_{student_id}/{timestamp}"
        
        # 本地存储路径
        local_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './uploads')
        full_path = os.path.join(local_dir, folder_name)
        
        # 确保目录存在
        os.makedirs(full_path, exist_ok=True)
        
        print(f"📁 [DECODER] 创建文件夹: {full_path}")
        return folder_name
    
    def save_file(self, content: bytes, filename: str, folder_path: str) -> str:
        """
        保存文件到指定文件夹
        
        Args:
            content: 文件内容
            filename: 原始文件名
            folder_path: 文件夹路径
            
        Returns:
            str: 文件的URL路径
        """
        # 生成唯一文件名
        ext = filename.split('.')[-1] if '.' in filename else 'jpg'
        unique_filename = f"{uuid.uuid4().hex}.{ext}"
        
        # 完整文件路径
        local_dir = getattr(settings, 'LOCAL_STORAGE_DIR', './uploads')
        full_file_path = os.path.join(local_dir, folder_path, unique_filename)
        
        # 保存文件
        with open(full_file_path, 'wb') as f:
            f.write(content)
        
        # 返回访问URL
        file_url = f"/uploads/{folder_path}/{unique_filename}"
        print(f"💾 [DECODER] 保存文件: {filename} -> {file_url}")
        
        return file_url
    
    async def decode_and_save_files(
        self, 
        encoded_files: List[Dict[str, Any]], 
        task_id: int, 
        student_id: int
    ) -> Dict[str, Any]:
        """
        解码并保存多个文件
        
        Args:
            encoded_files: 编码文件列表
            task_id: 任务ID
            student_id: 学生ID
            
        Returns:
            Dict: 处理结果
        """
        try:
            print(f"🔄 [DECODER] 开始解码 {len(encoded_files)} 个文件")
            
            # 创建提交文件夹
            folder_path = self.create_submission_folder(task_id, student_id)
            
            saved_files = []
            failed_files = []
            
            for i, file_data in enumerate(encoded_files):
                try:
                    filename = file_data['filename']
                    base64_content = file_data['content']
                    file_size = file_data['size']
                    
                    print(f"📤 [DECODER] 处理文件 {i + 1}/{len(encoded_files)}: {filename}")
                    
                    # 解码文件内容
                    file_content = self.decode_base64_file(base64_content, filename)
                    
                    # 验证文件
                    self.validate_file(filename, file_size, file_content)
                    
                    # 保存文件
                    file_url = self.save_file(file_content, filename, folder_path)
                    
                    saved_files.append({
                        'original_name': filename,
                        'url': file_url,
                        'size': len(file_content),
                        'index': file_data.get('index', i)
                    })
                    
                except Exception as e:
                    print(f"❌ [DECODER] 文件处理失败: {file_data.get('filename', 'unknown')} - {str(e)}")
                    failed_files.append({
                        'filename': file_data.get('filename', 'unknown'),
                        'error': str(e),
                        'index': file_data.get('index', i)
                    })
            
            print(f"✅ [DECODER] 解码完成 - 成功: {len(saved_files)}, 失败: {len(failed_files)}")
            
            return {
                'success': len(failed_files) == 0,
                'folder_path': folder_path,
                'saved_files': saved_files,
                'failed_files': failed_files,
                'total_files': len(encoded_files),
                'saved_count': len(saved_files),
                'failed_count': len(failed_files)
            }
            
        except Exception as e:
            print(f"❌ [DECODER] 解码过程失败: {str(e)}")
            raise e


# 创建全局实例
file_decoder = FileDecoder()