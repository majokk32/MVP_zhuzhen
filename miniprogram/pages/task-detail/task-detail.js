// 任务详情页
const app = getApp();
const authModule = require('../../modules/auth/auth');
const taskModule = require('../../modules/task/task');
const submissionModule = require('../../modules/submission/submission');

Page({
  data: {
    taskId: null,
    task: {},
    viewType: 'toSubmit', // toSubmit | pending | reviewed
    isTeacher: false,
    isOverdue: false,
    remainingTime: '',
    
    // 提交相关
    uploadedImages: [],
    maxImages: 6,
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
    userInfo: {}
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
    if (this.data.taskId) {
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

    // 检查任务访问权限
    if (!authModule.checkTaskAccess({
      onUpgrade: this.handleUpgradeContact
    })) {
      // 权限不足，返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
      return;
    }
    
    this.setData({
      isTeacher: userInfo.role === 'teacher',
      userInfo: {
        id: userInfo.id,
        nickname: userInfo.nickname || userInfo.name || '用户'
      }
    });
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
        const now = new Date();
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
        remainingTime
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
  chooseImage() {
    const remaining = this.data.maxImages - this.data.uploadedImages.length;
    
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath);
        this.setData({
          uploadedImages: [...this.data.uploadedImages, ...newImages],
          canSubmit: true
        });
      }
    });
  },

  // 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const uploadedImages = [...this.data.uploadedImages];
    uploadedImages.splice(index, 1);
    
    this.setData({
      uploadedImages,
      canSubmit: uploadedImages.length > 0 || this.data.submissionText.trim().length > 0
    });
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

  // 输入文字
  onTextInput(e) {
    const text = e.detail.value;
    this.setData({
      submissionText: text,
      canSubmit: text.trim().length > 0 || this.data.uploadedImages.length > 0
    });
  },

  // 提交作业
  async submitHomework() {
    if (!this.data.canSubmit || this.data.isSubmitting) {
      return;
    }
    
    if (this.data.submissionCount >= 3) {
      wx.showToast({
        title: '已达到最大提交次数',
        icon: 'none'
      });
      return;
    }
    
    const remainingAttempts = 3 - this.data.submissionCount - 1;
    const resetMessage = this.data.hasReviewReset ? '(因"待复盘"评价已重置提交次数) ' : '';
    
    wx.showModal({
      title: '确认提交',
      content: `确定要提交作业吗？${resetMessage}您还有 ${remainingAttempts} 次提交机会`,
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
      // 压缩图片
      const compressedImages = await submissionModule.compressImages(this.data.uploadedImages);
      
      // 显示上传进度
      if (compressedImages.length > 0) {
        this.setData({ 
          showSimpleProgress: true,
          uploadProgressData: { completed: 0, total: compressedImages.length, progress: 0 }
        });
      }
      
      // 上传图片（使用增强的上传系统）
      const imageUrls = await submissionModule.uploadImages(compressedImages, {
        showProgress: true,
        showPartialError: true,
        onProgress: (data) => {
          this.setData({
            uploadProgressData: {
              completed: data.completedCount,
              total: data.totalCount,
              progress: data.progress
            }
          });
        }
      });
      
      // 隐藏上传进度
      this.setData({ showSimpleProgress: false });
      
      wx.showLoading({ title: '提交中...' });
      
      // 提交作业
      await submissionModule.submitHomework({
        taskId: this.data.taskId,
        images: imageUrls,
        text: this.data.submissionText.trim()
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '提交成功',
        icon: 'success'
      });
      
      // 清空表单
      this.setData({
        uploadedImages: [],
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
  }
});