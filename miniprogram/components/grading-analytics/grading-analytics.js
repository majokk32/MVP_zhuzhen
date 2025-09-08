// 批改数据统计面板组件
Component({
  properties: {
    // 是否显示面板
    show: {
      type: Boolean,
      value: false
    },
    // 任务ID
    taskId: {
      type: String,
      value: ''
    },
    // 任务标题
    taskTitle: {
      type: String,
      value: '作业任务'
    },
    // 提交数据列表
    submissions: {
      type: Array,
      value: []
    }
  },

  data: {
    // 分析数据
    analytics: {
      totalSubmissions: 0,
      completedCount: 0,
      completionRate: 0,
      submissionTrend: 0,
      avgGradingTime: '0min',
      efficiencyLevel: 'medium',
      efficiencyText: '正常',
      todayGraded: 0,
      weekGraded: 0,
      peakSpeed: 0,
      excellentCount: 0,
      excellentTrend: 0,
      reviewCount: 0,
      avgScore: 0,
      scoreTrend: 0,
      gradeDistribution: [],
      timeDistribution: [],
      suggestions: []
    },
    // 图表视图模式
    gradeViewMode: 'chart' // chart | list
  },

  observers: {
    'show, submissions': function(show, submissions) {
      if (show && submissions) {
        this.calculateAnalytics();
      }
    }
  },

  methods: {
    // 计算分析数据
    async calculateAnalytics() {
      const { submissions } = this.properties;
      
      if (!submissions || submissions.length === 0) {
        return;
      }

      // 基础统计
      const totalSubmissions = submissions.length;
      const completedSubmissions = submissions.filter(s => s.status === 'reviewed' || s.status === 'graded');
      const completedCount = completedSubmissions.length;
      const completionRate = Math.round((completedCount / totalSubmissions) * 100);

      // 成绩分布统计
      const gradeDistribution = this.calculateGradeDistribution(submissions);
      
      // 效率分析
      const efficiencyData = this.calculateEfficiency(completedSubmissions);
      
      // 时间分布
      const timeDistribution = this.calculateTimeDistribution(completedSubmissions);
      
      // 学生表现洞察
      const insightsData = this.calculateInsights(submissions);
      
      // 个性化建议
      const suggestions = this.generateSuggestions(submissions, completionRate);

      // 更新数据
      this.setData({
        analytics: {
          totalSubmissions,
          completedCount,
          completionRate,
          submissionTrend: Math.floor(Math.random() * 20) + 5, // 模拟趋势
          avgGradingTime: efficiencyData.avgTime,
          efficiencyLevel: efficiencyData.level,
          efficiencyText: efficiencyData.text,
          todayGraded: efficiencyData.todayCount,
          weekGraded: efficiencyData.weekCount,
          peakSpeed: efficiencyData.peakSpeed,
          excellentCount: insightsData.excellentCount,
          excellentTrend: insightsData.excellentTrend,
          reviewCount: insightsData.reviewCount,
          avgScore: insightsData.avgScore,
          scoreTrend: insightsData.scoreTrend,
          gradeDistribution,
          timeDistribution,
          suggestions
        }
      });
    },

    // 计算成绩分布
    calculateGradeDistribution(submissions) {
      const gradeMap = {
        excellent: { label: '极佳', icon: '🌟', description: '完成质量优异', count: 0 },
        good: { label: '优秀', icon: '👍', description: '完成质量良好', count: 0 },
        review: { label: '待复盘', icon: '📚', description: '需要改进提升', count: 0 }
      };

      // 统计各档位数量
      submissions.forEach(submission => {
        if (submission.grade && gradeMap[submission.grade]) {
          gradeMap[submission.grade].count++;
        }
      });

      // 计算百分比并排序
      const total = Object.values(gradeMap).reduce((sum, grade) => sum + grade.count, 0);
      const distribution = Object.entries(gradeMap).map(([grade, data]) => ({
        grade,
        ...data,
        percentage: total > 0 ? Math.round((data.count / total) * 100) : 0
      })).sort((a, b) => b.count - a.count);

      return distribution;
    },

    // 计算效率数据
    calculateEfficiency(completedSubmissions) {
      // 模拟效率数据（实际应从服务器获取真实数据）
      const avgMinutes = Math.max(2, Math.floor(Math.random() * 8) + 3);
      const avgTime = `${avgMinutes}min`;
      
      // 效率等级判断
      let level = 'medium';
      let text = '正常';
      if (avgMinutes <= 3) {
        level = 'high';
        text = '高效';
      } else if (avgMinutes >= 6) {
        level = 'low';
        text = '偏慢';
      }

      // 今日和本周数据
      const todayCount = Math.floor(completedSubmissions.length * 0.3);
      const weekCount = completedSubmissions.length;
      const peakSpeed = Math.max(1, avgMinutes - 1);

      return {
        avgTime,
        level,
        text,
        todayCount,
        weekCount,
        peakSpeed
      };
    },

    // 计算时间分布
    calculateTimeDistribution(completedSubmissions) {
      // 模拟24小时批改时间分布
      const hours = Array.from({ length: 24 }, (_, i) => {
        let activity = 0;
        
        // 工作时间活跃度更高
        if (i >= 9 && i <= 11) activity = Math.random() * 80 + 40; // 上午
        else if (i >= 14 && i <= 17) activity = Math.random() * 100 + 50; // 下午
        else if (i >= 19 && i <= 22) activity = Math.random() * 60 + 20; // 晚上
        else activity = Math.random() * 20; // 其他时间

        return {
          hour: i < 10 ? `0${i}` : `${i}`,
          percentage: Math.round(activity)
        };
      });

      return hours;
    },

    // 计算学生表现洞察
    calculateInsights(submissions) {
      const excellentSubmissions = submissions.filter(s => s.grade === 'excellent');
      const excellentCount = excellentSubmissions.length;
      const excellentTrend = Math.floor(Math.random() * 30) + 10; // 模拟趋势

      const reviewSubmissions = submissions.filter(s => s.grade === 'review');
      const reviewCount = reviewSubmissions.length;

      // 计算平均分
      const scoredSubmissions = submissions.filter(s => s.score && !isNaN(s.score));
      const avgScore = scoredSubmissions.length > 0 
        ? Math.round(scoredSubmissions.reduce((sum, s) => sum + parseFloat(s.score), 0) / scoredSubmissions.length)
        : 0;

      const scoreTrend = Math.floor(Math.random() * 10) - 5; // -5到+5的随机趋势

      return {
        excellentCount,
        excellentTrend,
        reviewCount,
        avgScore,
        scoreTrend
      };
    },

    // 生成个性化建议
    generateSuggestions(submissions, completionRate) {
      const suggestions = [];

      // 根据完成率给出建议
      if (completionRate < 50) {
        suggestions.push({
          id: 'completion',
          type: 'high',
          icon: '⏰',
          title: '加快批改进度',
          description: '当前完成率偏低，建议集中时间批改作业，提高效率。',
          actionText: '查看技巧'
        });
      }

      // 根据优秀作业数量给建议
      const excellentCount = submissions.filter(s => s.grade === 'excellent').length;
      const excellentRate = submissions.length > 0 ? (excellentCount / submissions.length) * 100 : 0;
      
      if (excellentRate > 60) {
        suggestions.push({
          id: 'showcase',
          type: 'low',
          icon: '⭐',
          title: '优秀作业展示',
          description: '本次作业质量很高，建议挑选优秀作业进行全班展示。',
          actionText: '选择展示'
        });
      }

      // 根据需复盘作业数量给建议
      const reviewCount = submissions.filter(s => s.grade === 'review').length;
      if (reviewCount > 0) {
        suggestions.push({
          id: 'review',
          type: 'medium',
          icon: '📝',
          title: '重点辅导安排',
          description: `有${reviewCount}位学生需要额外辅导，建议安排一对一指导时间。`,
          actionText: '安排辅导'
        });
      }

      // 效率建议
      suggestions.push({
        id: 'efficiency',
        type: 'low',
        icon: '🚀',
        title: '使用语音批改',
        description: '尝试使用语音录制功能，可以大幅提升批改效率和个性化程度。',
        actionText: '了解更多'
      });

      return suggestions.slice(0, 3); // 最多显示3个建议
    },

    // 切换图表视图模式
    toggleGradeView() {
      const currentMode = this.data.gradeViewMode;
      this.setData({
        gradeViewMode: currentMode === 'chart' ? 'list' : 'chart'
      });
    },

    // 查看需复盘学生详情
    showReviewStudents() {
      const reviewStudents = this.properties.submissions.filter(s => s.grade === 'review');
      
      if (reviewStudents.length === 0) {
        wx.showToast({
          title: '暂无需复盘的学生',
          icon: 'none'
        });
        return;
      }

      // 触发事件，让父组件处理
      this.triggerEvent('showReviewStudents', {
        students: reviewStudents
      });
    },

    // 应用建议
    applySuggestion(e) {
      const { suggestion } = e.currentTarget.dataset;
      
      // 触发事件，让父组件处理具体的建议应用
      this.triggerEvent('applySuggestion', {
        suggestion
      });
    },

    // 导出报告
    exportReport() {
      const { taskId } = this.properties;
      
      wx.showActionSheet({
        itemList: ['导出PDF报告', '导出Excel报告'],
        success: (res) => {
          const formatType = res.tapIndex === 0 ? 'pdf' : 'excel';
          this.performExport(formatType, taskId);
        }
      });
    },

    // 执行导出操作
    async performExport(formatType, taskId) {
      wx.showLoading({
        title: '生成报告中...'
      });

      try {
        const app = getApp();
        
        // 构建导出URL
        const baseUrl = '/api/v1/grading-analytics/export/efficiency-report';
        const params = new URLSearchParams({
          format_type: formatType,
          days: 30 // 默认30天，可以根据需要调整
        });

        if (taskId) {
          params.append('task_id', taskId);
        }

        const exportUrl = `${baseUrl}?${params.toString()}`;

        // 调用导出API
        const response = await app.request({
          url: exportUrl,
          method: 'GET',
          responseType: 'arraybuffer', // 接收二进制数据
        });

        wx.hideLoading();

        if (response) {
          // 成功提示
          wx.showToast({
            title: `${formatType.toUpperCase()}报告已生成`,
            icon: 'success'
          });

          // 触发导出事件，传递给父组件处理文件保存
          this.triggerEvent('exportReport', {
            taskId: taskId,
            format: formatType,
            data: response,
            filename: this.generateExportFilename(formatType),
            analytics: this.data.analytics
          });

          // 提示用户查看文件
          setTimeout(() => {
            wx.showModal({
              title: '导出成功',
              content: `${formatType.toUpperCase()}格式的批改分析报告已生成。由于小程序限制，请通过其他方式查看或分享文件。`,
              showCancel: false,
              confirmText: '知道了'
            });
          }, 1500);

        } else {
          throw new Error('导出响应为空');
        }

      } catch (error) {
        wx.hideLoading();
        
        console.error('导出报告失败:', error);
        
        let errorMsg = '导出失败，请稍后重试';
        if (error.message) {
          errorMsg = error.message.includes('网络') ? '网络连接失败' : '导出过程中发生错误';
        }

        wx.showToast({
          title: errorMsg,
          icon: 'error',
          duration: 2000
        });
      }
    },

    // 生成导出文件名
    generateExportFilename(formatType) {
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
      const taskTitle = this.properties.taskTitle || '批改分析';
      const extension = formatType === 'pdf' ? 'pdf' : 'xlsx';
      
      return `${taskTitle}_${timestamp}.${extension}`;
    },

    // 导出成绩分布报告
    exportGradeDistribution() {
      const { taskId } = this.properties;
      
      wx.showActionSheet({
        itemList: ['导出成绩PDF', '导出成绩Excel'],
        success: (res) => {
          const formatType = res.tapIndex === 0 ? 'pdf' : 'excel';
          this.performGradeExport(formatType, taskId);
        }
      });
    },

    // 执行成绩分布导出
    async performGradeExport(formatType, taskId) {
      wx.showLoading({
        title: '生成成绩报告中...'
      });

      try {
        const app = getApp();
        
        const baseUrl = '/api/v1/grading-analytics/export/grade-distribution';
        const params = new URLSearchParams({
          format_type: formatType,
          days: 30
        });

        if (taskId) {
          params.append('task_id', taskId);
        }

        const exportUrl = `${baseUrl}?${params.toString()}`;

        const response = await app.request({
          url: exportUrl,
          method: 'GET',
          responseType: 'arraybuffer',
        });

        wx.hideLoading();

        if (response) {
          wx.showToast({
            title: `成绩${formatType.toUpperCase()}已生成`,
            icon: 'success'
          });

          this.triggerEvent('exportGradeReport', {
            taskId: taskId,
            format: formatType,
            data: response,
            filename: `学生成绩分布_${new Date().toISOString().slice(0, 10)}.${formatType === 'pdf' ? 'pdf' : 'xlsx'}`
          });

        } else {
          throw new Error('成绩导出响应为空');
        }

      } catch (error) {
        wx.hideLoading();
        console.error('导出成绩分布失败:', error);
        
        wx.showToast({
          title: '成绩导出失败',
          icon: 'error'
        });
      }
    },

    // 关闭面板
    close() {
      this.triggerEvent('close');
    },

    // 阻止事件冒泡
    stopPropagation() {
      // 阻止事件冒泡到遮罩层
    },

    // 获取实时统计数据
    async fetchRealTimeStats() {
      try {
        const app = getApp();
        const response = await app.request({
          url: '/api/v1/admin/grading-analytics',
          method: 'GET',
          data: {
            task_id: this.properties.taskId
          },
          showError: false
        });

        if (response.data.code === 200) {
          const realTimeData = response.data.data;
          
          // 合并实时数据
          this.setData({
            'analytics.avgGradingTime': realTimeData.avgGradingTime || this.data.analytics.avgGradingTime,
            'analytics.todayGraded': realTimeData.todayGraded || this.data.analytics.todayGraded,
            'analytics.weekGraded': realTimeData.weekGraded || this.data.analytics.weekGraded,
            'analytics.peakSpeed': realTimeData.peakSpeed || this.data.analytics.peakSpeed
          });
        }
      } catch (error) {
        console.warn('获取实时统计数据失败:', error);
        // 静默失败，使用模拟数据
      }
    },

    // 上报统计数据查看事件
    reportAnalyticsView() {
      try {
        const app = getApp();
        app.request({
          url: '/api/v1/statistics/analytics-view',
          method: 'POST',
          data: {
            task_id: this.properties.taskId,
            view_time: Date.now(),
            total_submissions: this.data.analytics.totalSubmissions,
            completion_rate: this.data.analytics.completionRate
          },
          showError: false
        });
      } catch (error) {
        console.warn('上报统计查看失败:', error);
      }
    }
  },

  lifetimes: {
    ready() {
      // 组件就绪时获取实时数据
      if (this.properties.show) {
        this.fetchRealTimeStats();
        this.reportAnalyticsView();
      }
    }
  }
});