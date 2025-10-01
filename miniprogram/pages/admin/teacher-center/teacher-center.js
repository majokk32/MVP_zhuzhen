// pages/admin/teacher-center/teacher-center.js - 教研中心主页
const app = getApp()

Page({
  data: {
    // 用户信息
    userInfo: null,
    
    // 加载状态
    loading: true,
    
    // 是否显示详细数据看板
    showDashboard: false,
    
    // 统计数据
    dashboardStats: {
      totalTasks: 0,
      gradingProgress: '0/0',
      totalStudents: 0,
      pendingGrading: 0
    },
    
    // 数据看板数据
    dashboardData: {}
  },

  onLoad() {
    this.initPage()
  },

  onShow() {
    // 更新自定义tabBar
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateTabBarData()
      this.getTabBar().updateSelected()
    }
    
    // 刷新数据
    this.loadDashboardData()
  },

  // 初始化页面
  async initPage() {
    try {
      // 获取用户信息
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
      this.setData({ userInfo })
      
      // 加载数据
      await this.loadDashboardData()
      
    } catch (error) {
      console.error('初始化教研中心失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 加载统计数据
  async loadDashboardData() {
    try {
      // 并行获取各项统计数据
      const [tasksData, studentsData, gradingData] = await Promise.all([
        this.getTasksStats(),
        this.getStudentsStats(), 
        this.getGradingStats()
      ])

      const dashboardStats = {
        totalTasks: tasksData.total || 0,
        gradingProgress: `${gradingData.completed || 0}/${gradingData.total || 0}`,
        totalStudents: studentsData.total || 0,
        pendingGrading: gradingData.pending || 0
      }

      // 构建数据看板数据
      const dashboardData = {
        statsCards: [
          {
            key: 'tasks',
            label: '总任务数',
            value: dashboardStats.totalTasks,
            icon: '📝',
            color: '#667eea'
          },
          {
            key: 'grading',
            label: '待批改',
            value: dashboardStats.pendingGrading,
            icon: '✏️',
            color: '#f56565'
          },
          {
            key: 'students',
            label: '学生总数',
            value: dashboardStats.totalStudents,
            icon: '👥',
            color: '#48bb78'
          }
        ],
        quickActions: [
          {
            key: 'create_task',
            label: '创建任务',
            icon: '➕'
          },
          {
            key: 'batch_grade',
            label: '批量批改',
            icon: '📋'
          },
          {
            key: 'export_data',
            label: '导出数据',
            icon: '📤'
          }
        ]
      }

      this.setData({
        dashboardStats,
        dashboardData
      })

    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  },

  // 获取任务统计
  async getTasksStats() {
    try {
      const response = await app.request({
        url: '/analytics/tasks/summary',
        method: 'GET'
      })
      return response || { total: 0, active: 0, draft: 0, ended: 0 }
    } catch (error) {
      console.error('获取任务统计失败:', error)
      return { total: 0, active: 0, draft: 0, ended: 0 }
    }
  },

  // 获取学生统计
  async getStudentsStats() {
    try {
      const response = await app.request({
        url: '/analytics/students/summary',
        method: 'GET'
      })
      return response || { total: 0, active: 0, trial: 0 }
    } catch (error) {
      console.error('获取学生统计失败:', error)
      return { total: 0, active: 0, trial: 0 }
    }
  },

  // 获取批改统计
  async getGradingStats() {
    try {
      const response = await app.request({
        url: '/analytics/grading/summary', 
        method: 'GET'
      })
      return response || { total: 0, completed: 0, pending: 0 }
    } catch (error) {
      console.error('获取批改统计失败:', error)
      return { total: 0, completed: 0, pending: 0 }
    }
  },

  // 导航到课程作业管理
  goToTaskManage() {
    wx.navigateTo({
      url: '/pages/admin/task-manage/task-manage'
    })
  },

  // 导航到批改工作台
  goToGrading() {
    wx.navigateTo({
      url: '/pages/admin/grading/grading'
    })
  },

  // 导航到学生管理
  goToStudents() {
    wx.navigateTo({
      url: '/pages/admin/students/students'
    })
  },

  // 导航到数据统计
  goToAnalytics() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    })
  },

  // 数据看板卡片点击
  onStatsCardClick(e) {
    const { card } = e.detail
    
    switch (card.key) {
      case 'tasks':
        this.goToTaskManage()
        break
      case 'grading':
        this.goToGrading()
        break
      case 'students':
        this.goToStudents()
        break
      default:
        break
    }
  },

  // 快捷操作点击
  onQuickActionClick(e) {
    const { action } = e.detail
    
    switch (action.key) {
      case 'create_task':
        wx.navigateTo({
          url: '/pages/admin/task-create/task-create'
        })
        break
      case 'batch_grade':
        this.goToGrading()
        break
      case 'export_data':
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        })
        break
      default:
        break
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadDashboardData().finally(() => {
      wx.stopPullDownRefresh()
    })
  }
})