// 任务详情页
const app = getApp();
const authModule = require('../../modules/auth/auth');
const taskModule = require('../../modules/task/task');
const submissionModule = require('../../modules/submission/submission');
const { formatDateTime, getChinaTime } = require('../../utils/time-formatter');

Page({
  data: {
    taskId: null,
    task: {},
    viewType: 'toSubmit', // toSubmit | pending | reviewed
    isTeacher: false,
    isOverdue: false,
    remainingTime: '',
    
    // 格式化时间显示
    formattedCreatedAt: '',
    formattedDeadline: '',
    
    // 提交相关 - 图片上传
    uploadedFiles: [],
    submissionText: '',
    canSubmit: false,
    isSubmitting: false,
    submissionCount: 0,
    hasReviewReset: false,
    
    // 当前提交
    currentSubmission: null,
    historySubmissions: [],
    
    // 评价相关
    gradeTitle: '',
    gradeDesc: '',
    taskTypeText: '',
    
    // 教师统计
    stats: {
      submitted: 0,
      pending: 0,
      reviewed: 0
    },
    
    // 上传进度相关
    showUploadProgress: false,
    showSimpleProgress: false,
    uploadProgressData: {
      completed: 0,
      total: 0,
      progress: 0
    },
    
    // 我的批改历史
    showMyGradingHistory: false,
    
    // 用户信息（用于历史组件）
    userInfo: {},
    
    // 升级引导相关
    showUpgradeGuide: false,
    upgradeGuideType: 'permission_denied',
    
    // 试用限制相关
    showTrialRestriction: false
  },

  onLoad(options) {
    const taskId = options.id;
    if (!taskId) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    this.setData({ taskId });
    this.checkAuth();
  },

  onShow() {
    if (this.data.taskId && !this.data.showTrialRestriction && !this.data.showUpgradeGuide) {
      this.loadTaskDetail();
      this.loadSubmissions();
    }
  },

  // 检查权限
  async checkAuth() {
    const userInfo = await authModule.getUserInfo();
    if (!userInfo) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return;
    }

    this.setData({
      isTeacher: userInfo.role === 'teacher',
      userInfo: {
        id: userInfo.id,
        nickname: userInfo.nickname || userInfo.name || '用户'
      }
    });

    // 检查任务访问权限
    if (!authModule.checkTaskAccess({ showModal: false })) {
      // 对试用学员显示限制消息
      if (authModule.isTrialUser()) {
        this.setData({
          showTrialRestriction: true
        });
        return;
      }
      
      // 其他情况显示升级引导
      let guideType = 'permission_denied';
      if (authModule.isPermissionExpired()) {
        guideType = 'trial_expired';
      }
      
      this.setData({
        showUpgradeGuide: true,
        upgradeGuideType: guideType
      });
      return;
    }
    
    // 如果有访问权限，加载任务数据
    this.loadTaskDetail();
    this.loadSubmissions();
  },

  // 处理升级联系客服
  handleUpgradeContact() {
    // 这里可以添加联系客服的逻辑，比如打开客服会话或跳转到联系页面
    wx.showModal({
      title: '联系客服',
      content: '请通过微信群联系客服或拨打客服电话升级为付费学员',
      confirmText: '我知道了',
      showCancel: false
    });
  },

  // 加载任务详情
  async loadTaskDetail() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const task = await taskModule.getTaskDetail(this.data.taskId);
      
      // 计算任务类型文本
      const typeMap = {
        'live': '直播课',
        'extra': '课后加餐',
        'normal': '日常任务'
      };
      
      // 计算剩余时间
      let remainingTime = '';
      let isOverdue = false;
      if (task.deadline) {
        const deadline = new Date(task.deadline);
        const now = getChinaTime();
        const diff = deadline - now;
        
        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          
          if (days > 0) {
            remainingTime = `还剩${days}天${hours}小时`;
          } else if (hours > 0) {
            remainingTime = `还剩${hours}小时`;
          } else {
            const minutes = Math.floor(diff / (1000 * 60));
            remainingTime = `还剩${minutes}分钟`;
          }
        } else {
          isOverdue = true;
          remainingTime = '已截止';
        }
      }
      
      this.setData({
        task,
        taskTypeText: typeMap[task.type] || '任务',
        isOverdue,
        remainingTime,
        formattedCreatedAt: formatDateTime(task.created_at),
        formattedDeadline: task.deadline ? formatDateTime(task.deadline) : '无截止时间'
      });
      
      // 如果是教师，加载统计数据
      if (this.data.isTeacher) {
        this.loadTeacherStats();
      }
    } catch (error) {
      console.error('加载任务详情失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 加载提交记录
  async loadSubmissions() {
    try {
      const submissions = await submissionModule.getMySubmissions(this.data.taskId);
      const submissionCount = submissions.length;
      
      // 找出最新的提交
      const currentSubmission = submissions[0] || null;
      
      // 历史提交（除了最新的）
      const historySubmissions = submissions.slice(1).map((item, index) => ({
        ...item,
        attemptNumber: submissionCount - index - 1
      }));
        
      // 检查"待复盘"自动重置逻辑
      let effectiveSubmissionCount = submissionCount;
      let hasReviewReset = false;
      
      if (currentSubmission && 
          (currentSubmission.status === 'reviewed' || currentSubmission.status === 'graded') &&
          currentSubmission.grade === 'review') {
        // 如果最新提交被评为"待复盘"，重置提交次数
        effectiveSubmissionCount = 0;
        hasReviewReset = true;
      }
      
      // 确定视图类型
      let viewType = 'toSubmit';
      if (currentSubmission && effectiveSubmissionCount > 0) {
        if (currentSubmission.status === 'pending') {
          viewType = 'pending';
        } else if (currentSubmission.status === 'reviewed' || currentSubmission.status === 'graded') {
          if (currentSubmission.grade === 'review') {
            // 待复盘状态，显示重新提交界面
            viewType = 'toSubmit';
          } else {
            viewType = 'reviewed';
            this.setGradeInfo(currentSubmission.grade);
          }
        }
      }
      
      this.setData({
        currentSubmission,
        historySubmissions,
        submissionCount: effectiveSubmissionCount,
        hasReviewReset,
        viewType
      });
    } catch (error) {
      console.error('加载提交记录失败:', error);
      // 当没有提交记录时，设置默认状态
      this.setData({
        currentSubmission: null,
        historySubmissions: [],
        submissionCount: 0,
        hasReviewReset: false,
        viewType: 'toSubmit'
      });
    }
  },

  // 获取评价文本
  getGradeText(grade) {
    const gradeMap = {
      'excellent': '极佳',
      'good': '优秀',
      'review': '待复盘'
    };
    return gradeMap[grade] || '';
  },

  // 设置评价信息
  setGradeInfo(grade) {
    const gradeInfo = {
      'excellent': {
        title: '极佳作品',
        desc: '完成质量优异，值得其他同学学习'
      },
      'good': {
        title: '优秀作品',
        desc: '完成质量良好，继续保持'
      },
      'review': {
        title: '待复盘',
        desc: '需要进一步改进，请查看老师评语'
      }
    };
    
    const info = gradeInfo[grade] || { title: '', desc: '' };
    this.setData({
      gradeTitle: info.title,
      gradeDesc: info.desc
    });
  },


  // 选择图片
  chooseImages() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        // 验证文件大小
        const validFiles = res.tempFiles.filter(file => {
          // 检查文件大小（10MB限制）
          if (file.size > 10 * 1024 * 1024) {
            wx.showToast({
              title: '图片超过10MB限制',
              icon: 'none'
            });
            return false;
          }
          return true;
        });

        const newFiles = validFiles.map(file => {
          const fileName = file.tempFilePath.split('/').pop();
          return {
            type: 'image',
            name: fileName,
            path: file.tempFilePath,
            size: this.formatFileSize(file.size)
          };
        });
        
        if (newFiles.length > 0) {
          this.setData({
            uploadedFiles: [...this.data.uploadedFiles, ...newFiles],
            canSubmit: true
          });
        }
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '选择图片失败，请重试',
          icon: 'none'
        });
      }
    });
  },



  // 删除图片
  deleteFile(e) {
    const index = e.currentTarget.dataset.index;
    const uploadedFiles = [...this.data.uploadedFiles];
    uploadedFiles.splice(index, 1);
    
    this.setData({
      uploadedFiles,
      canSubmit: uploadedFiles.length > 0
    });
  },

  // 预览文件
  previewFile(e) {
    const index = e.currentTarget.dataset.index;
    const file = this.data.uploadedFiles[index];
    
    if (file.type === 'image') {
      wx.previewImage({
        current: file.path,
        urls: this.data.uploadedFiles.filter(f => f.type === 'image').map(f => f.path)
      });
    }
  },

  // 工具方法：格式化文件大小
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // 生成短文件名（防止超出屏幕宽度）
  generateShortName(fileName, maxLength = 15) {
    if (fileName.length <= maxLength) return fileName;
    
    const extension = fileName.split('.').pop();
    const nameWithoutExt = fileName.slice(0, fileName.lastIndexOf('.'));
    const shortName = nameWithoutExt.slice(0, maxLength - extension.length - 4) + '...';
    
    return shortName + '.' + extension;
  },

  // 工具方法：获取文档图标
  getDocumentIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      'pdf': '📕',
      'doc': '📘',
      'docx': '📘',
      'txt': '📄',
      'rtf': '📝'
    };
    return iconMap[ext] || '📄';
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.uploadedImages
    });
  },

  // 预览已提交图片
  previewSubmittedImage(e) {
    const url = e.currentTarget.dataset.url;
    const images = this.data.currentSubmission.images || [];
    wx.previewImage({
      current: url,
      urls: images
    });
  },

  // 图片加载错误处理
  onImageError(e) {
    console.warn('图片加载失败:', e.detail.errMsg);
    // 可以在这里添加默认图片或重试逻辑
  },


  // 提交作业
  async submitHomework() {
    if (!this.data.canSubmit || this.data.isSubmitting || this.data.isOverdue) {
      if (this.data.isOverdue) {
        wx.showToast({
          title: '作业已截止，无法提交',
          icon: 'none'
        });
      }
      return;
    }
    
    if (this.data.submissionCount >= 3) {
      wx.showToast({
        title: '已达到最大提交次数',
        icon: 'none'
      });
      return;
    }
    
    const currentUsed = this.data.submissionCount;
    const remainingAfterSubmit = 3 - currentUsed - 1; // 提交后剩余次数
    const resetMessage = this.data.hasReviewReset ? '(因"待复盘"评价已重置提交次数) ' : '';
    
    wx.showModal({
      title: '确认提交',
      content: `确定要提交作业吗？${resetMessage}提交后您还剩 ${remainingAfterSubmit} 次提交机会`,
      success: async (res) => {
        if (res.confirm) {
          await this.doSubmit();
        }
      }
    });
  },

  // 执行提交
  async doSubmit() {
    this.setData({ isSubmitting: true });
    
    try {
      wx.showLoading({ title: '上传文件中...' });
      
      // 准备多文件上传数据
      const files = this.data.uploadedFiles;
      const hasText = this.data.submissionText.trim().length > 0;
      
      // 至少需要文件或文字说明其中之一
      if (files.length === 0 && !hasText) {
        wx.hideLoading();
        wx.showToast({
          title: '请上传文件或添加文字说明',
          icon: 'none'
        });
        this.setData({ isSubmitting: false });
        return;
      }
      
      let uploadResult;
      
      if (files.length > 0) {
        // 有文件：使用单次请求上传所有文件
        console.log('📤 [DEBUG] 准备上传多个文件:', files.length);
        
        try {
          // 如果只有一个文件，使用wx.uploadFile
          if (files.length === 1) {
            const file = files[0];
            const token = app.globalData.token || wx.getStorageSync('token');
            const uploadUrl = `${app.globalData.baseUrl}/submissions/upload-files`;
            
            const uploadResult = await new Promise((resolve, reject) => {
              wx.uploadFile({
                url: uploadUrl,
                filePath: file.path,
                name: 'files',
                formData: {
                  task_id: this.data.taskId,
                  text_content: this.data.submissionText.trim()
                },
                header: {
                  'Authorization': token ? `Bearer ${token}` : ''
                },
                success: (res) => {
                  try {
                    const result = JSON.parse(res.data);
                    if (result.code === 0) {
                      resolve(result.data);
                    } else {
                      reject(new Error(result.msg || '上传失败'));
                    }
                  } catch (e) {
                    reject(new Error('上传响应解析失败'));
                  }
                },
                fail: (err) => {
                  reject(new Error(err.errMsg || '上传失败'));
                }
              });
            });
            
            uploadResult = [uploadResult];
          } else {
            // 多文件情况：使用一个创新的解决方案
            // 我们将所有文件信息先收集，然后通过一个特殊的批处理接口处理
            console.log('📤 [DEBUG] 多文件上传，开始依次处理...');
            
            // 生成唯一的批次ID
            const batchId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
            const token = app.globalData.token || wx.getStorageSync('token');
            const uploadUrl = `${app.globalData.baseUrl}/submissions/upload-files`;
            
            // 所有文件使用相同的批次ID，后端根据批次ID合并
            const uploadPromises = files.map((file, index) => {
              return new Promise((resolve, reject) => {
                wx.uploadFile({
                  url: uploadUrl,
                  filePath: file.path,
                  name: 'files',
                  formData: {
                    task_id: this.data.taskId,
                    text_content: index === 0 ? this.data.submissionText.trim() : '', // 只在第一个文件包含文本
                    batch_id: batchId,
                    file_index: index,
                    total_files: files.length,
                    is_batch_upload: 'true'
                  },
                  header: {
                    'Authorization': token ? `Bearer ${token}` : ''
                  },
                  success: (res) => {
                    try {
                      const result = JSON.parse(res.data);
                      if (result.code === 0) {
                        resolve(result.data);
                      } else {
                        reject(new Error(result.msg || '上传失败'));
                      }
                    } catch (e) {
                      reject(new Error('上传响应解析失败'));
                    }
                  },
                  fail: (err) => {
                    reject(new Error(err.errMsg || '上传失败'));
                  }
                });
              });
            });
            
            uploadResult = await Promise.all(uploadPromises);
          }
        } catch (error) {
          wx.hideLoading();
          wx.showModal({
            title: '上传失败',
            content: error.message || '文件上传失败，请重试',
            showCancel: false
          });
          this.setData({ isSubmitting: false });
          return;
        }
      } else {
        // 纯文字提交：使用普通POST请求
        const res = await app.request({
          url: '/submissions/upload-files',
          method: 'POST',
          data: {
            task_id: this.data.taskId,
            description: this.data.submissionText.trim()
          }
        });
        uploadResult = [res.data];
      }
      
      wx.hideLoading();
      wx.showToast({
        title: '提交成功',
        icon: 'success'
      });
      
      // 清空表单
      this.setData({
        uploadedFiles: [],
        submissionText: '',
        canSubmit: false
      });
      
      // 重新加载提交记录
      this.loadSubmissions();
    } catch (error) {
      console.error('提交作业失败:', error);
      
      // 隐藏进度
      this.setData({ showSimpleProgress: false });
      wx.hideLoading();
      
      // 显示具体错误信息
      let errorMessage = '提交失败';
      if (error.message) {
        if (error.message.includes('网络')) {
          errorMessage = '网络连接失败，请检查网络后重试';
        } else if (error.message.includes('上传')) {
          errorMessage = '图片上传失败，请重试';
        } else {
          errorMessage = error.message;
        }
      }
      
      wx.showModal({
        title: '提交失败',
        content: errorMessage,
        showCancel: true,
        confirmText: '重试',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 用户选择重试
            setTimeout(() => this.doSubmit(), 500);
          }
        }
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },


  // 重新提交
  resubmit() {
    if (this.data.submissionCount >= 3) {
      wx.showToast({
        title: '已达到最大提交次数',
        icon: 'none'
      });
      return;
    }
    
    const resetMessage = this.data.hasReviewReset ? 
      '\n(因"待复盘"评价，您已重新获得3次提交机会)' : '';
    
    if (resetMessage) {
      wx.showToast({
        title: '提交次数已重置',
        icon: 'success'
      });
    }
    
    this.setData({
      viewType: 'toSubmit',
      uploadedImages: [],
      submissionText: '',
      canSubmit: false
    });
  },

  // 教师功能：加载统计数据
  async loadTeacherStats() {
    try {
      const res = await app.request({
        url: `/api/v1/admin/task-progress/${this.data.taskId}`,
        method: 'GET'
      });
      
      if (res.data.code === 200) {
        const stats = res.data.data;
        this.setData({
          stats: {
            submitted: stats.submitted_count || 0,
            pending: stats.pending_count || 0,
            reviewed: stats.reviewed_count || 0
          }
        });
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  },

  // 教师功能：去批改
  goToGrading() {
    wx.navigateTo({
      url: `/pages/grading/grading?task_id=${this.data.taskId}`
    });
  },

  // 教师功能：导出作业
  async exportSubmissions() {
    wx.showLoading({ title: '准备导出...' });
    
    try {
      const res = await app.request({
        url: `/api/v1/admin/batch-download/${this.data.taskId}`,
        method: 'POST'
      });
      
      if (res.data.code === 200) {
        wx.hideLoading();
        wx.showModal({
          title: '导出成功',
          content: '作业文件已准备好，请在电脑端下载',
          showCancel: false
        });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '导出失败',
        icon: 'none'
      });
    }
  },

  // 教师功能：查看统计
  viewStatistics() {
    wx.navigateTo({
      url: `/pages/statistics/statistics?task_id=${this.data.taskId}`
    });
  },

  // 分享
  onShareAppMessage() {
    const task = this.data.task;
    return {
      title: task.title || '快来完成作业',
      path: `/pages/task-detail/task-detail?id=${this.data.taskId}`,
      // imageUrl: '/assets/images/share-default.png'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: this.data.task.title || '快来完成作业'
    };
  },

  // 上传进度相关事件处理
  
  // 关闭上传进度面板
  onUploadProgressClose() {
    this.setData({ 
      showUploadProgress: false,
      showSimpleProgress: false 
    });
  },

  // 上传进度更新
  onUploadProgressUpdate(e) {
    const { progress, completedCount, totalCount } = e.detail;
    this.setData({
      uploadProgressData: {
        completed: completedCount,
        total: totalCount,
        progress: progress
      }
    });
    
    // 如果全部上传完成，显示简化进度条
    if (progress === 100) {
      this.setData({ showSimpleProgress: true });
      
      // 3秒后自动隐藏
      setTimeout(() => {
        this.setData({ showSimpleProgress: false });
      }, 3000);
    }
  },

  // 单个文件上传成功
  onUploadSuccess(e) {
    const { id, url, uploadTime } = e.detail;
    console.log('文件上传成功:', { id, url, uploadTime });
    
    // 这里可以处理上传成功的逻辑，比如更新UI等
  },

  // 单个文件上传失败
  onUploadError(e) {
    const { id, error } = e.detail;
    console.error('文件上传失败:', { id, error });
    
    // 显示友好的错误提示
    wx.showToast({
      title: '部分图片上传失败',
      icon: 'none',
      duration: 2000
    });
  },

  // 上传被取消
  onUploadCanceled(e) {
    const { id } = e.detail;
    console.log('文件上传被取消:', id);
  },

  // 显示详细上传进度
  showDetailedProgress() {
    this.setData({ 
      showUploadProgress: true,
      showSimpleProgress: false 
    });
  },

  // 学生批改历史相关方法
  
  // 显示我的批改历史
  showMyGradingHistory() {
    if (!this.data.taskId) {
      wx.showToast({
        title: '任务信息加载中',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ showMyGradingHistory: true });
  },

  // 关闭我的批改历史
  onMyGradingHistoryClose() {
    this.setData({ showMyGradingHistory: false });
  },

  // 升级引导相关方法
  
  // 关闭升级引导
  onUpgradeGuideClose() {
    this.setData({ showUpgradeGuide: false });
    // 关闭升级引导后返回上一页
    setTimeout(() => {
      wx.navigateBack();
    }, 300);
  },

  // 关闭试用限制提示
  onTrialRestrictionClose() {
    this.setData({ showTrialRestriction: false });
    // 关闭后返回上一页
    setTimeout(() => {
      wx.navigateBack();
    }, 300);
  },

  // 处理功能访问时的权限检查
  checkPermissionForAction(actionName = '此功能') {
    if (authModule.isTeacher()) {
      return true;
    }

    if (!authModule.checkTaskAccess({ showModal: false })) {
      let guideType = 'permission_denied';
      if (authModule.isPermissionExpired()) {
        guideType = 'trial_expired';
      } else if (authModule.isTrialUser()) {
        guideType = 'permission_denied';
      }
      
      this.setData({
        showUpgradeGuide: true,
        upgradeGuideType: guideType
      });
      return false;
    }
    return true;
  }
});