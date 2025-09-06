// 任务详情管理页
Page({
  /**
   * 页面的初始数据
   */
  data: {
    loading: true,
    loadingMore: false,
    hasMore: true,
    isEmpty: false,
    
    // 任务基本信息
    taskInfo: {
      id: null,
      title: '',
      description: '',
      course_type: 'essay',
      status: 'draft',
      created_at: '',
      deadline: '',
      creator_name: '',
      isOverdue: false
    },
    
    // 统计数据
    statisticsData: {
      total_students: 0,
      submitted_count: 0,
      graded_count: 0,
      pending_count: 0,
      completion_rate: 0
    },
    
    // 筛选和列表
    currentFilter: 'all',
    submissionsList: [],
    page: 1,
    pageSize: 20
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (!this.checkPermission()) return
    
    const taskId = options.id
    if (!taskId) {
      wx.showModal({
        title: '参数错误',
        content: '缺少任务ID参数',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }
    
    this.setData({
      'taskInfo.id': taskId
    })
    
    this.loadData()
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
      this.loadTaskInfo(),
      this.loadStatistics(),
      this.loadSubmissions()
    ])
  },

  /**
   * 加载任务基本信息
   */
  async loadTaskInfo() {
    try {
      const res = await this.request(`/api/admin/tasks/${this.data.taskInfo.id}`)
      
      if (res.code === 0) {
        const taskData = res.data
        const isOverdue = taskData.deadline && new Date(taskData.deadline) < new Date()
        
        this.setData({
          taskInfo: {
            ...this.data.taskInfo,
            ...taskData,
            created_at: this.formatDate(taskData.created_at),
            deadline: taskData.deadline ? this.formatDate(taskData.deadline) : null,
            isOverdue
          }
        })
        
        // 更新页面标题
        wx.setNavigationBarTitle({
          title: taskData.title || '任务详情'
        })
      }
    } catch (error) {
      console.error('加载任务信息失败:', error)
    }
  },

  /**
   * 加载统计数据
   */
  async loadStatistics() {
    try {
      const res = await this.request(`/api/admin/tasks/${this.data.taskInfo.id}/statistics`)
      
      if (res.code === 0) {
        const stats = res.data
        this.setData({
          statisticsData: {
            total_students: stats.total_students || 0,
            submitted_count: stats.submitted_count || 0,
            graded_count: stats.graded_count || 0,
            pending_count: stats.pending_count || 0,
            completion_rate: stats.completion_rate || 0
          }
        })
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  },

  /**
   * 加载提交情况列表
   */
  async loadSubmissions(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore)) return

    try {
      if (reset) {
        this.setData({
          page: 1,
          hasMore: true,
          submissionsList: [],
          loading: true
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
        filter: this.data.currentFilter === 'all' ? '' : this.data.currentFilter
      }

      const res = await this.request(`/api/admin/tasks/${this.data.taskInfo.id}/submissions`, params)
      
      if (res.code === 0) {
        const { submissions, has_more } = res.data
        
        // 处理提交数据
        const processedSubmissions = submissions.map(item => this.processSubmissionData(item))

        this.setData({
          submissionsList: reset ? processedSubmissions : [...this.data.submissionsList, ...processedSubmissions],
          hasMore: has_more,
          isEmpty: (reset ? processedSubmissions : [...this.data.submissionsList, ...processedSubmissions]).length === 0,
          page: (reset ? 1 : this.data.page) + 1,
          loading: false,
          loadingMore: false
        })
      } else {
        throw new Error(res.msg || '获取数据失败')
      }
    } catch (error) {
      console.error('加载提交列表失败:', error)
      this.setData({ 
        loading: false, 
        loadingMore: false 
      })
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    }
  },

  /**
   * 处理提交数据
   */
  processSubmissionData(item) {
    // 确定提交状态
    let status = 'pending'
    if (item.teacher_evaluation) {
      status = 'graded'
    } else if (item.submitted_at) {
      status = 'submitted'
    }

    return {
      ...item,
      status,
      submitted_at: item.submitted_at ? this.formatDate(item.submitted_at) : null,
      student_avatar: item.student_info?.avatar_url || '',
      student_name: item.student_info?.nickname || '未设置昵称',
      evaluation: item.teacher_evaluation,
      submission_images: item.submission_images || []
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
    this.loadSubmissions(true)
  },

  /**
   * 提交卡片点击
   */
  onSubmissionClick(e) {
    const submission = e.currentTarget.dataset.submission
    
    if (submission.status === 'submitted' || submission.status === 'graded') {
      // 跳转到批改界面
      wx.navigateTo({
        url: `/pages/grading/grading?id=${submission.id}&taskId=${this.data.taskInfo.id}&mode=review`
      })
    } else {
      wx.showToast({
        title: '该学生尚未提交',
        icon: 'none'
      })
    }
  },

  /**
   * 开始批改
   */
  onStartGrading() {
    wx.navigateTo({
      url: `/pages/admin/grading/grading?taskId=${this.data.taskInfo.id}`
    })
  },

  /**
   * 编辑任务
   */
  onEditTask() {
    wx.navigateTo({
      url: `/pages/admin/task-create/task-create?id=${this.data.taskInfo.id}&mode=edit`
    })
  },

  /**
   * 删除任务
   */
  async onDeleteTask() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？删除后无法恢复。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            
            const result = await this.request(`/api/admin/tasks/${this.data.taskInfo.id}`, {}, 'DELETE')
            
            if (result.code === 0) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              })
              setTimeout(() => {
                wx.navigateBack()
              }, 1500)
            } else {
              throw new Error(result.msg || '删除失败')
            }
          } catch (error) {
            console.error('删除任务失败:', error)
            wx.showToast({
              title: '删除失败',
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
   * 导出数据
   */
  async onExportData() {
    wx.showModal({
      title: '导出数据',
      content: `确定要导出任务"${this.data.taskInfo.title}"的完整数据吗？文件将发送到您的邮箱。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '导出中...' })
            
            const result = await this.request(`/api/admin/tasks/${this.data.taskInfo.id}/export`, {}, 'POST')
            
            if (result.code === 0) {
              wx.showModal({
                title: '导出成功',
                content: '任务数据已发送到您的邮箱，请注意查收。',
                showCancel: false
              })
            } else {
              throw new Error(result.msg || '导出失败')
            }
          } catch (error) {
            console.error('导出数据失败:', error)
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
   * 发送催办通知
   */
  async onSendReminder() {
    wx.showModal({
      title: '发送催办',
      content: `确定要向${this.data.statisticsData.pending_count}名未提交学生发送催办通知吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '发送中...' })
            
            const result = await this.request(`/api/admin/tasks/${this.data.taskInfo.id}/send-reminder`, {}, 'POST')
            
            if (result.code === 0) {
              wx.showToast({
                title: '发送成功',
                icon: 'success'
              })
            } else {
              throw new Error(result.msg || '发送失败')
            }
          } catch (error) {
            console.error('发送催办失败:', error)
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
   * 获取空状态文本
   */
  getEmptyText() {
    const textMap = {
      'all': '暂无学生数据',
      'submitted': '暂无已提交的作业',
      'graded': '暂无已批改的作业',
      'pending': '所有学生都已提交'
    }
    return textMap[this.data.currentFilter] || '暂无数据'
  },

  /**
   * 获取空状态提示
   */
  getEmptyHint() {
    const hintMap = {
      'all': '请等待学生提交作业',
      'submitted': '请等待学生提交作业',
      'graded': '还没有批改过的作业',
      'pending': '太棒了！所有学生都已按时提交'
    }
    return hintMap[this.data.currentFilter] || ''
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.loadSubmissions()
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
    } else if (diffDays <= 7) {
      return `${diffDays}天前`
    } else {
      const month = date.getMonth() + 1
      const day = date.getDate()
      return `${month}月${day}日`
    }
  }
})