Component({
  properties: {
    // 是否显示详细进度界面
    show: {
      type: Boolean,
      value: false
    },
    // 是否显示简化进度条
    showSimple: {
      type: Boolean,
      value: false
    }
  },

  data: {
    uploadItems: [],
    overallProgress: 0,
    completedCount: 0,
    totalCount: 0,
    averageSpeed: 0,
    remainingTime: 0,
    remainingTimeText: '',
    hasUploading: false,
    hasFailures: false,
    hasCompleted: false
  },

  lifetimes: {
    attached() {
      // 监听全局上传事件
      this.uploadManager = getApp().globalData.uploadManager || this._createUploadManager();
      getApp().globalData.uploadManager = this.uploadManager;
    }
  },

  methods: {
    // 创建上传管理器
    _createUploadManager() {
      return {
        uploadQueue: [],
        activeUploads: new Map(),
        maxConcurrent: 3,
        
        // 添加上传任务
        addUpload: (uploadOptions) => {
          const uploadId = this._generateUploadId();
          const uploadItem = {
            id: uploadId,
            name: uploadOptions.name || this._getFileName(uploadOptions.filePath),
            localPath: uploadOptions.filePath,
            type: uploadOptions.type || this._getFileType(uploadOptions.filePath),
            size: uploadOptions.size || 0,
            sizeText: this._formatFileSize(uploadOptions.size || 0),
            status: 'waiting', // waiting, uploading, success, failed
            progress: 0,
            speed: 0,
            uploadTime: 0,
            uploadTimeText: '',
            errorMessage: '',
            retryable: true,
            retryCount: 0,
            options: uploadOptions
          };
          
          this.uploadManager.uploadQueue.push(uploadItem);
          this._updateUI();
          this._processQueue();
          
          return uploadId;
        },
        
        // 处理上传队列
        processQueue: this._processQueue.bind(this),
        
        // 取消上传
        cancelUpload: this.cancelUpload.bind(this),
        
        // 重试上传
        retryUpload: this.retryUpload.bind(this),
        
        // 清除已完成
        clearCompleted: this.clearCompleted.bind(this)
      };
    },

    // 处理上传队列
    _processQueue() {
      const activeCount = this.uploadManager.activeUploads.size;
      const maxConcurrent = this.uploadManager.maxConcurrent;
      
      if (activeCount >= maxConcurrent) return;
      
      // 找到下一个等待中的任务
      const nextItem = this.uploadManager.uploadQueue.find(item => item.status === 'waiting');
      if (!nextItem) return;
      
      // 开始上传
      this._startUpload(nextItem);
      
      // 递归处理队列
      setTimeout(() => this._processQueue(), 100);
    },

    // 开始单个上传
    async _startUpload(uploadItem) {
      uploadItem.status = 'uploading';
      uploadItem.progress = 0;
      uploadItem.speed = 0;
      
      try {
        const app = getApp();
        const uploadOptions = {
          ...uploadItem.options,
          onProgress: (progress) => {
            uploadItem.progress = progress.progress;
            uploadItem.speed = progress.speed;
            this._updateUI();
          },
          onTaskCreated: (task) => {
            this.uploadManager.activeUploads.set(uploadItem.id, task);
          },
          onComplete: (result) => {
            this.uploadManager.activeUploads.delete(uploadItem.id);
            
            if (result.success) {
              uploadItem.status = 'success';
              uploadItem.uploadTime = result.uploadTime;
              uploadItem.uploadTimeText = this._formatUploadTime(result.uploadTime);
              uploadItem.url = result.data;
              
              // 触发成功回调
              this.triggerEvent('uploadSuccess', {
                id: uploadItem.id,
                url: uploadItem.url,
                uploadTime: uploadItem.uploadTime
              });
            } else {
              uploadItem.status = 'failed';
              uploadItem.errorMessage = result.error?.message || '上传失败';
              uploadItem.retryable = this._isRetryableError(result.error);
              
              // 触发失败回调
              this.triggerEvent('uploadError', {
                id: uploadItem.id,
                error: result.error
              });
            }
            
            this._updateUI();
            this._processQueue();
          }
        };
        
        // 使用增强的上传方法
        await app.uploadFile(uploadOptions);
        
      } catch (error) {
        console.error('上传失败:', error);
        
        this.uploadManager.activeUploads.delete(uploadItem.id);
        uploadItem.status = 'failed';
        uploadItem.errorMessage = error.message || '上传失败';
        uploadItem.retryable = this._isRetryableError(error);
        
        this.triggerEvent('uploadError', {
          id: uploadItem.id,
          error: error
        });
        
        this._updateUI();
        this._processQueue();
      }
    },

    // 更新UI状态
    _updateUI() {
      const items = this.uploadManager.uploadQueue;
      const completedCount = items.filter(item => item.status === 'success').length;
      const totalCount = items.length;
      
      // 计算整体进度
      const overallProgress = totalCount === 0 ? 0 : 
        Math.round(items.reduce((sum, item) => {
          if (item.status === 'success') return sum + 100;
          if (item.status === 'uploading') return sum + item.progress;
          return sum;
        }, 0) / totalCount);
      
      // 计算平均速度
      const activeItems = items.filter(item => item.status === 'uploading');
      const averageSpeed = activeItems.length === 0 ? 0 :
        Math.round(activeItems.reduce((sum, item) => sum + item.speed, 0) / activeItems.length);
      
      // 计算剩余时间
      const remainingTime = this._calculateRemainingTime(items, averageSpeed);
      
      this.setData({
        uploadItems: items,
        overallProgress,
        completedCount,
        totalCount,
        averageSpeed,
        remainingTime,
        remainingTimeText: this._formatTime(remainingTime),
        hasUploading: items.some(item => item.status === 'uploading'),
        hasFailures: items.some(item => item.status === 'failed'),
        hasCompleted: items.some(item => item.status === 'success')
      });
      
      // 触发进度更新事件
      this.triggerEvent('progressUpdate', {
        progress: overallProgress,
        completedCount,
        totalCount
      });
    },

    // 取消上传
    cancelUpload(e) {
      const uploadId = e.currentTarget.dataset.id;
      const uploadTask = this.uploadManager.activeUploads.get(uploadId);
      
      if (uploadTask) {
        uploadTask.abort();
        this.uploadManager.activeUploads.delete(uploadId);
      }
      
      // 从队列中移除
      const index = this.uploadManager.uploadQueue.findIndex(item => item.id === uploadId);
      if (index !== -1) {
        this.uploadManager.uploadQueue.splice(index, 1);
      }
      
      this.triggerEvent('uploadCanceled', { id: uploadId });
      this._updateUI();
      this._processQueue();
    },

    // 重试上传
    retryUpload(e) {
      const uploadId = e.currentTarget.dataset.id;
      const uploadItem = this.uploadManager.uploadQueue.find(item => item.id === uploadId);
      
      if (uploadItem && uploadItem.retryCount < 3) {
        uploadItem.status = 'waiting';
        uploadItem.progress = 0;
        uploadItem.speed = 0;
        uploadItem.errorMessage = '';
        uploadItem.retryCount++;
        
        this._updateUI();
        this._processQueue();
      }
    },

    // 重试全部失败的上传
    retryAll() {
      const failedItems = this.uploadManager.uploadQueue.filter(item => 
        item.status === 'failed' && item.retryable && item.retryCount < 3
      );
      
      failedItems.forEach(item => {
        item.status = 'waiting';
        item.progress = 0;
        item.speed = 0;
        item.errorMessage = '';
        item.retryCount++;
      });
      
      if (failedItems.length > 0) {
        wx.showToast({
          title: `重试${failedItems.length}个文件`,
          icon: 'none'
        });
        
        this._updateUI();
        this._processQueue();
      }
    },

    // 暂停全部上传
    pauseAll() {
      this.uploadManager.activeUploads.forEach(task => {
        task.abort();
      });
      this.uploadManager.activeUploads.clear();
      
      // 将上传中的任务重置为等待状态
      this.uploadManager.uploadQueue.forEach(item => {
        if (item.status === 'uploading') {
          item.status = 'waiting';
          item.progress = 0;
          item.speed = 0;
        }
      });
      
      wx.showToast({
        title: '已暂停全部上传',
        icon: 'none'
      });
      
      this._updateUI();
    },

    // 清除已完成的上传
    clearCompleted() {
      this.uploadManager.uploadQueue = this.uploadManager.uploadQueue.filter(
        item => item.status !== 'success'
      );
      
      this._updateUI();
    },

    // 关闭进度面板
    close() {
      this.triggerEvent('close');
    },

    // 工具方法：生成上传ID
    _generateUploadId() {
      return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    // 工具方法：获取文件名
    _getFileName(filePath) {
      return filePath.split('/').pop() || '未知文件';
    },

    // 工具方法：获取文件类型
    _getFileType(filePath) {
      const ext = filePath.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        return 'image';
      }
      return 'file';
    },

    // 工具方法：格式化文件大小
    _formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    // 工具方法：格式化上传时间
    _formatUploadTime(ms) {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    },

    // 工具方法：格式化时间
    _formatTime(seconds) {
      if (seconds <= 0) return '';
      if (seconds < 60) return `${seconds}秒`;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}分${remainingSeconds}秒`;
    },

    // 工具方法：计算剩余时间
    _calculateRemainingTime(items, averageSpeed) {
      if (averageSpeed <= 0) return 0;
      
      const remainingItems = items.filter(item => 
        item.status === 'waiting' || item.status === 'uploading'
      );
      
      if (remainingItems.length === 0) return 0;
      
      // 估算剩余大小（假设每个文件平均1MB）
      const estimatedRemainingSize = remainingItems.reduce((sum, item) => {
        if (item.status === 'uploading') {
          return sum + (item.size * (100 - item.progress) / 100);
        }
        return sum + (item.size || 1024 * 1024); // 默认1MB
      }, 0);
      
      return Math.round(estimatedRemainingSize / (averageSpeed * 1024));
    },

    // 工具方法：判断错误是否可重试
    _isRetryableError(error) {
      if (!error) return false;
      
      const retryableMessages = [
        'timeout',
        'network',
        '网络',
        'interrupted',
        'fail',
        'abort'
      ];
      
      const errorMessage = (error.message || error.errMsg || '').toLowerCase();
      return retryableMessages.some(msg => errorMessage.includes(msg));
    }
  }
});