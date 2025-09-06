// 批改任务台页面
Page({
  /**
   * 页面的初始数据
   */
  data: {
    loading: true,
    refreshing: false,
    loadingMore: false,
    hasMore: true,
    isEmpty: false,
    
    currentFilter: 'all',
    
    taskList: [],
    page: 1,
    pageSize: 10,
    
    // 统计数据
    totalPending: 0,
    todayReviewed: 0,
    urgentCount: 0,
    
    // 状态文本映射
    statusTextMap: {
      'ongoing': '进行中',
      'ended': '已结束',
      'draft': '草稿'
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.checkPermission()
    this.loadData()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 从批改详情页返回时刷新数据
    if (this.shouldRefresh) {
      this.shouldRefresh = false
      this.onRefresh()
    }
  },

  /**
   * 检查用户权限
   */
  checkPermission() {
    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo.isTeacher) {
      wx.showModal({
        title: '权限不足',
        content: '您没有访问此页面的权限',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return false
    }
    return true
  },

  /**
   * 加载数据
   */
  async loadData() {
    await Promise.all([
      this.loadStatistics(),
      this.loadTaskList()
    ])
  },

  /**
   * 加载统计数据
   */
  async loadStatistics() {
    try {
      const res = await this.request('/api/admin/grading/stats')
      
      if (res.code === 0) {
        const stats = res.data
        this.setData({
          totalPending: stats.total_pending || 0,
          todayReviewed: stats.today_reviewed || 0,
          urgentCount: stats.urgent_count || 0
        })
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  },

  /**
   * 加载任务列表
   */
  async loadTaskList(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore)) return

    try {
      if (reset) {
        this.setData({
          page: 1,
          hasMore: true,
          taskList: [],
          loading: true,
          refreshing: false
        })
      } else {
        this.setData({ 
          loading: this.data.page === 1,
          loadingMore: this.data.page > 1
        })
      }

      const params = {
        page: reset ? 1 : this.data.page,
        page_size: this.data.pageSize,
        filter: this.data.currentFilter
      }

      const res = await this.request('/api/admin/grading/tasks', params)
      
      if (res.code === 0) {
        const { tasks, has_more } = res.data
        
        // 处理任务数据
        const processedTasks = tasks.map(task => this.processTaskData(task))

        this.setData({
          taskList: reset ? processedTasks : [...this.data.taskList, ...processedTasks],
          hasMore: has_more,
          isEmpty: (reset ? processedTasks : [...this.data.taskList, ...processedTasks]).length === 0,
          page: (reset ? 1 : this.data.page) + 1,
          loading: false,
          loadingMore: false,
          refreshing: false
        })
      } else {
        throw new Error(res.msg || '获取数据失败')
      }
    } catch (error) {
      console.error('加载任务列表失败:', error)
      this.setData({ 
        loading: false, 
        loadingMore: false, 
        refreshing: false 
      })
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    }
  },

  /**
   * 处理任务数据
   */
  processTaskData(task) {
    const stats = task.stats || {
      submitted: 0,
      pending: 0,
      reviewed: 0
    }
    
    // 计算进度百分比
    const total = stats.submitted
    const reviewed = stats.reviewed
    const progressPercent = total > 0 ? Math.round((reviewed / total) * 100) : 0
    
    // 判断是否紧急（进行中的直播课且有待批改作业）
    const isUrgent = task.status === 'ongoing' && 
                    task.task_type === 'live_course' && 
                    stats.pending > 0
    
    return {
      ...task,
      statusText: this.data.statusTextMap[task.status] || task.status,
      course_date: this.formatDate(task.course_date),
      stats,
      progressPercent,
      isUrgent
    }
  },

  /**
   * 筛选切换
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      currentFilter: filter
    })
    this.loadTaskList(true)
  },

  /**
   * 任务卡片点击
   */
  onTaskClick(e) {
    const task = e.currentTarget.dataset.task
    
    if (task.stats.pending > 0) {
      // 有待批改作业，直接进入批改界面
      this.startGrading(task)
    } else {
      // 没有待批改作业，查看任务详情
      wx.navigateTo({
        url: `/pages/admin/task-detail/task-detail?id=${task.id}`
      })
    }
  },

  /**
   * 阻止操作区域点击事件冒泡
   */
  onActionTap(e) {
    e.stopPropagation()
  },

  /**
   * 快速操作
   */
  onQuickAction(e) {
    const { action, task } = e.currentTarget.dataset
    
    switch (action) {
      case 'start':
        this.startGrading(task)
        break
      case 'view':
        this.viewTaskDetail(task)
        break
      case 'export':
        this.exportTask(task)
        break
    }
  },

  /**
   * 开始批改
   */
  startGrading(task) {
    this.shouldRefresh = true
    wx.navigateTo({
      url: `/pages/grading/grading?taskId=${task.id}`
    })
  },

  /**
   * 查看任务详情
   */
  viewTaskDetail(task) {
    wx.navigateTo({
      url: `/pages/admin/task-detail/task-detail?id=${task.id}`
    })
  },

  /**
   * 导出任务
   */
  async exportTask(task) {
    wx.showModal({
      title: '导出作业',
      content: `确定要导出任务"${task.title}"的所有作业吗？导出文件将发送到您的邮箱。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '导出中...' })
            
            const result = await this.request(`/api/admin/tasks/${task.id}/export`, {}, 'POST')
            
            if (result.code === 0) {
              wx.showToast({
                title: '导出成功',
                icon: 'success'
              })
            } else {
              throw new Error(result.msg || '导出失败')
            }
          } catch (error) {
            console.error('导出任务失败:', error)
            wx.showToast({
              title: '导出失败',
              icon: 'error'
            })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  /**
   * 批量导出
   */
  batchExport() {
    const pendingTasks = this.data.taskList.filter(task => task.stats.submitted > 0)
    
    if (pendingTasks.length === 0) {
      wx.showToast({
        title: '没有可导出的任务',
        icon: 'none'
      })
      return
    }
    
    wx.showModal({
      title: '批量导出',
      content: `确定要导出所有${pendingTasks.length}个任务的作业吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '批量导出中...' })
            
            const taskIds = pendingTasks.map(task => task.id)
            const result = await this.request('/api/admin/batch/export', { task_ids: taskIds }, 'POST')
            
            if (result.code === 0) {
              wx.showToast({
                title: '导出成功',
                icon: 'success'
              })
            } else {
              throw new Error(result.msg || '批量导出失败')
            }
          } catch (error) {
            console.error('批量导出失败:', error)
            wx.showToast({
              title: '导出失败',
              icon: 'error'
            })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  /**
   * 批量通知
   */
  batchNotify() {
    const unfinishedTasks = this.data.taskList.filter(task => 
      task.status === 'ongoing' && task.stats.pending > 0
    )
    
    if (unfinishedTasks.length === 0) {
      wx.showToast({
        title: '没有需要通知的任务',
        icon: 'none'
      })
      return
    }
    
    wx.showModal({
      title: '批量通知',
      content: `确定要给${unfinishedTasks.length}个任务的学生发送催交通知吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '发送通知中...' })
            
            const taskIds = unfinishedTasks.map(task => task.id)
            const result = await this.request('/api/admin/batch/notify', { task_ids: taskIds }, 'POST')
            
            if (result.code === 0) {
              wx.showToast({
                title: '通知发送成功',
                icon: 'success'
              })
            } else {
              throw new Error(result.msg || '发送通知失败')
            }
          } catch (error) {
            console.error('批量通知失败:', error)
            wx.showToast({
              title: '发送失败',
              icon: 'error'
            })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  /**
   * 跳转到任务管理
   */
  goToTaskManage() {
    wx.navigateTo({
      url: '/pages/admin/task-manage/task-manage'
    })
  },

  /**
   * 获取空状态文本
   */
  getEmptyText() {
    const textMap = {
      'all': '暂无批改任务',
      'urgent': '暂无紧急任务',
      'ongoing': '暂无进行中的任务',
      'completed': '暂无已完成的任务'
    }
    return textMap[this.data.currentFilter] || '暂无任务'
  },

  /**
   * 获取空状态提示
   */
  getEmptyHint() {
    const hintMap = {
      'all': '还没有学生提交作业，创建任务让学生开始学习',
      'urgent': '没有需要紧急处理的任务',
      'ongoing': '没有正在进行的任务',
      'completed': '还没有完成批改的任务'
    }
    return hintMap[this.data.currentFilter] || ''
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.loadData()
  },

  /**
   * 上拉加载更多
   */
  onLoadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.loadTaskList()
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
   * 日期格式化
   */
  formatDate(dateString) {
    if (!dateString) return ''
    
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now - date)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays <= 1) {
      return '今天'
    } else if (diffDays <= 2) {
      return '昨天'
    } else {
      const month = date.getMonth() + 1
      const day = date.getDate()
      return `${month}月${day}日`
    }
  },

  // 图片加载错误处理
  onImageError(e) {
    console.warn('图片加载失败:', e.detail.errMsg);
    // 可以在这里添加默认图片或重试逻辑
  }
})