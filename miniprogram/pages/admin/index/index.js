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
    if (!userInfo || !userInfo.isTeacher) {
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
    return true
  },

  /**
   * 加载统计数据
   */
  async loadStats() {
    try {
      this.setData({ loading: true })
      
      // 获取统计数据
      const res = await this.request('/api/admin/stats')
      
      if (res.code === 0) {
        const stats = res.data
        this.setData({
          stats: {
            totalTasks: stats.total_tasks || 0,
            pendingGrade: stats.pending_grade || 0,
            totalStudents: stats.total_students || 0,
            recentTasks: stats.recent_tasks || 0,
            activeStudents: stats.active_students || 0
          },
          isEmpty: stats.total_tasks === 0,
          loading: false
        })
      } else {
        throw new Error(res.msg || '获取数据失败')
      }
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
   * 网络请求封装
   */
  request(url, data = {}, method = 'GET') {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token')
      
      wx.request({
        url: `${getApp().globalData.apiBase}${url}`,
        data: data,
        method: method,
        header: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data)
          } else if (res.statusCode === 401) {
            // token失效，跳转登录
            wx.removeStorageSync('token')
            wx.removeStorageSync('userInfo')
            wx.redirectTo({
              url: '/pages/login/login'
            })
            reject(new Error('登录已过期'))
          } else {
            reject(new Error(`请求失败: ${res.statusCode}`))
          }
        },
        fail: (error) => {
          reject(error)
        }
      })
    })
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