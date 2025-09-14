// 个人学习档案页
Page({
  /**
   * 页面的初始数据
   */
  data: {
    loading: true,
    loadingMore: false,
    hasMore: true,
    isEmpty: false,
    
    // 学生信息
    studentInfo: {
      id: null,
      nickname: '',
      avatar_url: '',
      permission_type: 'trial',
      permission_expire: '',
      total_submissions: 0,
      completed_tasks: 0,
      average_score: 0
    },
    
    // 学习档案列表
    archiveList: [],
    page: 1,
    pageSize: 20
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (!this.checkPermission()) return
    
    const studentId = options.id
    if (!studentId) {
      wx.showModal({
        title: '参数错误',
        content: '缺少学生ID参数',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }
    
    this.setData({
      'studentInfo.id': studentId
    })
    
    this.loadData()
  },

  /**
   * 检查用户权限
   */
  checkPermission() {
    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || userInfo.role !== 'teacher') {
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
      this.loadStudentInfo(),
      this.loadArchiveList()
    ])
  },

  /**
   * 加载学生基本信息
   */
  async loadStudentInfo() {
    try {
      const res = await this.request(`/admin/students/${this.data.studentInfo.id}`)
      
      if (res.code === 0) {
        const studentData = res.data
        
        this.setData({
          studentInfo: {
            ...this.data.studentInfo,
            ...studentData,
            permission_expire: studentData.permission_expire ? 
              this.formatDate(studentData.permission_expire) : null
          }
        })
      }
    } catch (error) {
      console.error('加载学生信息失败:', error)
    }
  },

  /**
   * 加载学习档案列表
   */
  async loadArchiveList(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore)) return

    try {
      if (reset) {
        this.setData({
          page: 1,
          hasMore: true,
          archiveList: [],
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
        page_size: this.data.pageSize
      }

      const res = await this.request(`/admin/students/${this.data.studentInfo.id}/archive`, params)
      
      if (res.code === 0) {
        const { archive_list, has_more } = res.data
        
        // 处理档案数据
        const processedArchive = archive_list.map(item => this.processArchiveItem(item))

        this.setData({
          archiveList: reset ? processedArchive : [...this.data.archiveList, ...processedArchive],
          hasMore: has_more,
          isEmpty: (reset ? processedArchive : [...this.data.archiveList, ...processedArchive]).length === 0,
          page: (reset ? 1 : this.data.page) + 1,
          loading: false,
          loadingMore: false
        })
      } else {
        throw new Error(res.msg || '获取数据失败')
      }
    } catch (error) {
      console.error('加载学习档案失败:', error)
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
   * 处理档案项数据
   */
  processArchiveItem(item) {
    return {
      ...item,
      submit_date: item.submitted_at ? this.formatDate(item.submitted_at) : '未知时间',
      course_type: item.course_type || 'essay',
      status: item.teacher_evaluation ? 'graded' : (item.submitted_at ? 'submitted' : 'pending'),
      evaluation: item.teacher_evaluation,
      evaluationClass: this.getEvaluationClass(item.teacher_evaluation),
      teacher_comment: item.teacher_comment,
      submission_images: item.submission_images || []
    }
  },

  /**
   * 获取评价对应的CSS类名
   */
  getEvaluationClass(evaluation) {
    const classMap = {
      '优秀': 'excellent',
      '良好': 'good', 
      '及格': 'pass',
      '不及格': 'fail'
    };
    return classMap[evaluation] || '';
  },

  /**
   * 任务卡片点击
   */
  onTaskClick(e) {
    const task = e.currentTarget.dataset.task
    
    if (task.status === 'graded' || task.status === 'submitted') {
      // 跳转到任务结果查看页面
      wx.navigateTo({
        url: `/pages/task-detail/task-detail?id=${task.id}&mode=review`
      })
    } else {
      wx.showToast({
        title: '该作业暂未提交',
        icon: 'none'
      })
    }
  },

  /**
   * 图片预览
   */
  onImagePreview(e) {
    const { url, urls } = e.currentTarget.dataset
    wx.previewImage({
      current: url,
      urls: urls
    })
  },

  /**
   * 导出学习档案
   */
  async onExportArchive() {
    wx.showModal({
      title: '导出学习档案',
      content: `确定要导出${this.data.studentInfo.nickname}的完整学习档案吗？文件将发送到您的邮箱。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '导出中...' })
            
            const result = await this.request(`/admin/students/${this.data.studentInfo.id}/export-archive`, {}, 'POST')
            
            if (result.code === 0) {
              wx.showModal({
                title: '导出成功',
                content: '学习档案已发送到您的邮箱，请注意查收。',
                showCancel: false
              })
            } else {
              throw new Error(result.msg || '导出失败')
            }
          } catch (error) {
            console.error('导出档案失败:', error)
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
   * 返回学生列表
   */
  onBackToStudents() {
    wx.navigateBack()
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
    this.loadArchiveList()
  },

  /**
   * 网络请求封装
   */
  request(url, data = {}, method = 'GET') {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token')
      
      wx.request({
        url: `${getApp().globalData.baseUrl}${url}`,
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
  },

  // 图片加载错误处理
  onImageError(e) {
    console.warn('图片加载失败:', e.detail.errMsg);
    // 可以在这里添加默认图片或重试逻辑
  }
})