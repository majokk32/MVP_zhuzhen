// 作业提交模块
const app = getApp();

class SubmissionModule {
  constructor() {
    this.baseUrl = app.globalData.baseUrl;
  }

  // 获取我的提交记录
  async getMySubmissions(taskId) {
    try {
      const res = await app.request({
        url: '/submissions/my-submissions',
        method: 'GET',
        data: taskId ? { task_id: taskId } : {}
      });

      if (res.code === 0) {
        const submissions = res.data || [];
        
        // 处理提交记录
        return submissions.map(submission => ({
          ...submission,
          submitted_at: this.formatDate(submission.submitted_at),
          graded_at: submission.graded_at ? this.formatDate(submission.graded_at) : null,
          statusText: this.getStatusText(submission.status),
          gradeText: this.getGradeText(submission.grade),
          images: submission.images || []
        }));
      }
      
      throw new Error(res.msg || '获取提交记录失败');
    } catch (error) {
      console.error('获取提交记录失败:', error);
      throw error;
    }
  }

  // 提交作业
  async submitHomework(data) {
    try {
      const res = await app.request({
        url: '/submissions/submit',
        method: 'POST',
        data: {
          task_id: data.taskId,
          images: data.images || [],
          text: data.text || ''
        }
      });

      if (res.code === 0) {
        return res.data;
      }
      
      throw new Error(res.msg || '提交失败');
    } catch (error) {
      console.error('提交作业失败:', error);
      throw error;
    }
  }

