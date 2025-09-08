// 学习复盘页面
const app = getApp()

Page({
  data: {
    currentReview: null,
    reviewSettings: {},
    reviewStats: {},
    reviewHistory: [],
    
    // 设置弹窗相关
    showSettingsModal: false,
    tempSettings: {},
    
    // 映射和选项
    frequencyMap: {
      daily: '每日',
      weekly: '每周',
      monthly: '每月',
      custom: '自定义'
    },
    
    statusMap: {
      pending: '待完成',
      completed: '已完成',
      skipped: '已跳过'
    },
    
    frequencyOptions: [
      { value: 'daily', label: '每日' },
      { value: 'weekly', label: '每周' },
      { value: 'monthly', label: '每月' },
      { value: 'custom', label: '自定义' }
    ],
    
    frequencyIndex: 1, // 默认选择每周
  },

  onLoad() {
    this.loadReviewData()
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadReviewData()
  },

  // 加载复盘相关数据
  async loadReviewData() {
    wx.showLoading({ title: '加载中...' })
    
    try {
      await Promise.all([
        this.loadReviewSettings(),
        this.loadCurrentReview(),
        this.loadReviewStats(),
        this.loadReviewHistory()
      ])
    } catch (error) {
      console.error('加载复盘数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 获取复盘设置
  async loadReviewSettings() {
    try {
      const response = await app.api.get('/reviews/settings')
      if (response.code === 0) {
        this.setData({ 
          reviewSettings: response.data,
          tempSettings: { ...response.data }
        })
        
        // 设置频率选择器的索引
        const frequencyIndex = this.data.frequencyOptions.findIndex(
          option => option.value === response.data.frequency
        )
        this.setData({ frequencyIndex: frequencyIndex >= 0 ? frequencyIndex : 1 })
      }
    } catch (error) {
      console.error('获取复盘设置失败:', error)
    }
  },

  // 获取当前复盘任务
  async loadCurrentReview() {
    try {
      const response = await app.api.get('/reviews/current')
      if (response.code === 0) {
        this.setData({ currentReview: response.data })
      }
    } catch (error) {
      console.error('获取当前复盘失败:', error)
    }
  },

  // 获取复盘统计
  async loadReviewStats() {
    try {
      const response = await app.api.get('/reviews/stats')
      if (response.code === 0) {
        this.setData({ reviewStats: response.data })
      }
    } catch (error) {
      console.error('获取复盘统计失败:', error)
    }
  },

  // 获取复盘历史
  async loadReviewHistory() {
    try {
      const response = await app.api.get('/reviews/history?limit=5')
      if (response.code === 0) {
        // 格式化日期
        const formattedHistory = response.data.map(item => ({
          ...item,
          review_date: this.formatDate(item.review_date),
          period_start: this.formatDate(item.period_start),
          period_end: this.formatDate(item.period_end)
        }))
        this.setData({ reviewHistory: formattedHistory })
      }
    } catch (error) {
      console.error('获取复盘历史失败:', error)
    }
  },

  // 开始复盘
  async startReview(e) {
    const reviewId = e.currentTarget.dataset.id
    if (!reviewId) return

    // 跳转到复盘详情页
    wx.navigateTo({
      url: `/pages/review-detail/review-detail?id=${reviewId}`
    })
  },

  // 跳过复盘
  async skipReview(e) {
    const reviewId = e.currentTarget.dataset.id
    if (!reviewId) return

    const result = await wx.showModal({
      title: '确认跳过',
      content: '确定要跳过本次复盘吗？跳过后将无法再次进行。',
      confirmText: '确定跳过',
      cancelText: '取消'
    })

    if (!result.confirm) return

    try {
      wx.showLoading({ title: '处理中...' })
      
      const response = await app.api.post(`/reviews/skip/${reviewId}`)
      if (response.code === 0) {
        wx.showToast({
          title: '已跳过复盘',
          icon: 'success'
        })
        
        // 刷新数据
        this.loadReviewData()
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

  // 手动生成复盘
  async generateReview() {
    try {
      wx.showLoading({ title: '生成中...' })
      
      const response = await app.api.post('/reviews/generate')
      if (response.code === 0) {
        wx.showToast({
          title: '生成成功',
          icon: 'success'
        })
        
        // 刷新数据
        this.loadReviewData()
      } else {
        throw new Error(response.msg)
      }
    } catch (error) {
      console.error('生成复盘失败:', error)
      wx.showToast({
        title: '生成失败',
        icon: 'error'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 编辑设置
  editSettings() {
    this.setData({ 
      showSettingsModal: true,
      tempSettings: { ...this.data.reviewSettings }
    })
  },

  // 关闭设置弹窗
  closeSettingsModal() {
    this.setData({ showSettingsModal: false })
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 阻止事件冒泡
  },

  // 切换提醒开关
  async toggleReminder(e) {
    const enabled = e.detail.value
    
    try {
      const response = await app.api.put('/reviews/settings', {
        reminder_enabled: enabled
      })
      
      if (response.code === 0) {
        this.setData({
          'reviewSettings.reminder_enabled': enabled
        })
        
        wx.showToast({
          title: enabled ? '已开启提醒' : '已关闭提醒',
          icon: 'success'
        })
      }
    } catch (error) {
      console.error('更新提醒设置失败:', error)
    }
  },

  // 频率选择变化
  onFrequencyChange(e) {
    const index = e.detail.value
    const frequency = this.data.frequencyOptions[index].value
    
    this.setData({
      frequencyIndex: index,
      'tempSettings.frequency': frequency
    })
  },

  // 自定义天数输入
  onCustomDaysInput(e) {
    const days = parseInt(e.detail.value) || 7
    this.setData({
      'tempSettings.custom_days': days
    })
  },

  // 时间选择变化
  onTimeChange(e) {
    const time = e.detail.value
    const hour = parseInt(time.split(':')[0])
    
    this.setData({
      'tempSettings.preferred_time': hour
    })
  },

  // 复盘内容选择变化
  onContentChange(e) {
    const field = e.currentTarget.dataset.field
    const checked = e.detail.value.length > 0
    
    this.setData({
      [`tempSettings.${field}`]: checked
    })
  },

  // 保存设置
  async saveSettings() {
    const { tempSettings } = this.data
    
    // 验证设置
    if (tempSettings.frequency === 'custom' && (!tempSettings.custom_days || tempSettings.custom_days < 1)) {
      wx.showToast({
        title: '请设置有效的自定义天数',
        icon: 'error'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })
      
      const response = await app.api.put('/reviews/settings', tempSettings)
      if (response.code === 0) {
        this.setData({
          reviewSettings: response.data,
          showSettingsModal: false
        })
        
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
      } else {
        throw new Error(response.msg)
      }
    } catch (error) {
      console.error('保存设置失败:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 查看复盘详情
  viewReviewDetail(e) {
    const reviewId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/review-detail/review-detail?id=${reviewId}`
    })
  },

  // 查看全部历史
  showAllHistory() {
    wx.navigateTo({
      url: '/pages/review-history/review-history'
    })
  },

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return ''
    
    const date = new Date(dateString)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    
    return `${month}-${day}`
  }
})