// 教研功能主页
Page({
  /**
   * 页面的初始数据
   */
  data: {
    loading: true,
    isEmpty: false,
    stats: {
      totalTasks: 0,
      pendingGrade: 0,
      totalStudents: 0,
      recentTasks: 0,
      activeStudents: 0
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.checkPermission()
    this.loadStats()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 更新自定义tabBar
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateTabBarData()
      this.getTabBar().updateSelected()
    }
    
    // 每次显示时刷新数据
    this.loadStats()
  },

  /**
   * 检查用户权限
   */
  checkPermission() {
    const userInfo = wx.getStorageSync('userInfo')
    console.log('🔐 [DEBUG] 教研权限检查 - userInfo:', userInfo);
    
    if (!userInfo || userInfo.role !== 'teacher') {
      console.log('🔐 [ERROR] 权限不足 - role:', userInfo?.role, '预期: teacher');
      wx.showModal({
        title: '权限不足',
        content: '您没有访问教研功能的权限',
        showCancel: false,
        success: () => {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      })
      return false
    }
    
    console.log('🔐 [DEBUG] 权限验证通过');
    return true
  },

  /**
   * 加载统计数据
   */
  async loadStats() {
    try {
      this.setData({ loading: true })
      
      // 获取统计数据 - 使用统一的 app.request 方法
      const app = getApp();
      console.log('📊 [DEBUG] app实例:', app);
      console.log('📊 [DEBUG] app.globalData:', app.globalData);
      console.log('📊 [DEBUG] baseUrl:', app.globalData?.baseUrl);
      
      // 防护：如果 baseUrl 未定义，使用硬编码值
      if (!app.globalData?.baseUrl) {
        console.warn('📊 [WARN] baseUrl未定义，使用默认值');
        app.globalData = app.globalData || {};
        app.globalData.baseUrl = 'http://192.168.1.139:8000/api/v1';
      }
      
      const res = await app.request({
        url: '/admin/stats',
        method: 'GET'
      });
      
      // app.request 已经处理了响应格式，直接使用 res 数据
      console.log('📊 [DEBUG] 管理员统计数据:', res);
      console.log('📊 [DEBUG] total_tasks值:', res.total_tasks);
      console.log('📊 [DEBUG] 完整响应结构:', JSON.stringify(res, null, 2));
      
      this.setData({
        stats: {
          totalTasks: res.total_tasks || 0,
          pendingGrade: res.pending_grade || 0,
          totalStudents: res.total_students || 0,
          recentTasks: res.recent_tasks || 0,
          activeStudents: res.active_students || 0
        },
        isEmpty: (res.total_tasks || 0) === 0,
        loading: false
      })
    } catch (error) {
      console.error('加载统计数据失败:', error)
      this.setData({ loading: false })
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    }
  },


  /**
   * 跳转到课程作业管理
   */
  goToTaskManage() {
    wx.navigateTo({
      url: '/pages/admin/task-manage/task-manage'
    })
  },

  /**
   * 跳转到申论作业批改
   */
  goToGrading() {
    wx.navigateTo({
      url: '/pages/admin/grading/grading'
    })
  },

  /**
   * 跳转到学生详情查询
   */
  goToStudentList() {
    wx.navigateTo({
      url: '/pages/admin/students/students'
    })
  },

  /**
   * 快速创建任务
   */
  createTask() {
    wx.navigateTo({
      url: '/pages/admin/task-create/task-create'
    })
  },

  /**
   * 查看所有批改任务
   */
  viewAllGrading() {
    wx.navigateTo({
      url: '/pages/admin/grading/grading'
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.loadStats().finally(() => {
      wx.stopPullDownRefresh()
    })
  }
})