// 个人中心页
const app = getApp();
const authModule = require('../../modules/auth/auth');

Page({
  data: {
    userInfo: null,
    isTeacher: false,
    roleText: '',
    joinTime: '',
    
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
    
    // 通知状态
    notificationStatus: '已开启'
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadUserInfo();
    this.loadStats();
  },

  // 加载用户信息
  async loadUserInfo() {
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
      joinTime
    });
  },

  // 加载统计数据
  async loadStats() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const res = await app.request({
        url: '/api/v1/users/stats',
        method: 'GET'
      });
      
      if (res.data.code === 200) {
        const stats = res.data.data || {};
        
        // 计算完成率
        let completionRate = '0%';
        if (stats.total_tasks > 0) {
          const rate = Math.round((stats.completed_tasks / stats.total_tasks) * 100);
          completionRate = `${rate}%`;
        }
        
        this.setData({
          stats: {
            totalTasks: stats.total_tasks || 0,
            completedTasks: stats.completed_tasks || 0,
            excellentCount: stats.excellent_count || 0,
            completionRate,
            totalSubmissions: stats.total_submissions || 0,
            achievements: stats.achievements || 0,
            studentCount: stats.student_count || 0,
            pendingGrading: stats.pending_grading || 0
          }
        });
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
    } finally {
      wx.hideLoading();
    }
  },

  // 编辑个人资料
  editProfile() {
    wx.navigateTo({
      url: '/pages/edit-profile/edit-profile'
    });
  },

  // 我的作业
  goToMySubmissions() {
    wx.navigateTo({
      url: '/pages/my-submissions/my-submissions'
    });
  },

  // 成就墙
  goToAchievements() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 学习报告
  goToLearningReport() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
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
    wx.navigateTo({
      url: '/pages/notification-settings/notification-settings'
    });
  },

  // 帮助中心
  goToHelp() {
    wx.navigateTo({
      url: '/pages/help/help'
    });
  },

  // 意见反馈
  goToFeedback() {
    // 使用微信原生反馈功能
    wx.openSetting({
      success: (res) => {
        console.log('打开设置成功', res);
      }
    });
  },

  // 关于我们
  goToAbout() {
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
  }
});