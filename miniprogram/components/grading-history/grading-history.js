Component({
  properties: {
    // 是否显示历史记录
    show: {
      type: Boolean,
      value: false
    },
    
    // 学生信息
    studentName: {
      type: String,
      value: ''
    },
    
    // 任务ID
    taskId: {
      type: String,
      value: ''
    },
    
    // 学生ID（用于查询特定学生的记录）
    studentId: {
      type: String,
      value: ''
    },
    
    // 是否允许导出
    allowExport: {
      type: Boolean,
      value: false
    }
  },

  data: {
    loading: false,
    timelineItems: [],
    historyData: {
      totalSubmissions: 0,
      gradedCount: 0,
      avgScore: 0
    }
  },

  observers: {
    'show': function(show) {
      if (show) {
        this.loadGradingHistory();
      }
    }
  },

  methods: {
    // 加载批改历史数据
    async loadGradingHistory() {
      if (!this.data.taskId) {
        console.error('缺少任务ID');
        return;
      }

      this.setData({ loading: true });

      try {
        const app = getApp();
        const params = {
          taskId: this.data.taskId
        };
        
        // 如果有学生ID，查询特定学生的记录
        if (this.data.studentId) {
          params.studentId = this.data.studentId;
        }

        // 获取批改历史数据
        const response = await app.request({
          url: '/api/v1/grading/history',
          method: 'GET',
          data: params
        });

        if (response.code === 200) {
          this.processHistoryData(response.data);
        } else {
          throw new Error(response.message || '获取历史记录失败');
        }
      } catch (error) {
        console.error('加载批改历史失败:', error);
        wx.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        });
        
        // 显示空数据
        this.setData({
          timelineItems: [],
          historyData: {
            totalSubmissions: 0,
            gradedCount: 0,
            avgScore: 0
          }
        });
      } finally {
        this.setData({ loading: false });
      }
    },

    // 处理历史数据，生成时间线
    processHistoryData(data) {
      const { submissions = [], statistics = {} } = data;
      const timelineItems = [];

      // 对提交记录按时间排序（最新的在前）
      const sortedSubmissions = submissions.sort((a, b) => 
        new Date(b.submitted_at) - new Date(a.submitted_at)
      );

      // 生成时间线项目
      sortedSubmissions.forEach((submission, index) => {
        // 添加提交记录
        timelineItems.push({
          id: `submission_${submission.id}`,
          type: 'submission',
          icon: '📝',
          timeText: this.formatDateTime(submission.submitted_at),
          attemptNumber: submission.attempt_number || (index + 1),
          status: submission.status,
          statusText: this.getStatusText(submission.status),
          hasContent: !!(submission.images?.length || submission.text),
          images: submission.images || [],
          text: submission.text || '',
          submissionId: submission.id,
          timestamp: submission.submitted_at
        });

        // 如果有批改记录，添加批改记录
        if (submission.graded_at) {
          const gradingDuration = this.calculateGradingDuration(
            submission.submitted_at, 
            submission.graded_at
          );

          timelineItems.push({
            id: `grading_${submission.id}`,
            type: 'grading',
            icon: '✍️',
            timeText: this.formatDateTime(submission.graded_at),
            grade: submission.grade,
            gradeText: this.getGradeText(submission.grade),
            score: submission.score,
            totalScore: submission.total_score || 100,
            feedback: submission.feedback,
            graderName: submission.graded_by,
            gradingDuration: gradingDuration,
            gradingDurationText: this.formatDuration(gradingDuration),
            submissionId: submission.id,
            timestamp: submission.graded_at
          });
        }
      });

      // 添加系统事件（如重置提交次数等）
      if (statistics.resetEvents) {
        statistics.resetEvents.forEach(event => {
          timelineItems.push({
            id: `system_${event.id}`,
            type: 'system',
            icon: '🔄',
            title: event.title || '提交次数重置',
            description: event.description || '因上次作业被评为"待复盘"，提交次数已重置',
            timeText: this.formatDateTime(event.created_at),
            timestamp: event.created_at
          });
        });
      }

      // 按时间重新排序（最新的在前）
      timelineItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // 处理统计数据
      const historyData = {
        totalSubmissions: statistics.total_submissions || submissions.length,
        gradedCount: statistics.graded_count || submissions.filter(s => s.graded_at).length,
        avgScore: statistics.avg_score || this.calculateAverageScore(submissions)
      };

      this.setData({
        timelineItems,
        historyData
      });
    },

    // 计算平均分数
    calculateAverageScore(submissions) {
      const gradedSubmissions = submissions.filter(s => s.score);
      if (gradedSubmissions.length === 0) return '--';
      
      const totalScore = gradedSubmissions.reduce((sum, s) => sum + (s.score || 0), 0);
      return Math.round(totalScore / gradedSubmissions.length * 10) / 10;
    },

    // 计算批改耗时（分钟）
    calculateGradingDuration(submittedAt, gradedAt) {
      if (!submittedAt || !gradedAt) return 0;
      
      const submittedTime = new Date(submittedAt);
      const gradedTime = new Date(gradedAt);
      
      return Math.max(0, Math.floor((gradedTime - submittedTime) / (1000 * 60)));
    },

    // 格式化时长
    formatDuration(minutes) {
      if (minutes < 60) {
        return `${minutes}分钟`;
      } else if (minutes < 1440) { // 24小时
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
      } else {
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
      }
    },

    // 格式化日期时间
    formatDateTime(dateString) {
      if (!dateString) return '';
      
      const date = new Date(dateString);
      const now = new Date();
      const diff = now - date;
      
      // 1分钟内
      if (diff < 60 * 1000) {
        return '刚刚';
      }
      
      // 1小时内
      if (diff < 60 * 60 * 1000) {
        return `${Math.floor(diff / (60 * 1000))}分钟前`;
      }
      
      // 今天
      if (date.toDateString() === now.toDateString()) {
        return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      
      // 昨天
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
        return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      
      // 本年
      if (date.getFullYear() === now.getFullYear()) {
        return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      }
      
      // 其他年份
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    },

    // 获取状态文本
    getStatusText(status) {
      const statusMap = {
        'pending': '待批改',
        'graded': '已批改',
        'submitted': '已提交'
      };
      return statusMap[status] || status;
    },

    // 获取评分文本
    getGradeText(grade) {
      const gradeMap = {
        'excellent': '极佳',
        'good': '优秀', 
        'review': '待复盘'
      };
      return gradeMap[grade] || grade;
    },

    // 预览图片
    previewImage(e) {
      const url = e.currentTarget.dataset.url;
      const timelineItem = this.data.timelineItems.find(item => 
        item.images && item.images.includes(url)
      );
      
      if (timelineItem && timelineItem.images) {
        wx.previewImage({
          current: url,
          urls: timelineItem.images
        });
      }
    },

    // 导出历史记录
    async exportHistory() {
      try {
        wx.showLoading({ title: '准备导出...' });
        
        const app = getApp();
        const response = await app.request({
          url: '/api/v1/grading/history/export',
          method: 'POST',
          data: {
            taskId: this.data.taskId,
            studentId: this.data.studentId,
            format: 'excel' // 可选: excel, pdf
          }
        });

        wx.hideLoading();
        
        if (response.code === 200) {
          wx.showModal({
            title: '导出成功',
            content: '批改历史已导出，请在电脑端下载',
            showCancel: false
          });
        } else {
          throw new Error(response.message || '导出失败');
        }
      } catch (error) {
        wx.hideLoading();
        wx.showToast({
          title: error.message || '导出失败',
          icon: 'none'
        });
      }
    },

    // 关闭历史记录面板
    close() {
      this.triggerEvent('close');
    }
  }
});