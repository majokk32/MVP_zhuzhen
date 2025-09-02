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
    maxImages: 9,
    submissionText: '',
    canSubmit: false,
    isSubmitting: false,
    submissionCount: 0,
    
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
    }
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
    
    this.setData({
      isTeacher: userInfo.role === 'teacher'
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
        
      // 确定视图类型
      let viewType = 'toSubmit';
      if (currentSubmission) {
        if (currentSubmission.status === 'pending') {
          viewType = 'pending';
        } else if (currentSubmission.status === 'reviewed' || currentSubmission.status === 'graded') {
          viewType = 'reviewed';
          this.setGradeInfo(currentSubmission.grade);
        }
      }
      
      this.setData({
        currentSubmission,
        historySubmissions,
        submissionCount,
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
    
    wx.showModal({
      title: '确认提交',
      content: `确定要提交作业吗？您还有 ${3 - this.data.submissionCount - 1} 次提交机会`,
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
    wx.showLoading({ title: '提交中...' });
    
    try {
      // 压缩图片
      const compressedImages = await submissionModule.compressImages(this.data.uploadedImages);
      
      // 上传图片
      const imageUrls = await submissionModule.uploadImages(compressedImages);
      
      // 提交作业
      await submissionModule.submitHomework({
        taskId: this.data.taskId,
        images: imageUrls,
        text: this.data.submissionText.trim()
      });
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
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isSubmitting: false });
      wx.hideLoading();
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
  }
});