  // 单张图片上传（使用增强的上传系统）
  uploadImage(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const app = getApp();
      
      app.uploadFile({
        url: '/submissions/upload-image',
        filePath: filePath,
        name: 'file',
        showError: options.showError !== false,
        onProgress: options.onProgress,
        onComplete: options.onComplete,
        onTaskCreated: options.onTaskCreated
      }).then(result => {
        resolve(result.url || result);
      }).catch(reject);
    });
  }

  // 批量上传图片（使用上传进度组件）
  async uploadImages(imagePaths, options = {}) {
    return new Promise((resolve, reject) => {
      const uploadResults = [];
      let completedCount = 0;
      let hasError = false;
      
      // 获取上传管理器
      const uploadManager = getApp().globalData.uploadManager;
      
      if (!uploadManager) {
        // 降级到原有方式
        return this._legacyUploadImages(imagePaths).then(resolve).catch(reject);
      }
      
      // 为每张图片创建上传任务
      const uploadIds = imagePaths.map((path, index) => {
        return uploadManager.addUpload({
          url: '/submissions/upload-image',
          filePath: path,
          name: `image_${index + 1}.jpg`,
          type: 'image',
          size: 1024 * 1024, // 估算1MB
          onSuccess: (result) => {
            uploadResults[index] = { success: true, url: result.url, index };
            completedCount++;
            this._checkUploadComplete();
          },
          onError: (error) => {
            uploadResults[index] = { success: false, error: error.message, index };
            completedCount++;
            hasError = true;
            this._checkUploadComplete();
          }
        });
      });
      
      // 检查上传是否全部完成
      const _checkUploadComplete = () => {
        if (completedCount === imagePaths.length) {
          const successResults = uploadResults.filter(r => r && r.success).map(r => r.url);
          const failedResults = uploadResults.filter(r => r && !r.success);
          
          // 如果全部失败，抛出错误
          if (successResults.length === 0) {
            reject(new Error('所有图片上传失败，请检查网络连接'));
            return;
          }
          
          // 如果有部分失败，显示警告但继续
          if (failedResults.length > 0) {
            const failedIndexes = failedResults.map(r => r.index + 1).join('、');
            
            if (options.showPartialError !== false) {
              wx.showModal({
                title: '部分图片上传失败',
                content: `第${failedIndexes}张图片上传失败，是否继续提交其他图片？`,
                confirmText: '继续',
                cancelText: '取消',
                success: (res) => {
                  if (res.confirm) {
                    resolve(successResults);
                  } else {
                    reject(new Error('用户取消提交'));
                  }
                }
              });
            } else {
              resolve(successResults);
            }
          } else {
            resolve(successResults);
          }
        }
      };
      
      this._checkUploadComplete = _checkUploadComplete;
      
      // 显示上传进度（如果启用）
      if (options.showProgress !== false) {
        this.triggerEvent?.('showUploadProgress');
      }
    });
  }

  // 降级上传方式（原有逻辑）
  async _legacyUploadImages(imagePaths) {
    const uploadPromises = imagePaths.map(async (path, index) => {
      try {
        const app = getApp();
        const result = await app.uploadFile({
          url: '/submissions/upload-image',
          filePath: path,
          name: 'file'
        });
        return { success: true, url: result.url || result, index, error: null };
      } catch (error) {
        console.error(`图片${index + 1}上传失败:`, error);
        return { success: false, url: null, index, error: error.message };
      }
    });
    
    try {
      const results = await Promise.all(uploadPromises);
      
      // 分离成功和失败的结果
      const successResults = results.filter(r => r.success).map(r => r.url);
      const failedResults = results.filter(r => !r.success);
      
      // 如果全部失败，抛出错误
      if (successResults.length === 0) {
        throw new Error('所有图片上传失败，请检查网络连接');
      }
      
      // 如果有部分失败，显示警告但继续
      if (failedResults.length > 0) {
        const failedIndexes = failedResults.map(r => r.index + 1).join('、');
        wx.showToast({
          title: `第${failedIndexes}张图片上传失败`,
          icon: 'none',
          duration: 3000
        });
      }
      
      return successResults;
    } catch (error) {
      console.error('批量上传图片失败:', error);
      throw error;
    }
  }

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      'pending': '待批改',
      'reviewed': '已批改',
      'graded': '已评分'
    };
    return statusMap[status] || status;
  }

  // 获取评价文本
  getGradeText(grade) {
    const gradeMap = {
      'excellent': '极佳',
      'good': '优秀',
      'review': '待复盘'
    };
    return gradeMap[grade] || '';
  }

  // 格式化日期
  formatDate(dateStr) {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    // 小于1分钟
    if (diff < 60 * 1000) {
      return '刚刚';
    }
    
    // 小于1小时
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes}分钟前`;
    }
    
    // 小于24小时
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours}小时前`;
    }
    
    // 小于7天
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}天前`;
    }
    
    // 显示具体日期
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    if (year === now.getFullYear()) {
      return `${month}-${day} ${hour}:${minute}`;
    }
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  // 获取提交统计
  async getSubmissionStats(taskId) {
    try {
      const submissions = await this.getMySubmissions(taskId);
      
      return {
        total: submissions.length,
        pending: submissions.filter(s => s.status === 'pending').length,
        reviewed: submissions.filter(s => s.status === 'reviewed' || s.status === 'graded').length,
        canSubmit: submissions.length < 3,
        remainingAttempts: Math.max(0, 3 - submissions.length)
      };
    } catch (error) {
      console.error('获取提交统计失败:', error);
      return {
        total: 0,
        pending: 0,
        reviewed: 0,
        canSubmit: true,
        remainingAttempts: 3
      };
    }
  }

  // 检查是否可以提交
  async canSubmit(taskId) {
    const stats = await this.getSubmissionStats(taskId);
    return stats.canSubmit;
  }

  // 压缩图片（智能压缩）
  compressImage(filePath, quality = null) {
    return new Promise((resolve, reject) => {
      // 获取文件信息来决定压缩策略
      wx.getFileInfo({
        filePath: filePath,
        success: (fileInfo) => {
          // 根据文件大小智能调整压缩质量
          let targetQuality = quality;
          if (!quality) {
            const sizeInMB = fileInfo.size / (1024 * 1024);
            if (sizeInMB > 10) {
              targetQuality = 40; // 大文件低质量
            } else if (sizeInMB > 5) {
              targetQuality = 60; // 中等文件中等质量
            } else if (sizeInMB > 2) {
              targetQuality = 75; // 小文件较高质量
            } else {
              targetQuality = 85; // 很小的文件保持高质量
            }
          }
          
          wx.compressImage({
            src: filePath,
            quality: targetQuality,
            success: (res) => {
              console.log(`图片压缩: ${fileInfo.size} -> 质量${targetQuality}`);
              resolve(res.tempFilePath);
            },
            fail: (error) => {
              console.warn('图片压缩失败，使用原图:', error);
              resolve(filePath); // 压缩失败时返回原图
            }
          });
        },
        fail: (error) => {
          console.warn('获取文件信息失败，使用默认压缩:', error);
          wx.compressImage({
            src: filePath,
            quality: quality || 75,
            success: (res) => resolve(res.tempFilePath),
            fail: () => resolve(filePath) // 压缩失败返回原图
          });
        }
      });
    });
  }

  // 批量压缩图片
  async compressImages(imagePaths, quality = 80) {
    const compressPromises = imagePaths.map(path => this.compressImage(path, quality));
    
    try {
      const results = await Promise.all(compressPromises);
      return results;
    } catch (error) {
      console.error('批量压缩图片失败:', error);
      // 如果压缩失败，返回原图
      return imagePaths;
    }
  }
}

// 导出模块实例
module.exports = new SubmissionModule();