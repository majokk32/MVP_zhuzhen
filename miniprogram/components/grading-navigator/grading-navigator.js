// 沉浸式批改导航组件
Component({
  properties: {
    // 当前提交索引
    currentIndex: {
      type: Number,
      value: 0
    },
    // 总数量
    totalCount: {
      type: Number,
      value: 0
    },
    // 提交列表
    submissionList: {
      type: Array,
      value: []
    },
    // 当前学生信息
    currentStudent: {
      type: Object,
      value: {}
    },
    // 任务信息
    taskInfo: {
      type: Object,
      value: {}
    },
    // 批改统计
    gradingStats: {
      type: Object,
      value: {
        completedCount: 0,
        pendingCount: 0,
        avgGradingTime: '0min'
      }
    },
    // 显示选项
    showSmartNav: {
      type: Boolean,
      value: true
    },
    showProgressReminder: {
      type: Boolean,
      value: false
    },
    showShortcuts: {
      type: Boolean,
      value: false
    },
    showEfficiency: {
      type: Boolean,
      value: true
    },
    showGestureHint: {
      type: Boolean,
      value: true
    }
  },

  data: {
    // 智能推荐列表
    smartRecommendations: [],
    // 显示提交列表弹窗
    showSubmissionModal: false,
    // 进度提醒文本
    progressReminderText: '',
    progressActionText: '继续批改',
    // 手势识别
    touchStartX: 0,
    touchStartY: 0
  },

  observers: {
    'currentIndex, totalCount, submissionList': function(currentIndex, totalCount, submissionList) {
      this.updateSmartRecommendations();
      this.updateProgressReminder();
    },
    'gradingStats': function(stats) {
      this.updateEfficiencyDisplay();
    }
  },

  lifetimes: {
    attached() {
      this.initComponent();
    }
  },

  methods: {
    // 初始化组件
    initComponent() {
      this.updateSmartRecommendations();
      this.updateProgressReminder();
      this.bindKeyboardEvents();
      this.startGestureHintTimer();
    },

    // 计算进度百分比
    getProgressPercent() {
      const { currentIndex, totalCount } = this.properties;
      if (totalCount <= 0) return 0;
      return Math.round(((currentIndex + 1) / totalCount) * 100);
    },

    // 获取已完成数量
    getCompletedCount() {
      return this.properties.gradingStats.completedCount || 0;
    },

    // 获取待批改数量
    getPendingCount() {
      return this.properties.gradingStats.pendingCount || 0;
    },

    // 更新智能推荐
    updateSmartRecommendations() {
      const { submissionList, currentIndex } = this.properties;
      if (!submissionList || submissionList.length === 0) return;

      const recommendations = [];

      // 查找下一个待批改的作业
      const nextPending = submissionList.findIndex((item, index) => 
        index > currentIndex && item.status === 'pending'
      );
      if (nextPending !== -1) {
        recommendations.push({
          id: 'next_pending',
          type: 'urgent',
          icon: '⏳',
          title: '下个待批改',
          description: `${submissionList[nextPending].user.nickname}的作业`,
          index: nextPending
        });
      }

      // 查找需要复批的作业
      const needReview = submissionList.findIndex((item, index) => 
        index > currentIndex && item.grade === 'review'
      );
      if (needReview !== -1) {
        recommendations.push({
          id: 'need_review',
          type: 'priority',
          icon: '🔍',
          title: '需要复批',
          description: `${submissionList[needReview].user.nickname}的作业`,
          index: needReview
        });
      }

      // 查找优秀作业
      const excellent = submissionList.findIndex((item, index) => 
        index > currentIndex && item.grade === 'excellent'
      );
      if (excellent !== -1) {
        recommendations.push({
          id: 'excellent',
          type: 'normal',
          icon: '⭐',
          title: '优秀作业',
          description: '可作为示例展示',
          index: excellent
        });
      }

      // 查找首次提交的作业
      const firstSubmission = submissionList.findIndex((item, index) => 
        index > currentIndex && item.attemptNumber === 1
      );
      if (firstSubmission !== -1) {
        recommendations.push({
          id: 'first_attempt',
          type: 'normal',
          icon: '🎯',
          title: '首次提交',
          description: '学生第一次作业',
          index: firstSubmission
        });
      }

      this.setData({
        smartRecommendations: recommendations.slice(0, 3) // 最多显示3个推荐
      });
    },

    // 更新进度提醒
    updateProgressReminder() {
      const { currentIndex, totalCount, gradingStats } = this.properties;
      const progress = ((currentIndex + 1) / totalCount) * 100;
      
      let reminderText = '';
      let showReminder = false;

      if (progress >= 80) {
        reminderText = `太棒了！只剩${totalCount - currentIndex - 1}份作业就完成了`;
        showReminder = true;
      } else if (progress >= 50) {
        reminderText = `已完成一半，继续保持高效批改`;
        showReminder = true;
      } else if (gradingStats.completedCount > 0 && gradingStats.completedCount % 5 === 0) {
        reminderText = `已批改${gradingStats.completedCount}份，休息一下再继续吧`;
        showReminder = true;
      }

      this.setData({
        progressReminderText: reminderText
      });

      this.setProperties({
        showProgressReminder: showReminder
      });
    },

    // 更新效率显示
    updateEfficiencyDisplay() {
      const { gradingStats } = this.properties;
      // 这里可以添加效率统计的逻辑
    },

    // 上一份作业
    previousSubmission() {
      const { currentIndex } = this.properties;
      if (currentIndex > 0) {
        this.triggerEvent('navigate', {
          action: 'previous',
          targetIndex: currentIndex - 1
        });
      }
    },

    // 下一份作业
    nextSubmission() {
      const { currentIndex, totalCount } = this.properties;
      if (currentIndex < totalCount - 1) {
        this.triggerEvent('navigate', {
          action: 'next',
          targetIndex: currentIndex + 1
        });
      }
    },

    // 跳转到第一份
    jumpToFirst() {
      if (this.properties.currentIndex > 0) {
        this.triggerEvent('navigate', {
          action: 'jump',
          targetIndex: 0
        });
      }
    },

    // 跳转到最后一份
    jumpToLast() {
      const { currentIndex, totalCount } = this.properties;
      if (currentIndex < totalCount - 1) {
        this.triggerEvent('navigate', {
          action: 'jump',
          targetIndex: totalCount - 1
        });
      }
    },

    // 跳转到指定作业
    jumpToSubmission(e) {
      const { index } = e.currentTarget.dataset;
      if (index !== this.properties.currentIndex) {
        this.triggerEvent('navigate', {
          action: 'jump',
          targetIndex: parseInt(index)
        });
      }
    },

    // 显示提交列表
    showSubmissionList() {
      this.setData({
        showSubmissionModal: true
      });
    },

    // 隐藏提交列表
    hideSubmissionList() {
      this.setData({
        showSubmissionModal: false
      });
    },

    // 选择提交
    selectSubmission(e) {
      const { index } = e.currentTarget.dataset;
      this.jumpToSubmission(e);
      this.hideSubmissionList();
    },

    // 标记旗帜
    markFlag() {
      this.triggerEvent('action', {
        type: 'flag',
        studentId: this.properties.currentStudent.id,
        flagged: !this.properties.currentStudent.flagged
      });
    },

    // 显示历史
    showHistory() {
      this.triggerEvent('action', {
        type: 'history',
        studentId: this.properties.currentStudent.id
      });
    },

    // 添加备注
    addNote() {
      this.triggerEvent('action', {
        type: 'note',
        studentId: this.properties.currentStudent.id
      });
    },

    // 处理进度动作
    handleProgressAction() {
      this.triggerEvent('action', {
        type: 'continue_grading'
      });
    },

    // 图片错误处理
    onImageError(e) {
      console.log('头像加载失败:', e);
    },

    // 阻止事件冒泡
    stopPropagation() {
      // 阻止事件冒泡
    },

    // 绑定键盘事件
    bindKeyboardEvents() {
      // 小程序中键盘事件需要特殊处理
      // 这里主要为将来可能的扩展预留接口
    },

    // 手势提示定时器
    startGestureHintTimer() {
      if (this.properties.showGestureHint) {
        setTimeout(() => {
          this.setProperties({
            showGestureHint: false
          });
        }, 5000); // 5秒后隐藏手势提示
      }
    },

    // 触摸开始
    onTouchStart(e) {
      if (e.touches && e.touches.length > 0) {
        this.setData({
          touchStartX: e.touches[0].clientX,
          touchStartY: e.touches[0].clientY
        });
      }
    },

    // 触摸结束
    onTouchEnd(e) {
      if (!e.changedTouches || e.changedTouches.length === 0) return;

      const { touchStartX, touchStartY } = this.data;
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // 判断是否为有效滑动手势
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          // 右滑 - 上一份
          this.previousSubmission();
        } else {
          // 左滑 - 下一份
          this.nextSubmission();
        }
      }
    }
  }
});