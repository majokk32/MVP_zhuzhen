// 复盘详情页面
const app = getApp()

Page({
  data: {
    reviewId: null,
    reviewData: {},
    userNotes: '',
    
    // 状态映射
    statusMap: {
      pending: '待完成',
      completed: '已完成',
      skipped: '已跳过'
    },
    
    // 活动类型映射
    activityTypeMap: {
      task_view: { name: '查看任务', icon: '👀' },
      collection_view: { name: '查看资料', icon: '📚' },
      review_complete: { name: '复盘完成', icon: '✅' },
      submission: { name: '提交作业', icon: '📝' }
    },
    
    // 处理后的数据
    gradeList: [],
    activityList: []
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ reviewId: options.id })
      this.loadReviewDetail()
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 加载复盘详情
  async loadReviewDetail() {
    const { reviewId } = this.data
    if (!reviewId) return

    try {
      wx.showLoading({ title: '加载中...' })
      
      // 这里需要创建一个获取单个复盘记录的API，暂时使用历史记录API模拟
      const response = await app.api.get('/reviews/history?limit=50')
      if (response.code === 0) {
        const reviewData = response.data.find(item => item.id == reviewId)
        
        if (reviewData) {
          // 格式化日期
          reviewData.period_start = this.formatDate(reviewData.period_start)
          reviewData.period_end = this.formatDate(reviewData.period_end)
          if (reviewData.completed_at) {
            reviewData.completed_at = this.formatDateTime(reviewData.completed_at)
          }
          
          this.setData({ 
            reviewData,
            userNotes: reviewData.user_notes || ''
          })
          
          // 处理评价分布数据
          this.processGradeDistribution()
          
          // 处理活动数据
          this.processActivityData()
        } else {
          throw new Error('复盘记录不存在')
        }
      } else {
        throw new Error(response.msg)
      }
    } catch (error) {
      console.error('加载复盘详情失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 处理评价分布数据
  processGradeDistribution() {
    const { reviewData } = this.data
    if (!reviewData.score_summary?.grade_distribution) return

    const distribution = reviewData.score_summary.grade_distribution
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0)
    
    const gradeList = [
      {
        grade: '极佳',
        count: distribution['极佳'] || 0,
        percentage: total > 0 ? Math.round((distribution['极佳'] || 0) / total * 100) : 0,
        class: 'excellent'
      },
      {
        grade: '优秀',
        count: distribution['优秀'] || 0,
        percentage: total > 0 ? Math.round((distribution['优秀'] || 0) / total * 100) : 0,
        class: 'good'
      },
      {
        grade: '待复盘',
        count: distribution['待复盘'] || 0,
        percentage: total > 0 ? Math.round((distribution['待复盘'] || 0) / total * 100) : 0,
        class: 'pending'
      }
    ]
    
    this.setData({ gradeList })
  },

  // 处理活动数据
  processActivityData() {
    const { reviewData, activityTypeMap } = this.data
    if (!reviewData.progress_data?.activity_breakdown) return

    const breakdown = reviewData.progress_data.activity_breakdown
    const activityList = Object.keys(breakdown).map(type => ({
      type,
      name: activityTypeMap[type]?.name || type,
      icon: activityTypeMap[type]?.icon || '📋',
      count: breakdown[type] || 0
    })).filter(item => item.count > 0)

    this.setData({ activityList })
  },

  // 笔记输入
  onNotesInput(e) {
    this.setData({
      userNotes: e.detail.value
    })
  },

  // 跳转到任务
  goToTask(e) {
    const submissionId = e.currentTarget.dataset.id
    if (!submissionId) return

    // 这里应该跳转到具体的任务或提交详情页
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    })
  },

  // 跳过复盘
  async skipReview() {
    const result = await wx.showModal({
      title: '确认跳过',
      content: '确定要跳过本次复盘吗？跳过后将无法再次进行。',
      confirmText: '确定跳过',
      cancelText: '取消'
    })

    if (!result.confirm) return

    try {
      wx.showLoading({ title: '处理中...' })
      
      const response = await app.api.post(`/reviews/skip/${this.data.reviewId}`)
      if (response.code === 0) {
        wx.showToast({
          title: '已跳过复盘',
          icon: 'success'
        })
        
        // 更新状态
        this.setData({
          'reviewData.status': 'skipped'
        })
        
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(response.msg)
      }
    } catch (error) {
      console.error('跳过复盘失败:', error)
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 完成复盘
  async completeReview() {
    const { reviewId, userNotes } = this.data

    // 记录开始时间，用于计算耗时
    const startTime = Date.now()

    try {
      wx.showLoading({ title: '提交中...' })
      
      const response = await app.api.post(`/reviews/complete/${reviewId}`, {
        user_notes: userNotes
      })
      
      if (response.code === 0) {
        // 计算耗时（分钟）
        const duration = Math.round((Date.now() - startTime) / 1000 / 60)
        
        wx.showToast({
          title: '复盘已完成',
          icon: 'success'
        })
        
        // 更新状态
        this.setData({
          'reviewData.status': 'completed',
          'reviewData.completed_at': this.formatDateTime(new Date()),
          'reviewData.completion_duration': duration,
          'reviewData.user_notes': userNotes
        })
        
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(response.msg)
      }
    } catch (error) {
      console.error('完成复盘失败:', error)
      wx.showToast({
        title: '提交失败',
        icon: 'error'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 格式化日期（月-日）
  formatDate(dateString) {
    if (!dateString) return ''
    
    const date = new Date(dateString)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    
    return `${month}-${day}`
  },

  // 格式化日期时间
  formatDateTime(date) {
    if (!date) return ''
    
    const d = new Date(date)
    const year = d.getFullYear()
    const month = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    const hour = d.getHours().toString().padStart(2, '0')
    const minute = d.getMinutes().toString().padStart(2, '0')
    
    return `${year}-${month}-${day} ${hour}:${minute}`
  }
})