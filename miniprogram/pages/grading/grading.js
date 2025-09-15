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
    isTeacher: false,
    loading: false,
    
    // 验证错误
    gradeError: '',
    feedbackError: '',
    
    // 批改历史
    showGradingHistory: false,
    
    // 数据统计面板
    showAnalytics: false,
    
    // 批改统计数据
    gradingStats: {
      completedCount: 0,
      pendingCount: 0,
      avgGradingTime: '0min',
      totalTime: 0,
      efficiency: 0
    }
  },

  onLoad(options) {
    // 兼容两种参数名：taskId 和 task_id
    const taskId = options.taskId || options.task_id;
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
        url: `/tasks/${this.data.taskId}`,
        method: 'GET'
      });
      
      // app.request 成功时直接返回 data 部分，失败时会抛出异常
      this.setData({
        task: res
      });
    } catch (error) {
      console.error('加载任务信息失败:', error);
    }
  },

  // 加载提交列表
  async loadSubmissions() {
    this.setData({ loading: true });
    
    try {
      const res = await app.request({
        url: `/admin/tasks/${this.data.taskId}/submissions`,
        method: 'GET',
        data: {
          status: this.data.filterStatus === 'all' ? undefined : this.data.filterStatus
        }
      });
      
      // app.request 成功时直接返回 data 部分，失败时会抛出异常
      const submissions = res?.submissions || [];
      
      // 处理提交数据
      const processedSubmissions = submissions.map((item) => ({
        ...item,
        submitted_at: this.formatDate(item.submitted_at),
        graded_at: item.graded_at ? this.formatDate(item.graded_at) : null,
        gradeText: this.getGradeText(item.grade),
        attemptNumber: item.attempt_number || 1,
        images: (item.images || []).map(img => {
          // 确保图片路径是完整的URL
          if (img && !img.startsWith('http')) {
            // 移除 baseUrl 中的 /api/v1 部分，直接拼接域名和端口
            const baseUrl = getApp().globalData.baseUrl.replace('/api/v1', '');
            return `${baseUrl}${img}`;
          }
          return img;
        })
      }));
      
      // 统计数量 - 修正状态映射
      const pendingCount = submissions.filter(s => s.status === 'submitted').length;
      const reviewedCount = submissions.filter(s => s.status === 'graded').length;
      
      // 更新统计数据
      this.updateGradingStats(processedSubmissions);

      this.setData({
        submissions: processedSubmissions,
        pendingCount,
        reviewedCount
      });
    } catch (error) {
      console.error('加载提交列表失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.loadTaskInfo();
    await this.loadSubmissions();
    wx.stopPullDownRefresh();
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
      canSubmitGrade: this.checkCanSubmit(gradeData),
      // 确保组件需要的数据存在
      currentStudent: submission.student_info ? {
        id: submission.student_info.id,
        nickname: submission.student_info.nickname || '学生',
        avatar_url: submission.student_info.avatar_url || ''
      } : {
        id: submission.student_id || 0,
        nickname: '学生',
        avatar_url: ''
      }
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
      gradeError: '', // 清除错误
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

  // 输入评语（兼容传统方式）
  onFeedbackInput(e) {
    const feedback = e.detail.value;
    const gradeData = { ...this.data.gradeData, feedback };
    
    this.setData({
      gradeData,
      feedbackError: '', // 清除错误
      canSubmitGrade: this.checkCanSubmit(gradeData)
    });
  },

  // 混合输入处理
  onMixedInput(e) {
    const { value, type } = e.detail;
    const gradeData = { ...this.data.gradeData, feedback: value };
    
    this.setData({
      gradeData,
      feedbackError: '', // 清除错误
      canSubmitGrade: this.checkCanSubmit(gradeData)
    });
    
    // 记录输入方式统计
    this.recordInputMethod(type);
  },

  // 评语确认输入
  onFeedbackConfirm(e) {
    const { value, type, wordCount } = e.detail;
    const gradeData = { ...this.data.gradeData, feedback: value };
    
    this.setData({
      gradeData,
      feedbackError: '',
      canSubmitGrade: this.checkCanSubmit(gradeData)
    });

    // 显示确认反馈
    wx.showToast({
      title: `评语已输入（${wordCount}字）`,
      icon: 'success',
      duration: 1500
    });

    // 记录输入完成统计
    this.recordInputComplete(type, wordCount);
  },

  // 语音转写完成处理
  onTranscriptionComplete(e) {
    const { transcription, duration } = e.detail;
    
    // 记录转写统计
    this.recordTranscriptionStats(duration, transcription.length);
    
    console.log('语音转写完成:', {
      duration: duration,
      length: transcription.length,
      transcription: transcription
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
    const hasGrade = gradeData.grade;
    const hasFeedback = gradeData.feedback && gradeData.feedback.trim().length > 0;
    const feedbackMinLength = gradeData.feedback && gradeData.feedback.trim().length >= 10;
    
    // 设置验证状态
    this.setData({
      gradeError: !hasGrade ? '请选择评价档位' : '',
      feedbackError: !hasFeedback ? '请输入批改评语' : 
                    (!feedbackMinLength ? '评语至少需要10个字符' : '')
    });
    
    return hasGrade && hasFeedback && feedbackMinLength;
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
      // 映射英文评级到中文
      const gradeMapping = {
        'excellent': '极佳',
        'good': '优秀', 
        'review': '待复盘'
      };
      
      const res = await app.request({
        url: '/submissions/grade',
        method: 'POST',
        data: {
          submission_id: this.data.currentSubmission.id,
          grade: gradeMapping[this.data.gradeData.grade] || this.data.gradeData.grade,
          score: this.data.gradeData.score || null,
          feedback: this.data.gradeData.feedback.trim()
        }
      });
      
      // app.request 成功时直接返回 data 部分，失败时会抛出异常
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
  },

  // 显示批改历史
  showGradingHistory() {
    if (!this.data.currentSubmission) {
      wx.showToast({
        title: '请先选择学生作业',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ showGradingHistory: true });
  },

  // 关闭批改历史
  onGradingHistoryClose() {
    this.setData({ showGradingHistory: false });
  },

  // 混合输入统计相关方法

  // 记录输入方式统计
  recordInputMethod(type) {
    try {
      const app = getApp();
      const stats = app.globalData.inputStats || {
        text: 0,
        voice: 0,
        mixed: 0
      };
      
      if (type === 'text') {
        stats.text += 1;
      } else if (type === 'voice') {
        stats.voice += 1;
      }
      
      app.globalData.inputStats = stats;
      
      // 可以定期上报到服务器
      this.reportInputStats(stats);
    } catch (error) {
      console.warn('记录输入统计失败:', error);
    }
  },

  // 记录输入完成统计
  recordInputComplete(type, wordCount) {
    try {
      const completeStats = {
        type: type,
        wordCount: wordCount,
        timestamp: Date.now(),
        taskId: this.data.taskId,
        submissionId: this.data.currentSubmission?.id
      };
      
      // 存储到本地统计
      const localStats = wx.getStorageSync('gradingInputStats') || [];
      localStats.push(completeStats);
      
      // 保留最近100条记录
      if (localStats.length > 100) {
        localStats.splice(0, localStats.length - 100);
      }
      
      wx.setStorageSync('gradingInputStats', localStats);
      
      console.log('输入完成统计已记录:', completeStats);
    } catch (error) {
      console.warn('记录输入完成统计失败:', error);
    }
  },

  // 记录转写统计
  recordTranscriptionStats(duration, textLength) {
    try {
      const transcriptionStats = {
        duration: duration, // 录音时长(ms)
        textLength: textLength, // 转写文本长度
        timestamp: Date.now(),
        speed: textLength / (duration / 1000), // 字符/秒
        taskId: this.data.taskId
      };
      
      // 存储转写效率统计
      const transStats = wx.getStorageSync('transcriptionStats') || [];
      transStats.push(transcriptionStats);
      
      if (transStats.length > 50) {
        transStats.splice(0, transStats.length - 50);
      }
      
      wx.setStorageSync('transcriptionStats', transStats);
      
      console.log('转写统计已记录:', transcriptionStats);
    } catch (error) {
      console.warn('记录转写统计失败:', error);
    }
  },

  // 上报输入统计到服务器
  async reportInputStats(stats) {
    try {
      // 定期上报，避免频繁请求
      const lastReport = wx.getStorageSync('lastInputStatsReport') || 0;
      const now = Date.now();
      
      // 每10分钟上报一次
      if (now - lastReport < 10 * 60 * 1000) {
        return;
      }
      
      const app = getApp();
      await app.request({
        url: '/statistics/input-methods',
        method: 'POST',
        data: {
          textCount: stats.text,
          voiceCount: stats.voice,
          mixedCount: stats.mixed,
          reportTime: now
        },
        showError: false // 静默上报
      });
      
      wx.setStorageSync('lastInputStatsReport', now);
    } catch (error) {
      console.warn('上报输入统计失败:', error);
    }
  },

  // 图片加载错误处理
  onImageError(e) {
    console.warn('图片加载失败:', e.detail.errMsg);
    // 可以在这里添加默认图片或重试逻辑
  },

  // 更新批改统计数据
  updateGradingStats(submissions) {
    const completedCount = submissions.filter(s => s.status === 'reviewed' || s.status === 'graded').length;
    const pendingCount = submissions.filter(s => s.status === 'pending').length;
    
    // 计算平均批改时间（模拟数据，实际应从服务器获取）
    const avgMinutes = Math.max(1, Math.floor(Math.random() * 5) + 2);
    const avgGradingTime = `${avgMinutes}min`;
    
    // 计算效率指标
    const totalSubmissions = submissions.length;
    const efficiency = totalSubmissions > 0 ? Math.round((completedCount / totalSubmissions) * 100) : 0;
    
    this.setData({
      'gradingStats.completedCount': completedCount,
      'gradingStats.pendingCount': pendingCount,
      'gradingStats.avgGradingTime': avgGradingTime,
      'gradingStats.efficiency': efficiency
    });
  },

  // 处理导航组件的导航事件
  onNavigatorNavigate(e) {
    const { action, targetIndex } = e.detail;
    
    if (targetIndex < 0 || targetIndex >= this.data.submissions.length) {
      return;
    }
    
    const submission = this.data.submissions[targetIndex];
    
    // 加载批改数据
    let gradeData = {
      grade: submission.grade || '',
      score: submission.score || '',
      feedback: submission.feedback || ''
    };
    
    // 记录批改开始时间
    const gradingStartTime = Date.now();
    
    this.setData({
      currentSubmission: {
        ...submission,
        attemptNumber: submission.attempt_number || 1,
        timeAgo: this.formatTimeAgo(submission.submitted_at)
      },
      currentIndex: targetIndex,
      gradeData,
      canSubmitGrade: this.validateGradeData(gradeData),
      gradingStartTime
    });
  },

  // 处理导航组件的操作事件
  onNavigatorAction(e) {
    const { type, studentId, flagged } = e.detail;
    
    switch (type) {
      case 'flag':
        this.toggleStudentFlag(studentId, flagged);
        break;
      case 'history':
        this.showGradingHistory();
        break;
      case 'note':
        this.addStudentNote(studentId);
        break;
      case 'continue_grading':
        // 继续批改逻辑
        this.focusOnNextPending();
        break;
    }
  },

  // 切换学生标记
  toggleStudentFlag(studentId, flagged) {
    // 更新本地数据
    const submissions = this.data.submissions.map(s => {
      if (s.user.id === studentId) {
        s.user.flagged = flagged;
      }
      return s;
    });
    
    this.setData({ submissions });
    
    // 同步到服务器
    app.request({
      url: '/api/v1/admin/students/flag',
      method: 'POST',
      data: {
        student_id: studentId,
        flagged: flagged
      },
      showError: false
    }).catch(error => {
      console.warn('更新学生标记失败:', error);
    });
  },

  // 添加学生备注
  addStudentNote(studentId) {
    wx.showModal({
      title: '添加备注',
      placeholderText: '请输入备注内容...',
      editable: true,
      success: (res) => {
        if (res.confirm && res.content) {
          // 保存备注
          app.request({
            url: '/api/v1/admin/students/note',
            method: 'POST',
            data: {
              student_id: studentId,
              note: res.content
            }
          }).then(() => {
            wx.showToast({
              title: '备注已保存',
              icon: 'success'
            });
          }).catch(error => {
            console.error('保存备注失败:', error);
            wx.showToast({
              title: '保存失败',
              icon: 'error'
            });
          });
        }
      }
    });
  },

  // 聚焦到下一个待批改的作业
  focusOnNextPending() {
    const { submissions, currentIndex } = this.data;
    
    // 查找下一个待批改的作业
    let nextPendingIndex = -1;
    for (let i = currentIndex + 1; i < submissions.length; i++) {
      if (submissions[i].status === 'pending') {
        nextPendingIndex = i;
        break;
      }
    }
    
    // 如果没找到，从头开始查找
    if (nextPendingIndex === -1) {
      for (let i = 0; i < currentIndex; i++) {
        if (submissions[i].status === 'pending') {
          nextPendingIndex = i;
          break;
        }
      }
    }
    
    // 跳转到找到的作业
    if (nextPendingIndex !== -1) {
      this.onNavigatorNavigate({
        detail: {
          action: 'jump',
          targetIndex: nextPendingIndex
        }
      });
    } else {
      wx.showToast({
        title: '所有作业已批改完成',
        icon: 'success'
      });
    }
  },

  // 显示数据统计面板
  showGradingAnalytics() {
    if (this.data.submissions.length === 0) {
      wx.showToast({
        title: '暂无数据可统计',
        icon: 'none'
      });
      return;
    }

    this.setData({ 
      showAnalytics: true 
    });
  },

  // 关闭数据统计面板
  onAnalyticsClose() {
    this.setData({ 
      showAnalytics: false 
    });
  },

  // 显示需复盘学生详情
  onShowReviewStudents(e) {
    const { students } = e.detail;
    
    if (!students || students.length === 0) {
      return;
    }

    // 构建学生列表信息
    const studentNames = students.map(s => s.user.nickname || '学生').join('、');
    const message = `以下学生需要重点关注和辅导：\n\n${studentNames}\n\n建议安排一对一指导时间，帮助他们提升学习效果。`;

    wx.showModal({
      title: '需要重点关注的学生',
      content: message,
      showCancel: true,
      cancelText: '知道了',
      confirmText: '安排辅导',
      success: (res) => {
        if (res.confirm) {
          // 跳转到辅导安排页面或触发相应功能
          this.arrangeGuidance(students);
        }
      }
    });
  },

  // 应用个性化建议
  onApplySuggestion(e) {
    const { suggestion } = e.detail;
    
    switch (suggestion.id) {
      case 'completion':
        this.showGradingTips();
        break;
      case 'showcase':
        this.selectShowcaseSubmissions();
        break;
      case 'review':
        this.arrangeReviewSessions();
        break;
      case 'efficiency':
        this.showVoiceGradingGuide();
        break;
      default:
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        });
    }
  },

  // 导出统计报告
  onExportReport(e) {
    const { taskId, analytics } = e.detail;
    
    // 构建报告数据
    const reportData = {
      taskId,
      taskTitle: this.data.task.title,
      exportTime: new Date().toLocaleString(),
      analytics,
      submissions: this.data.submissions
    };

    // 保存到本地
    try {
      wx.setStorageSync(`grading_report_${taskId}`, reportData);
      
      wx.showModal({
        title: '报告已生成',
        content: '统计报告已保存到本地，您可以通过"我的"页面查看和分享。',
        showCancel: false,
        confirmText: '知道了'
      });
    } catch (error) {
      console.error('保存报告失败:', error);
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      });
    }
  },

  // 批改技巧提示
  showGradingTips() {
    wx.showModal({
      title: '批改效率提升技巧',
      content: '1. 使用语音录制功能快速给出评语\n2. 利用常用评语模板\n3. 优先批改提交较早的作业\n4. 集中时间段进行批改\n5. 合理使用快捷评分',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 选择展示作业
  selectShowcaseSubmissions() {
    const excellentSubmissions = this.data.submissions.filter(s => s.grade === 'excellent');
    
    if (excellentSubmissions.length === 0) {
      wx.showToast({
        title: '暂无优秀作业可展示',
        icon: 'none'
      });
      return;
    }

    // 这里可以实现选择展示作业的逻辑
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 安排复盘辅导
  arrangeReviewSessions() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 显示语音批改指南
  showVoiceGradingGuide() {
    wx.showModal({
      title: '语音批改使用指南',
      content: '语音批改可以让您的评语更加生动和个性化：\n\n1. 点击评语输入框的麦克风图标\n2. 长按录制您的语音评语\n3. 系统会自动转换为文字\n4. 您可以编辑转换结果\n\n语音批改平均可提升50%的效率！',
      showCancel: true,
      cancelText: '知道了',
      confirmText: '立即体验',
      success: (res) => {
        if (res.confirm) {
          // 关闭统计面板，进入批改模式
          this.setData({ showAnalytics: false });
          
          // 如果当前没有选中作业，选择第一个待批改的
          if (!this.data.currentSubmission) {
            const firstPending = this.data.submissions.findIndex(s => s.status === 'pending');
            if (firstPending !== -1) {
              this.selectSubmission({
                currentTarget: { dataset: { index: firstPending } }
              });
            }
          }
        }
      }
    });
  },

  // 安排学生辅导
  arrangeGuidance(students) {
    // 这里可以集成日程管理功能
    const studentNames = students.map(s => s.user.nickname || '学生').join('、');
    
    wx.showToast({
      title: `已安排${studentNames}的辅导`,
      icon: 'success'
    });
  }
});