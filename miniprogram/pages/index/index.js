// pages/index/index.js
const auth = require('../../modules/auth/auth')
const taskModule = require('../../modules/task/task')
const app = getApp()

Page({
  data: {
    // 用户信息
    userInfo: null,
    isTeacher: false,
    
    // 任务列表
    taskList: [],
    
    // 加载状态
    loading: false,
    refreshing: false,
    loadingMore: false,
    hasMore: true,
    
    // 分页
    page: 1,
    pageSize: 20,
    total: 0,
    
    // 筛选
    currentFilter: 'all', // all, ongoing, ended
    
    // 空状态
    isEmpty: false
  },

  onLoad(options) {
    // 检查登录状态
    if (!auth.checkLogin()) {
      return
    }
    
    // 强制同步token到app全局状态
    const app = getApp()
    const token = auth.getToken()
    const userInfo = auth.getUserInfo()
    
    if (token && userInfo) {
      app.globalData.token = token
      app.globalData.userInfo = userInfo
      app.globalData.isLogin = true
      console.log('主页强制同步token:', token.substring(0, 20) + '...')
    }
    
    // 设置用户信息
    this.setData({
      userInfo,
      isTeacher: auth.isTeacher()
    })
    
    // 加载任务列表
    this.loadTaskList()
    
    // 处理分享进入的情况
    if (options.share && options.id) {
      // 延迟跳转到任务详情
      setTimeout(() => {
        wx.navigateTo({
          url: `/pages/task-detail/task-detail?id=${options.id}`
        })
      }, 500)
    }
  },

  onShow() {
    // 页面显示时刷新（如果需要）
    if (this.data.userInfo) {
      // 检查是否需要刷新（比如从详情页返回）
      const needRefresh = wx.getStorageSync('needRefreshTaskList')
      if (needRefresh) {
        wx.removeStorageSync('needRefreshTaskList')
        this.onRefresh()
      }
    }
  },

  // 加载任务列表
  async loadTaskList(loadMore = false) {
    if (this.data.loading || this.data.loadingMore) return
    
    this.setData({
      [loadMore ? 'loadingMore' : 'loading']: true
    })
    
    try {
      const params = {
        page: loadMore ? this.data.page + 1 : 1,
        page_size: this.data.pageSize
      }
      
      // 添加筛选条件
      if (this.data.currentFilter !== 'all') {
        params.status = this.data.currentFilter
      }
      
      const result = await taskModule.getTaskList(params)
      
      // 处理置顶逻辑（课后加餐任务置顶）
      let tasks = result.tasks || []
      if (!loadMore) {
        // 分离置顶任务和普通任务
        const pinnedTasks = tasks.filter(t => t.isExtra && t.submission_status === '未提交')
        const normalTasks = tasks.filter(t => !(t.isExtra && t.submission_status === '未提交'))
        tasks = [...pinnedTasks, ...normalTasks]
      }
      
      this.setData({
        taskList: loadMore ? [...this.data.taskList, ...tasks] : tasks,
        page: result.page,
        total: result.total,
        hasMore: (result.page * result.page_size) < result.total,
        isEmpty: !loadMore && tasks.length === 0,
        loading: false,
        loadingMore: false,
        refreshing: false
      })
    } catch (error) {
      console.error('加载任务列表失败', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      this.setData({
        loading: false,
        loadingMore: false,
        refreshing: false
      })
    }
  },

  // 下拉刷新
  async onRefresh() {
    if (this.data.refreshing) return
    
    this.setData({ 
      refreshing: true,
      page: 1,
      hasMore: true
    })
    
    await this.loadTaskList(false)
  },

  // 上拉加载更多
  onLoadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.loadTaskList(true)
  },

  // 切换筛选
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.currentFilter) return
    
    this.setData({
      currentFilter: filter,
      page: 1,
      hasMore: true,
      taskList: []
    })
    
    this.loadTaskList()
  },

  // 任务卡片点击
  onTaskClick(e) {
    const { task } = e.detail
    console.log('点击任务', task)
    // 组件内部已处理跳转
  },

  // 切换任务状态（教师功能）
  async onToggleStatus(e) {
    const { task } = e.detail
    
    wx.showModal({
      title: '切换状态',
      content: `确定要将任务状态切换为${task.status === 'ongoing' ? '已结束' : '进行中'}吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' })
            await taskModule.toggleTaskStatus(task.id)
            wx.hideLoading()
            wx.showToast({
              title: '切换成功',
              icon: 'success'
            })
            // 刷新列表
            this.onRefresh()
          } catch (error) {
            wx.hideLoading()
            wx.showToast({
              title: '切换失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 分享任务（教师功能）
  async onShareTask(e) {
    const { task } = e.detail
    
    try {
      wx.showLoading({ title: '生成分享...' })
      const shareData = await taskModule.generateShareLink(task.id)
      wx.hideLoading()
      
      // 设置分享信息
      this.shareData = shareData
      
      // 显示分享菜单
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      })
      
      // 提示用户点击右上角分享
      wx.showToast({
        title: '请点击右上角分享',
        icon: 'none',
        duration: 2000
      })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({
        title: '生成分享失败',
        icon: 'none'
      })
    }
  },

  // 查看任务统计（教师功能）
  onViewStats(e) {
    const { task } = e.detail
    wx.navigateTo({
      url: `/pages/admin/task-manage/task-manage?id=${task.id}`
    })
  },

  // 跳转到创建任务（教师功能）
  onCreateTask() {
    if (!auth.checkTeacherRole()) return
    
    wx.navigateTo({
      url: '/pages/admin/task-manage/task-manage?action=create'
    })
  },

  // 分享设置
  onShareAppMessage() {
    if (this.shareData) {
      return {
        title: this.shareData.title,
        path: this.shareData.path,
        imageUrl: this.shareData.imageUrl
      }
    }
    
    return {
      title: '公考督学助手 - 高效提升申论成绩',
      path: '/pages/index/index',
      // imageUrl: '/assets/images/share-default.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '公考督学助手 - 高效提升申论成绩',
      query: '',
      // imageUrl: '/assets/images/share-timeline.png'
    }
  }
})