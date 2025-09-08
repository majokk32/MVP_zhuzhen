// components/enhanced-uploader/enhanced-uploader.js
/**
 * 增强型图片上传组件
 * 提供拖拽上传、批量上传、智能压缩、进度显示等功能
 */
const imageOptimizer = require('../../utils/image-optimizer');

Component({
  properties: {
    // 最大上传数量
    maxCount: {
      type: Number,
      value: 9
    },
    
    // 最大文件大小（MB）
    maxSize: {
      type: Number,
      value: 10
    },
    
    // 支持的文件类型
    acceptTypes: {
      type: Array,
      value: ['jpg', 'jpeg', 'png', 'webp']
    },
    
    // 是否启用图片压缩
    enableCompress: {
      type: Boolean,
      value: true
    },
    
    // 压缩质量 (0.1-1.0)
    compressQuality: {
      type: Number,
      value: 0.8
    },
    
    // 是否启用批量上传
    enableBatch: {
      type: Boolean,
      value: true
    },
    
    // 上传按钮文字
    buttonText: {
      type: String,
      value: '选择图片'
    },
    
    // 是否显示上传提示
    showTips: {
      type: Boolean,
      value: true
    },
    
    // 网格布局列数
    columns: {
      type: Number,
      value: 3
    },
    
    // 是否禁用
    disabled: {
      type: Boolean,
      value: false
    },
    
    // 自定义上传函数
    customUpload: {
      type: Function,
      value: null
    }
  },

  data: {
    // 上传文件列表
    fileList: [],
    
    // 上传状态
    uploading: false,
    uploadProgress: 0,
    
    // 预览相关
    previewIndex: 0,
    showPreview: false,
    
    // 拖拽相关
    dragOver: false,
    dragCounter: 0,
    
    // 错误信息
    errorMessage: '',
    showError: false,
    
    // 批量操作
    selectedFiles: [],
    showBatchActions: false,
    
    // 统计信息
    totalSize: 0,
    compressedSize: 0,
    compressionRatio: 0
  },

  methods: {
    /**
     * 选择图片
     */
    chooseImages() {
      if (this.properties.disabled || this.data.uploading) return;
      
      const remaining = this.properties.maxCount - this.data.fileList.length;
      if (remaining <= 0) {
        this.showErrorMessage(`最多只能上传${this.properties.maxCount}张图片`);
        return;
      }

      wx.chooseMedia({
        count: Math.min(remaining, 9),
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          this.handleSelectedFiles(res.tempFiles);
        },
        fail: (error) => {
          console.error('选择图片失败:', error);
          this.showErrorMessage('选择图片失败，请重试');
        }
      });
    },

    /**
     * 处理选中的文件
     */
    async handleSelectedFiles(files) {
      this.setData({ uploading: true, uploadProgress: 0 });
      
      try {
        const processedFiles = [];
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const processResult = await this.processFile(file, i, files.length);
          
          if (processResult) {
            processedFiles.push(processResult);
          }
        }
        
        if (processedFiles.length > 0) {
          this.addFilesToList(processedFiles);
        }
        
      } catch (error) {
        console.error('处理文件失败:', error);
        this.showErrorMessage('文件处理失败');
      } finally {
        this.setData({ uploading: false });
      }
    },

    /**
     * 处理单个文件
     */
    async processFile(file, index, total) {
      try {
        // 更新进度
        this.setData({
          uploadProgress: Math.round((index / total) * 50) // 处理阶段占50%
        });

        // 验证文件
        const validation = this.validateFile(file);
        if (!validation.valid) {
          this.showErrorMessage(validation.message);
          return null;
        }

        // 生成文件ID
        const fileId = this.generateFileId();
        
        // 获取图片信息
        const imageInfo = await this.getImageInfo(file.tempFilePath);
        
        // 压缩图片（如果启用）
        let compressedPath = file.tempFilePath;
        let compressedSize = file.size;
        
        if (this.properties.enableCompress) {
          const compressResult = await imageOptimizer.compressImage({
            src: file.tempFilePath,
            quality: this.properties.compressQuality,
            maxWidth: 1920,
            maxHeight: 1920
          });
          
          if (compressResult.success) {
            compressedPath = compressResult.tempFilePath;
            compressedSize = compressResult.size;
          }
        }

        // 生成缩略图
        const thumbnail = await this.generateThumbnail(compressedPath);

        return {
          id: fileId,
          name: file.name || `image_${Date.now()}.jpg`,
          originalPath: file.tempFilePath,
          compressedPath,
          thumbnail,
          originalSize: file.size,
          compressedSize,
          compressionRatio: file.size > 0 ? ((file.size - compressedSize) / file.size * 100).toFixed(1) : 0,
          width: imageInfo.width,
          height: imageInfo.height,
          type: imageInfo.type,
          status: 'ready', // ready, uploading, success, failed
          progress: 0,
          uploadUrl: '',
          error: '',
          createdAt: Date.now()
        };

      } catch (error) {
        console.error('处理文件失败:', error);
        return null;
      }
    },

    /**
     * 验证文件
     */
    validateFile(file) {
      // 检查文件大小
      const maxSizeBytes = this.properties.maxSize * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        return {
          valid: false,
          message: `文件大小不能超过${this.properties.maxSize}MB`
        };
      }

      // 检查文件类型
      const fileType = this.getFileType(file.tempFilePath);
      if (!this.properties.acceptTypes.includes(fileType.toLowerCase())) {
        return {
          valid: false,
          message: `不支持的文件类型，请选择${this.properties.acceptTypes.join('、')}格式的图片`
        };
      }

      return { valid: true };
    },

    /**
     * 获取图片信息
     */
    getImageInfo(path) {
      return new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: path,
          success: resolve,
          fail: reject
        });
      });
    },

    /**
     * 生成缩略图
     */
    async generateThumbnail(imagePath) {
      try {
        const result = await imageOptimizer.compressImage({
          src: imagePath,
          quality: 0.7,
          maxWidth: 200,
          maxHeight: 200
        });
        
        return result.success ? result.tempFilePath : imagePath;
      } catch (error) {
        console.warn('生成缩略图失败:', error);
        return imagePath;
      }
    },

    /**
     * 添加文件到列表
     */
    addFilesToList(files) {
      const updatedList = [...this.data.fileList, ...files];
      const totalSize = updatedList.reduce((sum, file) => sum + file.originalSize, 0);
      const compressedSize = updatedList.reduce((sum, file) => sum + file.compressedSize, 0);
      
      this.setData({
        fileList: updatedList,
        totalSize,
        compressedSize,
        compressionRatio: totalSize > 0 ? ((totalSize - compressedSize) / totalSize * 100).toFixed(1) : 0
      });

      // 触发变更事件
      this.triggerEvent('change', {
        fileList: updatedList,
        addedFiles: files
      });

      // 如果启用批量上传，自动开始上传
      if (this.properties.enableBatch) {
        this.startBatchUpload(files);
      }
    },

    /**
     * 开始批量上传
     */
    async startBatchUpload(files) {
      if (!files || files.length === 0) return;

      this.setData({ uploading: true });

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          await this.uploadSingleFile(file, i, files.length);
        }
      } catch (error) {
        console.error('批量上传失败:', error);
      } finally {
        this.setData({ uploading: false });
      }
    },

    /**
     * 上传单个文件
     */
    async uploadSingleFile(file, index, total) {
      const fileIndex = this.data.fileList.findIndex(f => f.id === file.id);
      if (fileIndex === -1) return;

      // 更新文件状态
      this.updateFileStatus(fileIndex, { status: 'uploading', progress: 0 });

      try {
        let uploadResult;
        
        if (this.properties.customUpload) {
          // 使用自定义上传函数
          uploadResult = await this.properties.customUpload(file);
        } else {
          // 使用默认上传方法
          uploadResult = await this.defaultUpload(file, (progress) => {
            this.updateFileStatus(fileIndex, { progress });
          });
        }

        // 更新成功状态
        this.updateFileStatus(fileIndex, {
          status: 'success',
          progress: 100,
          uploadUrl: uploadResult.url || uploadResult.fileID
        });

        // 触发单个文件上传成功事件
        this.triggerEvent('uploadSuccess', {
          file: { ...file, ...uploadResult },
          index: fileIndex
        });

      } catch (error) {
        console.error('上传文件失败:', error);
        
        // 更新失败状态
        this.updateFileStatus(fileIndex, {
          status: 'failed',
          error: error.message || '上传失败'
        });

        // 触发单个文件上传失败事件
        this.triggerEvent('uploadError', {
          file,
          error,
          index: fileIndex
        });
      }
    },

    /**
     * 默认上传方法
     */
    defaultUpload(file, onProgress) {
      return new Promise((resolve, reject) => {
        const uploadTask = wx.uploadFile({
          url: '/api/upload', // 这里需要配置实际的上传接口
          filePath: file.compressedPath,
          name: 'file',
          formData: {
            fileName: file.name,
            fileSize: file.compressedSize,
            originalSize: file.originalSize,
            width: file.width,
            height: file.height
          },
          success: (res) => {
            try {
              const result = JSON.parse(res.data);
              if (result.success) {
                resolve(result.data);
              } else {
                reject(new Error(result.message || '上传失败'));
              }
            } catch (error) {
              reject(new Error('响应解析失败'));
            }
          },
          fail: reject
        });

        // 监听上传进度
        uploadTask.onProgressUpdate((res) => {
          onProgress(res.progress);
        });
      });
    },

    /**
     * 更新文件状态
     */
    updateFileStatus(index, updates) {
      const fileList = [...this.data.fileList];
      fileList[index] = { ...fileList[index], ...updates };
      
      this.setData({ fileList });
    },

    /**
     * 删除文件
     */
    deleteFile(e) {
      const { index } = e.currentTarget.dataset;
      const fileList = [...this.data.fileList];
      const deletedFile = fileList.splice(index, 1)[0];
      
      this.setData({ fileList });
      
      this.triggerEvent('delete', {
        file: deletedFile,
        index
      });
    },

    /**
     * 重试上传
     */
    retryUpload(e) {
      const { index } = e.currentTarget.dataset;
      const file = this.data.fileList[index];
      
      if (file && file.status === 'failed') {
        this.uploadSingleFile(file, 0, 1);
      }
    },

    /**
     * 预览图片
     */
    previewImage(e) {
      const { index } = e.currentTarget.dataset;
      const fileList = this.data.fileList;
      const urls = fileList.map(file => file.compressedPath);
      
      wx.previewImage({
        current: urls[index],
        urls: urls
      });
    },

    /**
     * 显示错误信息
     */
    showErrorMessage(message) {
      this.setData({
        errorMessage: message,
        showError: true
      });
      
      setTimeout(() => {
        this.setData({ showError: false });
      }, 3000);
    },

    /**
     * 生成文件ID
     */
    generateFileId() {
      return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * 获取文件类型
     */
    getFileType(path) {
      const ext = path.substring(path.lastIndexOf('.') + 1);
      return ext.toLowerCase();
    },

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * 清除所有文件
     */
    clearAll() {
      wx.showModal({
        title: '确认清除',
        content: '确定要清除所有图片吗？',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              fileList: [],
              totalSize: 0,
              compressedSize: 0,
              compressionRatio: 0
            });
            
            this.triggerEvent('clear');
          }
        }
      });
    }
  }
});