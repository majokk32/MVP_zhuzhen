// 个人中心页
const app = getApp();
const authModule = require('../../modules/auth/auth');
const notificationModule = require('../../modules/notification/notification');
const paymentModule = require('../../modules/payment/payment');

Page({
  data: {
    userInfo: null,
    isTeacher: false,
    roleText: '',
    joinTime: '',
    
    // 加载状态
    loading: true,
    statsLoading: true,
    learningDataLoading: true,
    
    // 统计数据
    stats: {
      totalTasks: 0,
      completedTasks: 0,
      excellentCount: 0,
      completionRate: '0%',
      totalSubmissions: 0,
      achievements: 0,
      studentCount: 0,
      pendingGrading: 0
    },
    
    // V1.0 学习数据
    learningData: {
      current_streak: 0,
      best_streak: 0,
      total_score: 0,
      monthly_score: 0,
      total_submissions: 0,
      week_checkins: 0
    },
    checkinChartData: [],
    userRank: null,
    
    // 通知状态
    notificationStatus: '',
    
    // 权限状态
    permissionStatus: '试用用户',
    
    // 通知设置面板状态
    showNotificationSettings: false,
    
    // 试用限制相关
    showTrialRestriction: false
  },

  onLoad() {
    this.loadUserInfo();
    this.initSubscriptionStatus();
  },

  onShow() {
    // 更新自定义tabBar
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateTabBarData()
      this.getTabBar().updateSelected()
    }
    
    // 每次显示页面时刷新数据
    this.loadUserInfo();
    this.loadStats();
    this.loadLearningData();
    this.refreshSubscriptionStatus();
    
    // 检查订阅事件
    this.checkSubscriptionEvents();
  },

  // 加载用户信息
  async loadUserInfo() {
    try {
      const userInfo = await authModule.getUserInfo();
      if (!userInfo) {
        wx.redirectTo({
          url: '/pages/login/login'
        });
        return;
      }
    
    // 计算加入时间
    let joinTime = '';
    if (userInfo.created_at) {
      const date = new Date(userInfo.created_at);
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      
      if (days === 0) {
        joinTime = '今天加入';
      } else if (days === 1) {
        joinTime = '昨天加入';
      } else if (days < 30) {
        joinTime = `${days}天前加入`;
      } else if (days < 365) {
        const months = Math.floor(days / 30);
        joinTime = `${months}个月前加入`;
      } else {
        const years = Math.floor(days / 365);
        joinTime = `${years}年前加入`;
      }
    }
    
      this.setData({
        userInfo,
        isTeacher: userInfo.role === 'teacher',
        roleText: userInfo.role === 'teacher' ? '教师' : '学生',
        joinTime,
        // 更新权限状态显示
        permissionStatus: userInfo.subscription_status || '试用用户',
        loading: false
      });
    } catch (error) {
      console.error('加载用户信息失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载用户信息失败',
        icon: 'none'
      });
    }
  },

  // 加载统计数据
  async loadStats() {
    this.setData({ statsLoading: true });
    
    try {
      const res = await app.request({
        url: '/users/stats',
        method: 'GET'
      });
      
      // 直接使用返回的数据，因为app.request已经处理了ResponseBase格式
      const stats = res || {};
      
      // 计算完成率
      let completionRate = '0%';
      if (stats.completion_rate) {
        completionRate = `${stats.completion_rate}%`;
      } else if (stats.total_submissions > 0) {
        const rate = Math.round((stats.graded_submissions / stats.total_submissions) * 100);
        completionRate = `${rate}%`;
      }
      
      this.setData({
        stats: {
          totalTasks: stats.total_tasks || 0,
          completedTasks: stats.graded_submissions || 0,
          excellentCount: stats.excellent_count || 0,
          completionRate,
          totalSubmissions: stats.total_submissions || 0,
          achievements: stats.achievements || 0,
          studentCount: stats.student_count || 0,
          pendingGrading: stats.pending_grading || 0
        },
        statsLoading: false
      });
    } catch (error) {
      console.error('加载统计数据失败:', error);
      this.setData({ statsLoading: false });
      wx.showToast({
        title: '加载统计失败',
        icon: 'none'
      });
    }
  },

  // V1.0 加载学习数据
  async loadLearningData() {
    this.setData({ learningDataLoading: true });
    
    try {
      // 加载学习数据概览
      const overviewRes = await app.request({
        url: '/learning/overview',
        method: 'GET'
      });
      
      console.log('[DEBUG] Learning overview API response:', overviewRes);
      
      if (overviewRes) {
        console.log('[DEBUG] Setting learning data:', overviewRes);
        this.setData({
          learningData: overviewRes
        });
      } else {
        console.log('[DEBUG] Learning overview response is empty');
      }

      // 加载14天打卡图数据
      const chartRes = await app.request({
        url: '/learning/checkin-chart',
        method: 'GET'
      });
      
      if (chartRes && Array.isArray(chartRes)) {
        this.setData({
          checkinChartData: chartRes
        });
      }


    } catch (error) {
      console.error('加载学习数据失败:', error);
      // 学习数据加载失败不影响页面正常显示
      wx.showToast({
        title: '学习数据加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ learningDataLoading: false });
    }
  },


  // 显示升级信息
  showUpgradeInfo() {
    wx.showModal({
      title: '升级为付费用户',
      content: '付费用户享有：\n• 无限制访问排行榜\n• 学习数据导出\n• 高级分析报告\n• 优先客服支持\n• 专属学习计划',
      confirmText: '立即升级',
      cancelText: '稍后再说',
      success: (res) => {
        if (res.confirm) {
          this.goToSubscription();
        }
      }
    });
  },

  // 跳转到订阅页面
  goToSubscription(planId = 'quarterly') {
    wx.navigateTo({
      url: `/pages/subscription/subscription?planId=${planId}`
    });
  },

  // 检查功能访问权限
  async checkFeatureAccess(featureId) {
    try {
      // 先检查当前订阅状态
      await paymentModule.checkSubscriptionStatus();
      
      // 检查功能权限
      const accessResult = paymentModule.checkFeatureAccess(featureId);
      
      if (!accessResult.hasAccess) {
        // 显示升级提示
        wx.showModal({
          title: '功能需要升级',
          content: `${accessResult.reason}，升级后即可使用该功能`,
          confirmText: '立即升级',
          cancelText: '稍后再说',
          success: (res) => {
            if (res.confirm) {
              this.goToSubscription();
            }
          }
        });
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('检查功能访问权限失败:', error);
      return false;
    }
  },

  // 编辑个人资料
  editProfile() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/edit-profile/edit-profile'
    });
  },

  // 我的作业
  goToMySubmissions() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/my-submissions/my-submissions'
    });
  },

  // 成就墙
  goToAchievements() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 学习报告
  goToLearningReport() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 订阅管理
  goToSubscriptionManagement() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    this.goToSubscription();
  },

  // 初始化订阅状态
  async initSubscriptionStatus() {
    try {
      await paymentModule.checkSubscriptionStatus();
    } catch (error) {
      console.error('初始化订阅状态失败:', error);
    }
  },

  // 刷新订阅状态
  async refreshSubscriptionStatus() {
    try {
      const subscription = await paymentModule.checkSubscriptionStatus();
      
      if (subscription) {
        const remainingTime = paymentModule.getSubscriptionRemainingTime();
        
        // 更新权限状态显示
        let statusText = '付费用户';
        if (remainingTime.expired) {
          statusText = '订阅已过期';
        } else if (remainingTime.days <= 7) {
          statusText = `付费用户(${remainingTime.days}天后过期)`;
        }
        
        this.setData({
          permissionStatus: statusText
        });
      }
    } catch (error) {
      console.error('刷新订阅状态失败:', error);
    }
  },

  // 检查订阅事件
  checkSubscriptionEvents() {
    try {
      const eventData = wx.getStorageSync('subscription_event');
      if (eventData) {
        const eventTime = new Date(eventData.timestamp);
        const now = new Date();
        const timeDiff = now - eventTime;
        
        // 只处理5分钟内的事件
        if (timeDiff < 5 * 60 * 1000) {
          this.handleSubscriptionEvent(eventData);
        }
        
        // 清除已处理的事件
        wx.removeStorageSync('subscription_event');
      }
    } catch (error) {
      console.error('检查订阅事件失败:', error);
    }
  },

  // 处理订阅事件
  handleSubscriptionEvent(eventData) {
    switch (eventData.type) {
      case 'subscription_success':
        wx.showToast({
          title: '订阅成功！',
          icon: 'success',
          duration: 3000
        });
        this.refreshSubscriptionStatus();
        break;
      case 'subscription_reactivated':
        wx.showToast({
          title: '订阅已重新激活',
          icon: 'success',
          duration: 3000
        });
        this.refreshSubscriptionStatus();
        break;
      case 'auto_renewal_cancelled':
        wx.showToast({
          title: '已取消自动续费',
          icon: 'success',
          duration: 2000
        });
        break;
    }
  },

  // 打开通知设置
  openNotificationSettings() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    this.setData({
      showNotificationSettings: true
    });
  },

  // 关闭通知设置
  closeNotificationSettings() {
    this.setData({
      showNotificationSettings: false
    });
  },

  // 任务管理（教师）
  goToTaskManage() {
    if (!this.data.isTeacher) return;
    
    wx.navigateTo({
      url: '/pages/admin/task-manage/task-manage'
    });
  },

  // 学生管理（教师）
  goToStudentManage() {
    if (!this.data.isTeacher) return;
    
    wx.navigateTo({
      url: '/pages/admin/students/students'
    });
  },

  // 批改中心（教师）
  goToGradingCenter() {
    if (!this.data.isTeacher) return;
    
    wx.navigateTo({
      url: '/pages/admin/grading-center/grading-center'
    });
  },

  // 通知设置
  goToNotificationSettings() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/notification-settings/notification-settings'
    });su
  },

  // 帮助中心
  goToHelp() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/help/help'
    });
  },

  // 意见反馈
  goToFeedback() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    // 使用微信原生反馈功能
    wx.openSetting({
      success: (res) => {
        console.log('打开设置成功', res);
      }
    });
  },

  // 关于我们
  goToAbout() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/about/about'
    });
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除登录信息
          authModule.logout();
          
          // 跳转到登录页
          wx.reLaunch({
            url: '/pages/login/login'
          });
        }
      }
    });
  },

  // 处理退出登录（WXML中的handleLogout方法）
  handleLogout() {
    this.logout();
  },

  // 编辑昵称
  editNickname() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/edit-profile/edit-profile'
    });
  },

  // 设置
  // 跳转到复盘页面
  goToReview() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        content: '只能浏览课程目录',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/review/review'
    });
  },

  // 跳转到课后加餐
  goToMaterials() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/materials/materials'
    });
  },

  goToSettings() {
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        confirmText: '返回',
        showCancel: false
      });
      return;
    }
    
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 获取权限状态的CSS类名
  getPermissionStatusClass(status) {
    if (status.includes('付费用户')) {
      return 'premium';
    } else if (status.includes('试用已过期')) {
      return 'expired';
    } else if (status.includes('试用用户')) {
      return 'trial';
    }
    return '';
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '公考督学助手 - 高效提升申论成绩',
      path: '/pages/index/index',
      // imageUrl: '/assets/images/share-default.png'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '公考督学助手 - 高效提升申论成绩'
    };
  },

  // 图片加载错误处理
  onImageError(e) {
    console.warn('图片加载失败:', e.detail.errMsg);
    // 可以在这里添加默认图片或重试逻辑
  },

  // 检查试用学员权限
  checkTrialPermission() {
    const userInfo = this.data.userInfo;
    if (userInfo && userInfo.role === 'student' && authModule.isTrialUser()) {
      this.setData({ showTrialRestriction: true });
      return false;
    }
    return true;
  },

  // 关闭试用限制提示
  onTrialRestrictionClose() {
    this.setData({ showTrialRestriction: false });
  }
});