// 学生总列表页
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
    
    searchKeyword: '',
    currentFilter: 'all',
    
    studentList: [],
    page: 1,
    pageSize: 20,
    
    // 统计数据
    totalStudents: 0,
    paidStudents: 0,
    trialStudents: 0
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
    // 从学生档案页返回时刷新数据
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
      this.loadStudentList()
    ])
  },

  /**
   * 加载统计数据
   */
  async loadStatistics() {
    try {
      const res = await this.request('/api/admin/students/stats')
      
      if (res.code === 0) {
        const stats = res.data
        this.setData({
          totalStudents: stats.total_students || 0,
          paidStudents: stats.paid_students || 0,
          trialStudents: stats.trial_students || 0
        })
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  },

  /**
   * 加载学生列表
   */
  async loadStudentList(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore)) return

    try {
      if (reset) {
        this.setData({
          page: 1,
          hasMore: true,
          studentList: [],
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
        filter: this.data.currentFilter === 'all' ? '' : this.data.currentFilter,
        keyword: this.data.searchKeyword.trim()
      }

      const res = await this.request('/api/admin/students', params)
      
      if (res.code === 0) {
        const { students, has_more } = res.data
        
        // 处理学生数据
        const processedStudents = students.map(student => this.processStudentData(student))

        this.setData({
          studentList: reset ? processedStudents : [...this.data.studentList, ...processedStudents],
          hasMore: has_more,
          isEmpty: (reset ? processedStudents : [...this.data.studentList, ...processedStudents]).length === 0,
          page: (reset ? 1 : this.data.page) + 1,
          loading: false,
          loadingMore: false,
          refreshing: false
        })
      } else {
        throw new Error(res.msg || '获取数据失败')
      }
    } catch (error) {
      console.error('加载学生列表失败:', error)
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
   * 处理学生数据
   */
  processStudentData(student) {
    // 判断权限是否即将到期（7天内）
    let isExpiringSoon = false
    if (student.permission_expire) {
      const expireDate = new Date(student.permission_expire)
      const now = new Date()
      const diffDays = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24))
      isExpiringSoon = diffDays <= 7 && diffDays > 0
    }

    // 分析最近表现
    const recentPerformance = this.analyzeRecentPerformance(student.stats)

    return {
      ...student,
      created_at: this.formatDate(student.created_at),
      last_active: student.last_active ? this.formatDate(student.last_active) : null,
      permission_expire: student.permission_expire ? this.formatDate(student.permission_expire) : null,
      isExpiringSoon,
      recentPerformance,
      stats: {
        total_submissions: student.stats?.total_submissions || 0,
        completed_tasks: student.stats?.completed_tasks || 0,
        average_score: student.stats?.average_score || 0
      }
    }
  },

  /**
   * 分析最近表现
   */
  analyzeRecentPerformance(stats) {
    if (!stats || stats.total_submissions === 0) {
      return null
    }

    const avgScore = stats.average_score || 0
    const completionRate = stats.completed_tasks / (stats.total_submissions || 1)

    if (avgScore >= 90 && completionRate >= 0.8) {
      return { type: 'excellent', text: '表现优异' }
    } else if (avgScore >= 75 && completionRate >= 0.6) {
      return { type: 'good', text: '学习积极' }
    } else if (stats.total_submissions >= 3 && (avgScore < 60 || completionRate < 0.4)) {
      return { type: 'needs_improvement', text: '需要关注' }
    }

    return null
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
  },

  /**
   * 搜索确认
   */
  onSearchConfirm() {
    this.loadStudentList(true)
  },

  /**
   * 筛选切换
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      currentFilter: filter
    })
    this.loadStudentList(true)
  },

  /**
   * 学生卡片点击
   */
  onStudentClick(e) {
    const student = e.currentTarget.dataset.student
    this.viewStudentArchive(student)
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
    const { action, student } = e.currentTarget.dataset
    
    switch (action) {
      case 'archive':
        this.viewStudentArchive(student)
        break
      case 'contact':
        this.contactStudent(student)
        break
      case 'permission':
        this.managePermission(student)
        break
    }
  },

  /**
   * 查看学生档案
   */
  viewStudentArchive(student) {
    this.shouldRefresh = true
    wx.navigateTo({
      url: `/pages/admin/student-archive/student-archive?id=${student.id}`
    })
  },

  /**
   * 联系学生
   */
  contactStudent(student) {
    wx.showModal({
      title: '发送通知',
      content: `确定要给学生"${student.nickname}"发送学习提醒通知吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '发送中...' })
            
            const result = await this.request('/api/admin/notifications/send', {
              user_id: student.id,
              type: 'study_reminder',
              content: '请及时完成作业并提交，保持学习进度。'
            }, 'POST')
            
            if (result.code === 0) {
              wx.showToast({
                title: '发送成功',
                icon: 'success'
              })
            } else {
              throw new Error(result.msg || '发送失败')
            }
          } catch (error) {
            console.error('发送通知失败:', error)
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
   * 权限管理
   */
  managePermission(student) {
    const typeText = student.permission_type === 'paid' ? '付费学员' : '试用学员'
    const expireText = student.permission_expire || '无到期时间'
    
    wx.showModal({
      title: '权限详情',
      content: `类型：${typeText}\n到期时间：${expireText}`,
      showCancel: false
    })
  },

  /**
   * 导出学生列表
   */
  async exportStudentList() {
    wx.showModal({
      title: '导出学生列表',
      content: `确定要导出当前筛选条件下的学生列表吗？文件将发送到您的邮箱。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '导出中...' })
            
            const params = {
              filter: this.data.currentFilter === 'all' ? '' : this.data.currentFilter,
              keyword: this.data.searchKeyword.trim()
            }
            
            const result = await this.request('/api/admin/students/export', params, 'POST')
            
            if (result.code === 0) {
              wx.showToast({
                title: '导出成功',
                icon: 'success'
              })
            } else {
              throw new Error(result.msg || '导出失败')
            }
          } catch (error) {
            console.error('导出学生列表失败:', error)
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
   * 获取空状态文本
   */
  getEmptyText() {
    if (this.data.searchKeyword) {
      return '未找到相关学生'
    }
    
    const textMap = {
      'all': '暂无学生',
      'paid': '暂无付费学员',
      'trial': '暂无试用学员',
      'active': '暂无活跃学员'
    }
    return textMap[this.data.currentFilter] || '暂无学生'
  },

  /**
   * 获取空状态提示
   */
  getEmptyHint() {
    if (this.data.searchKeyword) {
      return `没有找到包含"${this.data.searchKeyword}"的学生`
    }
    
    const hintMap = {
      'all': '还没有学生注册，等待学生注册加入',
      'paid': '还没有付费学员，可以升级试用学员',
      'trial': '还没有试用学员',
      'active': '最近没有活跃的学员'
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
    this.loadStudentList()
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
    } else if (diffDays <= 30) {
      return `${diffDays}天前`
    } else {
      const month = date.getMonth() + 1
      const day = date.getDate()
      return `${month}月${day}日`
    }
  }
})