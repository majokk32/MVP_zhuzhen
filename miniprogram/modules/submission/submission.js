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
        url: '/api/v1/submissions/my-submissions',
        method: 'GET',
        data: taskId ? { task_id: taskId } : {}
      });

      if (res.data.code === 200) {
        const submissions = res.data.data || [];
        
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
      
      throw new Error(res.data.message || '获取提交记录失败');
    } catch (error) {
      console.error('获取提交记录失败:', error);
      throw error;
    }
  }

  // 提交作业
  async submitHomework(data) {
    try {
      const res = await app.request({
        url: '/api/v1/submissions/submit',
        method: 'POST',
        data: {
          task_id: data.taskId,
          images: data.images || [],
          text: data.text || ''
        }
      });

      if (res.data.code === 200) {
        return res.data.data;
      }
      
      throw new Error(res.data.message || '提交失败');
    } catch (error) {
      console.error('提交作业失败:', error);
      throw error;
    }
  }

  // 上传图片
  uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      
      wx.uploadFile({
        url: `${this.baseUrl}/api/v1/submissions/upload-image`,
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.code === 200) {
              resolve(data.data.url);
            } else {
              reject(new Error(data.message || '上传失败'));
            }
          } catch (error) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: (error) => {
          reject(new Error('网络请求失败'));
        }
      });
    });
  }

  // 批量上传图片
  async uploadImages(imagePaths) {
    const uploadPromises = imagePaths.map(path => this.uploadImage(path));
    
    try {
      const results = await Promise.all(uploadPromises);
      return results;
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

  // 压缩图片
  compressImage(filePath, quality = 80) {
    return new Promise((resolve, reject) => {
      wx.compressImage({
        src: filePath,
        quality: quality,
        success: (res) => {
          resolve(res.tempFilePath);
        },
        fail: reject
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