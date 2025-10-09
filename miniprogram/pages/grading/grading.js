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
    loadingSubmission: false,
    
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
    
    // 添加调试信息
    console.log('📍 [DEBUG] 批改页面加载完成，taskId:', taskId);
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
          filter: this.data.filterStatus === 'all' ? undefined : 
                  this.data.filterStatus === 'pending' ? 'submitted' :
                  this.data.filterStatus === 'reviewed' ? 'graded' : 
                  this.data.filterStatus
        }
      });
      
      // app.request 成功时直接返回 data 部分，失败时会抛出异常
      const submissions = res?.submissions || [];
      
      console.log('🔍 [DEBUG] Raw submissions from backend:', submissions);
      console.log('🔍 [DEBUG] Total submissions count:', submissions.length);
      
      // 检查每个提交的图片数据
      submissions.forEach((submission, index) => {
        console.log(`🔍 [DEBUG] Submission ${index + 1}:`, {
          id: submission.id,
          student_id: submission.student_id,
          images_raw: submission.images,
          images_type: typeof submission.images,
          images_length: Array.isArray(submission.images) ? submission.images.length : 'not array',
          text: submission.text,
          student_info: submission.student_info
        });
      });
      
      // 首先按时间排序提交 - 最新的在前面
      const sortedSubmissions = submissions.sort((a, b) => {
        const timeA = new Date(a.submitted_at || a.created_at);
        const timeB = new Date(b.submitted_at || b.created_at);
        return timeB - timeA; // 降序排列，最新的在前
      });
      
      console.log('📍 [DEBUG] 排序后的提交:', sortedSubmissions.map(s => ({
        id: s.id,
        student: s.student_info?.nickname,
        time: s.submitted_at || s.created_at
      })));

      // 计算每个学生的提交次数
      const studentSubmissionCounts = {};
      sortedSubmissions.forEach((submission) => {
        const studentId = submission.student_id || submission.student_info?.id;
        if (studentId) {
          studentSubmissionCounts[studentId] = (studentSubmissionCounts[studentId] || 0) + 1;
        }
      });

      console.log('📍 [DEBUG] 学生提交计数:', studentSubmissionCounts);

      // 处理提交数据 - 修复nickname和attempt number
      const processedSubmissions = sortedSubmissions.map((item, index) => {
        const studentId = item.student_id || item.student_info?.id;
        
        // 计算当前学生的第几次提交（正确逻辑：最新的应该是最高次数）
        let attemptNumber = 1;
        if (studentId) {
          // 计算该学生总共有多少次提交
          const totalStudentSubmissions = sortedSubmissions.filter(s => 
            (s.student_id || s.student_info?.id) === studentId
          );
          
          // 计算该学生在当前索引位置之前有多少次提交
          const submissionsBeforeThisOne = sortedSubmissions.slice(0, index).filter(s => 
            (s.student_id || s.student_info?.id) === studentId
          );
          
          // attemptNumber = 总数 - 前面的数量
          // 这样最新的（索引0）会得到最高的数字，最早的会得到1
          attemptNumber = totalStudentSubmissions.length - submissionsBeforeThisOne.length;
        }
        
        // 修复学生信息
        const studentInfo = {
          id: studentId,
          nickname: item.student_info?.nickname || item.student_info?.name || `学生${studentId}`,
          avatar_url: item.student_info?.avatar_url || ''
        };
        
        console.log(`📍 [DEBUG] 处理提交 ${index + 1}:`, {
          studentId,
          nickname: studentInfo.nickname,
          attemptNumber,
          totalSubmissions: studentId ? sortedSubmissions.filter(s => (s.student_id || s.student_info?.id) === studentId).length : 0,
          时间: item.submitted_at || item.created_at,
          originalAttempt: item.attempt_number
        });

        return {
          ...item,
          student_info: studentInfo,
          submitted_at: this.formatDate(item.submitted_at),
          graded_at: item.graded_at ? this.formatDate(item.graded_at) : null,
          gradeText: this.getGradeText(item.grade),
          attemptNumber: attemptNumber,
          images: (item.images || []).map(img => {
            // 确保图片路径是完整的URL
            if (img && !img.startsWith('http')) {
              // 移除 baseUrl 中的 /api/v1 部分，直接拼接域名和端口
              const baseUrl = getApp().globalData.baseUrl.replace('/api/v1', '');
              return `${baseUrl}${img}`;
            }
            return img;
          })
        };
      });
      
      // 统计数量 - 修正状态映射
      const pendingCount = submissions.filter(s => s.status === 'submitted').length;
      const reviewedCount = submissions.filter(s => s.status === 'graded').length;

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

  // 选择要批改的作业 - 获取完整submission数据
  async selectSubmission(e) {
    const index = e.currentTarget.dataset.index;
    console.log('📍 [DEBUG] selectSubmission 被调用，索引:', index);
    console.log('📍 [DEBUG] 当前submissions数量:', this.data.submissions.length);
    await this.loadSubmissionAtIndex(index);
  },

  // 处理submission数据的独立方法
  processSubmissionData(submission, index) {
    console.log('🔍 [DEBUG] 处理submission数据:', submission);
    console.log('🔍 [DEBUG] 提交图片原始数据:', submission.images);
    console.log('🔍 [DEBUG] 图片数组类型:', typeof submission.images);
    console.log('🔍 [DEBUG] 图片数组长度:', Array.isArray(submission.images) ? submission.images.length : 'not array');
    console.log('🔍 [DEBUG] 提交文本:', submission.text);
    
    // 如果已批改，加载已有的批改数据
    let gradeData = {
      grade: submission.grade || '',
      feedback: submission.feedback || ''
    };
    
    // 处理submission中的所有内容：确保显示所有文件、图片和文本
    const allFiles = submission.images || [];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const documentExtensions = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];
    
    console.log('🔍 [CRITICAL] 原始submission.images:', allFiles);
    console.log('🔍 [CRITICAL] 文件总数:', allFiles.length);
    console.log('🔍 [CRITICAL] submission.text:', submission.text);
    
    // 处理所有文件，确保完整URL
    const processedFiles = allFiles.map(file => {
      if (file && !file.startsWith('http')) {
        const baseUrl = getApp().globalData.baseUrl.replace('/api/v1', '');
        return `${baseUrl}${file}`;
      }
      return file;
    });
    
    console.log('🔍 [CRITICAL] 处理后的完整文件列表:', processedFiles);
    
    // 分离图片和文档文件
    const images = [];
    const documents = [];
    
    processedFiles.forEach((file, index) => {
      console.log(`🔍 [CRITICAL] 处理文件 ${index + 1}: ${file}`);
      
      const fileName = file.toLowerCase();
      const isImage = imageExtensions.some(ext => fileName.endsWith(ext));
      const isDocument = documentExtensions.some(ext => fileName.endsWith(ext));
      
      if (isImage) {
        images.push(file);
        console.log(`✅ [CRITICAL] 图片: ${file}`);
      } else if (isDocument) {
        documents.push({
          url: file,
          name: file.split('/').pop(),
          type: fileName.endsWith('.pdf') ? 'pdf' : 
                fileName.endsWith('.doc') || fileName.endsWith('.docx') ? 'word' : 'document'
        });
        console.log(`📄 [CRITICAL] 文档: ${file}`);
      } else {
        // 未知类型，作为普通文件处理
        documents.push({
          url: file,
          name: file.split('/').pop(),
          type: 'unknown'
        });
        console.log(`📁 [CRITICAL] 未知文件: ${file}`);
      }
    });
    
    console.log('🔍 [CRITICAL] 最终图片数量:', images.length, images);
    console.log('🔍 [CRITICAL] 最终文档数量:', documents.length, documents);
    console.log('🔍 [CRITICAL] 文本内容存在:', !!submission.text, submission.text);
    
    // 确保正确的学生信息和尝试次数
    // 如果submission已经有正确的student_info（从列表传入），则使用它；否则构造默认的
    console.log('🔍 [DEBUG] processSubmissionData - 原始学生信息:', submission.student_info);
    console.log('🔍 [DEBUG] processSubmissionData - student_id:', submission.student_id);
    
    const studentInfo = submission.student_info && submission.student_info.nickname ? 
      submission.student_info : 
      {
        id: submission.student_id || submission.student_info?.id,
        nickname: submission.student_info?.nickname || submission.student_info?.name || `学生${submission.student_id}`,
        avatar_url: submission.student_info?.avatar_url || ''
      };
      
    console.log('🔍 [DEBUG] processSubmissionData - 最终学生信息:', studentInfo);

    const processedSubmission = {
      ...submission,
      student_info: studentInfo,
      images: images, // 只包含图片
      documents: documents, // 文档文件单独处理
      text: submission.text || '',
      submitted_at: this.formatDate(submission.submitted_at || submission.created_at),
      attemptNumber: submission.attemptNumber || submission.attempt_number || submission.submission_count || 1
    };
    
    console.log('🔍 [DEBUG] 处理后的提交数据:', processedSubmission);
    
    this.setData({
      currentSubmission: processedSubmission,
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
  async previousSubmission() {
    console.log('📍 [DEBUG] previousSubmission 被调用');
    console.log('📍 [DEBUG] 当前索引:', this.data.currentIndex);
    console.log('📍 [DEBUG] 总提交数:', this.data.submissions.length);
    console.log('📍 [DEBUG] 当前submission:', this.data.currentSubmission ? 'exists' : 'null');
    
    // 立即显示反馈，证明函数被调用了
    wx.showToast({
      title: '正在切换上一篇...',
      icon: 'loading',
      duration: 1000
    });
    
    // 确保有提交列表
    if (!this.data.submissions || this.data.submissions.length === 0) {
      console.log('📍 [ERROR] 没有提交列表');
      wx.showToast({
        title: '没有可切换的作业',
        icon: 'none'
      });
      return;
    }
    
    // 如果没有当前选中的submission，选择第一个
    if (!this.data.currentSubmission) {
      console.log('📍 [DEBUG] 没有当前submission，选择第一个');
      await this.loadSubmissionAtIndex(0);
      return;
    }
    
    if (this.data.currentIndex > 0) {
      const index = this.data.currentIndex - 1;
      console.log('📍 [DEBUG] 切换到索引:', index);
      try {
        await this.loadSubmissionAtIndex(index);
        console.log('📍 [DEBUG] 切换成功');
        wx.showToast({
          title: '切换成功',
          icon: 'success'
        });
      } catch (error) {
        console.error('📍 [ERROR] 切换失败:', error);
        wx.showToast({
          title: '切换失败',
          icon: 'error'
        });
      }
    } else {
      console.log('📍 [DEBUG] 已经是第一份作业，无法继续往前');
      wx.showToast({
        title: '已经是第一份作业',
        icon: 'none'
      });
    }
  },

  // 下一份作业
  async nextSubmission() {
    console.log('📍 [DEBUG] nextSubmission 被调用');
    console.log('📍 [DEBUG] 当前索引:', this.data.currentIndex);
    console.log('📍 [DEBUG] 总提交数:', this.data.submissions.length);
    console.log('📍 [DEBUG] 当前submission:', this.data.currentSubmission ? 'exists' : 'null');
    
    // 立即显示反馈，证明函数被调用了
    wx.showToast({
      title: '正在切换下一篇...',
      icon: 'loading',
      duration: 1000
    });
    
    // 确保有提交列表
    if (!this.data.submissions || this.data.submissions.length === 0) {
      console.log('📍 [ERROR] 没有提交列表');
      wx.showToast({
        title: '没有可切换的作业',
        icon: 'none'
      });
      return;
    }
    
    // 如果没有当前选中的submission，选择第一个
    if (!this.data.currentSubmission) {
      console.log('📍 [DEBUG] 没有当前submission，选择第一个');
      await this.loadSubmissionAtIndex(0);
      return;
    }
    
    if (this.data.currentIndex < this.data.submissions.length - 1) {
      const index = this.data.currentIndex + 1;
      console.log('📍 [DEBUG] 切换到索引:', index);
      try {
        await this.loadSubmissionAtIndex(index);
        console.log('📍 [DEBUG] 切换成功');
        wx.showToast({
          title: '切换成功',
          icon: 'success'
        });
      } catch (error) {
        console.error('📍 [ERROR] 切换失败:', error);
        wx.showToast({
          title: '切换失败',
          icon: 'error'
        });
      }
    } else {
      console.log('📍 [DEBUG] 已经是最后一份作业，无法继续往后');
      wx.showToast({
        title: '已经是最后一份作业',
        icon: 'none'
      });
    }
  },

  // 加载指定索引的submission（复用selectSubmission的逻辑）
  async loadSubmissionAtIndex(index) {
    console.log('🔍 [DEBUG] loadSubmissionAtIndex 被调用，索引:', index);
    console.log('🔍 [DEBUG] submissions 数组长度:', this.data.submissions.length);
    
    if (index < 0 || index >= this.data.submissions.length) {
      console.error('🔍 [ERROR] 索引超出范围:', index);
      return;
    }
    
    const submission = this.data.submissions[index];
    console.log('🔍 [DEBUG] 切换到提交作业，获取完整数据:', submission);
    
    // 显示加载状态
    this.setData({ loadingSubmission: true });
    
    // 直接从API获取完整的submission详情，确保包含所有文件
    try {
      const fullSubmission = await app.request({
        url: `/submissions/${submission.id}`,
        method: 'GET'
      });
      
      console.log('🔍 [DEBUG] 完整submission数据:', fullSubmission);
      console.log('🔍 [DEBUG] 列表中的学生信息:', submission.student_info);
      
      // 保留列表中已处理好的学生信息，合并到完整数据中
      const mergedSubmission = {
        ...fullSubmission,
        student_info: submission.student_info, // 保留列表中正确的学生信息
        attemptNumber: submission.attemptNumber // 保留正确的尝试次数
      };
      
      console.log('🔍 [DEBUG] 合并后的学生信息:', mergedSubmission.student_info);
      
      // 使用合并后的submission数据
      this.processSubmissionData(mergedSubmission, index);
      
    } catch (error) {
      console.error('获取submission详情失败:', error);
      // 降级使用原有数据
      this.processSubmissionData(submission, index);
    } finally {
      // 隐藏加载状态
      this.setData({ loadingSubmission: false });
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
    const feedbackMinLength = gradeData.feedback && gradeData.feedback.trim().length >= 5;
    
    // 设置验证状态
    this.setData({
      gradeError: !hasGrade ? '请选择评价档位' : '',
      feedbackError: hasFeedback && !feedbackMinLength ? '评语至少需要5个字符' : ''
    });
    
    // Only require grade selection, feedback is optional
    return hasGrade && (!hasFeedback || feedbackMinLength);
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
      await app.request({
        url: '/submissions/grade',
        method: 'POST',
        data: {
          submission_id: this.data.currentSubmission.id,
          grade: this.data.gradeData.grade,
          score: this.data.gradeData.score || null,
          feedback: this.data.gradeData.feedback ? this.data.gradeData.feedback.trim() : ''
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
    
    // 解析时间，如果是UTC格式，转换为北京时间
    let date = new Date(dateStr);
    
    // 如果时间字符串以Z结尾或包含UTC标识，说明是UTC时间
    if (dateStr.endsWith('Z') || dateStr.includes('UTC') || dateStr.includes('+00:00')) {
      // 转换为北京时间 (UTC+8)
      date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hour}:${minute}`;
  },


  // 图片加载错误处理
  onImageError(e) {
    console.warn('图片加载失败:', e.detail.errMsg);
    // 可以在这里添加默认图片或重试逻辑
  },


  // 测试按钮点击 - 用于调试
  testButtonClick() {
    console.log('📍 [DEBUG] 测试按钮被点击');
    wx.showToast({
      title: '按钮点击测试成功',
      icon: 'success'
    });
  },

  // 下载文档
  downloadDocument(e) {
    const { url, name } = e.currentTarget.dataset;
    
    if (!url) {
      wx.showToast({
        title: '文档链接无效',
        icon: 'none'
      });
      return;
    }

    console.log('🔍 [DEBUG] 尝试下载文档:', { url, name });

    // 对于docx等不支持的文件，提供其他方式处理
    const fileName = (name || '').toLowerCase();
    if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      wx.showModal({
        title: '文档预览',
        content: '微信小程序不支持直接打开Word文档，您可以：\n\n1. 复制链接到浏览器下载\n2. 使用其他应用打开',
        confirmText: '复制链接',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.setClipboardData({
              data: url,
              success: () => {
                wx.showToast({
                  title: '链接已复制',
                  icon: 'success'
                });
              }
            });
          }
        }
      });
      return;
    }

    wx.showLoading({ title: '准备下载...' });

    // 微信小程序下载文件
    wx.downloadFile({
      url: url,
      success: (res) => {
        wx.hideLoading();
        
        if (res.statusCode === 200) {
          // 保存到相册或者打开文件
          const filePath = res.tempFilePath;
          
          console.log('🔍 [DEBUG] 文件下载成功，临时路径:', filePath);
          
          // 显示文件信息
          wx.showModal({
            title: '文件下载成功',
            content: `文件已下载到临时目录：\n${filePath}\n\n是否尝试打开？`,
            confirmText: '打开',
            cancelText: '复制路径',
            success: (modalRes) => {
              if (modalRes.confirm) {
                // 尝试打开文件
                wx.openDocument({
                  filePath: filePath,
                  showMenu: true,
                  success: () => {
                    console.log('文档打开成功');
                    wx.showToast({
                      title: '打开成功',
                      icon: 'success'
                    });
                  },
                  fail: (error) => {
                    console.error('打开文档失败:', error);
                    // 复制文件路径到剪贴板
                    wx.setClipboardData({
                      data: filePath,
                      success: () => {
                        wx.showToast({
                          title: '文件路径已复制',
                          icon: 'success'
                        });
                      }
                    });
                  }
                });
              } else {
                // 复制文件路径到剪贴板
                wx.setClipboardData({
                  data: filePath,
                  success: () => {
                    wx.showToast({
                      title: '文件路径已复制',
                      icon: 'success'
                    });
                  }
                });
              }
            }
          });
        } else {
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        wx.hideLoading();
        console.error('下载文件失败:', error);
        wx.showToast({
          title: '下载失败，请稍后重试',
          icon: 'none'
        });
      }
    });
  }
});