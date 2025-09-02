// 批改页面
const app = getApp();
const authModule = require('../../modules/auth/auth');

Page({
  data: {
    taskId: null,
    task: {},
    
    // 提交列表
    submissions: [],
    filterStatus: 'all', // all | pending | reviewed
    pendingCount: 0,
    reviewedCount: 0,
    
    // 当前批改
    currentSubmission: null,
    currentIndex: 0,
    
    // 批改数据
    gradeData: {
      grade: '',
      score: '',
      feedback: ''
    },
    
    // 快捷评语
    quickFeedbacks: [
      '完成质量很好，继续保持！',
      '论点清晰，论证充分',
      '结构完整，逻辑清晰',
      '需要加强论据支撑',
      '注意文章结构的完整性',
      '语言表达需要更简洁',
      '观点新颖，分析深入',
      '书写工整，卷面整洁'
    ],
    
    // 状态
    canSubmitGrade: false,
    isSubmitting: false,
    isTeacher: false
  },

  onLoad(options) {
    const taskId = options.task_id;
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
      this.loadTaskInfo();
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
    
    if (userInfo.role !== 'teacher') {
      wx.showToast({
        title: '无权限访问',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    this.setData({
      isTeacher: true
    });
  },

  // 加载任务信息
  async loadTaskInfo() {
    try {
      const res = await app.request({
        url: `/api/v1/tasks/${this.data.taskId}`,
        method: 'GET'
      });
      
      if (res.data.code === 200) {
        this.setData({
          task: res.data.data
        });
      }
    } catch (error) {
      console.error('加载任务信息失败:', error);
    }
  },

  // 加载提交列表
  async loadSubmissions() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const res = await app.request({
        url: '/api/v1/admin/submissions',
        method: 'GET',
        data: {
          task_id: this.data.taskId,
          status: this.data.filterStatus === 'all' ? undefined : this.data.filterStatus
        }
      });
      
      if (res.data.code === 200) {
        const submissions = res.data.data || [];
        
        // 处理提交数据
        const processedSubmissions = submissions.map((item, index) => ({
          ...item,
          submitted_at: this.formatDate(item.submitted_at),
          graded_at: item.graded_at ? this.formatDate(item.graded_at) : null,
          gradeText: this.getGradeText(item.grade),
          attemptNumber: item.attempt_number || 1,
          images: item.images || []
        }));
        
        // 统计数量
        const pendingCount = submissions.filter(s => s.status === 'pending').length;
        const reviewedCount = submissions.filter(s => s.status === 'reviewed' || s.status === 'graded').length;
        
        this.setData({
          submissions: processedSubmissions,
          pendingCount,
          reviewedCount
        });
      }
    } catch (error) {
      console.error('加载提交列表失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 筛选切换
  onFilterChange(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.filterStatus) return;
    
    this.setData({
      filterStatus: status,
      currentSubmission: null
    });
    
    this.loadSubmissions();
  },

  // 选择要批改的作业
  selectSubmission(e) {
    const index = e.currentTarget.dataset.index;
    const submission = this.data.submissions[index];
    
    // 如果已批改，加载已有的批改数据
    let gradeData = {
      grade: submission.grade || '',
      score: submission.score || '',
      feedback: submission.feedback || ''
    };
    
    this.setData({
      currentSubmission: submission,
      currentIndex: index,
      gradeData,
      canSubmitGrade: this.checkCanSubmit(gradeData)
    });
  },

  // 上一份作业
  previousSubmission() {
    if (this.data.currentIndex > 0) {
      const index = this.data.currentIndex - 1;
      const submission = this.data.submissions[index];
      
      let gradeData = {
        grade: submission.grade || '',
        score: submission.score || '',
        feedback: submission.feedback || ''
      };
      
      this.setData({
        currentIndex: index,
        currentSubmission: submission,
        gradeData,
        canSubmitGrade: this.checkCanSubmit(gradeData)
      });
    }
  },

  // 下一份作业
  nextSubmission() {
    if (this.data.currentIndex < this.data.submissions.length - 1) {
      const index = this.data.currentIndex + 1;
      const submission = this.data.submissions[index];
      
      let gradeData = {
        grade: submission.grade || '',
        score: submission.score || '',
        feedback: submission.feedback || ''
      };
      
      this.setData({
        currentIndex: index,
        currentSubmission: submission,
        gradeData,
        canSubmitGrade: this.checkCanSubmit(gradeData)
      });
    }
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    const images = this.data.currentSubmission.images || [];
    wx.previewImage({
      current: url,
      urls: images
    });
  },

  // 选择评价档位
  selectGrade(e) {
    const grade = e.currentTarget.dataset.grade;
    const gradeData = { ...this.data.gradeData, grade };
    
    // 根据档位自动填充参考分数
    const scoreMap = {
      'excellent': 90,
      'good': 75,
      'review': 60
    };
    
    if (!gradeData.score) {
      gradeData.score = scoreMap[grade];
    }
    
    this.setData({
      gradeData,
      canSubmitGrade: this.checkCanSubmit(gradeData)
    });
  },

  // 输入分数
  onScoreInput(e) {
    const score = e.detail.value;
    const gradeData = { ...this.data.gradeData, score };
    
    this.setData({
      gradeData,
      canSubmitGrade: this.checkCanSubmit(gradeData)
    });
  },

  // 输入评语
  onFeedbackInput(e) {
    const feedback = e.detail.value;
    const gradeData = { ...this.data.gradeData, feedback };
    
    this.setData({
      gradeData,
      canSubmitGrade: this.checkCanSubmit(gradeData)
    });
  },

  // 使用快捷评语
  useQuickFeedback(e) {
    const text = e.currentTarget.dataset.text;
    const gradeData = { 
      ...this.data.gradeData, 
      feedback: this.data.gradeData.feedback + text 
    };
    
    this.setData({
      gradeData,
      canSubmitGrade: this.checkCanSubmit(gradeData)
    });
  },

  // 检查是否可以提交
  checkCanSubmit(gradeData) {
    return gradeData.grade && gradeData.feedback && gradeData.feedback.trim().length > 0;
  },

  // 取消批改
  cancelGrading() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消批改吗？已填写的内容将不会保存',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            currentSubmission: null,
            gradeData: {
              grade: '',
              score: '',
              feedback: ''
            },
            canSubmitGrade: false
          });
        }
      }
    });
  },

  // 提交批改
  async submitGrade() {
    if (!this.data.canSubmitGrade || this.data.isSubmitting) {
      return;
    }
    
    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '提交中...' });
    
    try {
      const res = await app.request({
        url: '/api/v1/submissions/grade',
        method: 'POST',
        data: {
          submission_id: this.data.currentSubmission.id,
          grade: this.data.gradeData.grade,
          score: this.data.gradeData.score || null,
          feedback: this.data.gradeData.feedback.trim()
        }
      });
      
      if (res.data.code === 200) {
        wx.showToast({
          title: '批改成功',
          icon: 'success'
        });
        
        // 更新当前提交的状态
        const submissions = [...this.data.submissions];
        submissions[this.data.currentIndex] = {
          ...submissions[this.data.currentIndex],
          status: 'reviewed',
          grade: this.data.gradeData.grade,
          score: this.data.gradeData.score,
          feedback: this.data.gradeData.feedback,
          gradeText: this.getGradeText(this.data.gradeData.grade)
        };
        
        // 更新统计
        const pendingCount = submissions.filter(s => s.status === 'pending').length;
        const reviewedCount = submissions.filter(s => s.status === 'reviewed' || s.status === 'graded').length;
        
        this.setData({
          submissions,
          pendingCount,
          reviewedCount
        });
        
        // 自动跳转到下一份（如果有）
        setTimeout(() => {
          if (this.data.currentIndex < this.data.submissions.length - 1) {
            this.nextSubmission();
          } else {
            // 没有更多作业了，返回列表
            this.setData({
              currentSubmission: null,
              gradeData: {
                grade: '',
                score: '',
                feedback: ''
              },
              canSubmitGrade: false
            });
          }
        }, 1500);
      } else {
        throw new Error(res.data.message || '批改失败');
      }
    } catch (error) {
      console.error('提交批改失败:', error);
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isSubmitting: false });
      wx.hideLoading();
    }
  },

  // 批量批改
  batchGrade() {
    wx.showModal({
      title: '批量批改',
      content: '批量批改功能开发中，敬请期待',
      showCancel: false
    });
  },

  // 导出成绩
  async exportGrades() {
    wx.showLoading({ title: '准备导出...' });
    
    try {
      const res = await app.request({
        url: `/api/v1/admin/export-grades/${this.data.taskId}`,
        method: 'POST'
      });
      
      if (res.data.code === 200) {
        wx.hideLoading();
        wx.showModal({
          title: '导出成功',
          content: '成绩文件已准备好，请在电脑端下载',
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

  // 获取评价文本
  getGradeText(grade) {
    const gradeMap = {
      'excellent': '极佳',
      'good': '优秀',
      'review': '待复盘'
    };
    return gradeMap[grade] || '';
  },

  // 格式化日期
  formatDate(dateStr) {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60 * 1000) {
      return '刚刚';
    }
    
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes}分钟前`;
    }
    
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours}小时前`;
    }
    
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
});