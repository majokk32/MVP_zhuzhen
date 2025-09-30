// 学习复盘页面 - 简化版本
const app = getApp()

Page({
  data: {
    // 今日复盘任务列表
    todayReviewTasks: [],
    loading: false,
    
    // TODO: 复盘设置相关功能 - 暂时注释
    // currentReview: null,
    // reviewSettings: {},
    // reviewStats: {},
    // reviewHistory: [],
    // showSettingsModal: false,
    // tempSettings: {},
    
    // 状态映射
    statusMap: {
      pending: '待复盘',
      overdue: '已逾期', 
      completed: '已完成',
      mastered: '已掌握'
    },
    
    // TODO: 设置选项 - 暂时注释
    // frequencyMap: {
    //   daily: '每日',
    //   weekly: '每周', 
    //   monthly: '每月',
    //   custom: '自定义'
    // },
    // frequencyOptions: [
    //   { value: 'daily', label: '每日' },
    //   { value: 'weekly', label: '每周' },
    //   { value: 'monthly', label: '每月' },
    //   { value: 'custom', label: '自定义' }
    // ],
    // frequencyIndex: 1,
  },

  onLoad() {
    this.loadReviewData()
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadReviewData()
  },

  // 加载今日复盘任务
  async loadReviewData() {
    wx.showLoading({ title: '加载中...' })
    
    try {
      await this.loadTodayReviewTasks()
      // TODO: 以下功能暂时注释 - 复杂设置功能预留
      // await Promise.all([
      //   this.loadReviewSettings(),
      //   this.loadCurrentReview(),
      //   this.loadReviewStats(),
      //   this.loadReviewHistory()
      // ])
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

  // 加载今日复盘任务 - 基于真实作业数据
  async loadTodayReviewTasks() {
    try {
      // 获取今日需要复盘的任务
      const data = await app.request({
        url: '/ebbinghaus/reviews/today',
        method: 'GET'
      })
      
      // app.request 成功时直接返回 data 字段
      this.setData({ todayReviewTasks: data || [] })
      
    } catch (error) {
      console.error('获取今日复盘任务失败:', error)
      
      // 降级方案：从本地构建复盘任务
      try {
        const todayTasks = await this.buildTodayReviewTasks()
        this.setData({ todayReviewTasks: todayTasks })
      } catch (buildError) {
        console.error('构建复盘任务失败:', buildError)
        this.setData({ todayReviewTasks: [] })
      }
    }
  },

  // 构建今日复盘任务（基于作业评分数据）
  async buildTodayReviewTasks() {
    const today = new Date()
    const todayStr = this.formatDateStr(today)
    
    // 1. 获取所有优秀/极佳的作业
    const excellentSubmissions = await this.getExcellentSubmissions()
    
    // 2. 获取现有复盘记录
    const existingReviews = await this.getExistingReviews()
    
    // 3. 筛选今日需要复盘的任务
    const todayReviewTasks = []
    
    for (const submission of excellentSubmissions) {
      const reviewRecord = existingReviews.find(r => r.submission_id === submission.id)
      
      if (!reviewRecord) {
        // 新的优秀作业：检查是否到了第一次复盘时间（第1天）
        const submissionDate = new Date(submission.submitted_at)
        const daysDiff = this.getDaysDifference(submissionDate, today)
        
        if (daysDiff >= 1) {
          // 创建第一次复盘任务
          await this.createReviewRecord(submission, 0, todayStr)
          todayReviewTasks.push(this.buildReviewTask(submission, 0, 1))
        }
      } else if (!reviewRecord.is_mastered) {
        // 已有复盘记录但未掌握：检查是否到了下次复盘时间
        const nextReviewDate = reviewRecord.next_review_date
        
        if (nextReviewDate === todayStr) {
          todayReviewTasks.push(this.buildReviewTask(submission, reviewRecord.review_count, this.getEbbinghausDay(reviewRecord.review_count + 1)))
        }
      }
    }
    
    return todayReviewTasks
  },

  // 获取所有优秀/极佳的作业
  async getExcellentSubmissions() {
    try {
      const data = await app.request({
        url: '/ebbinghaus/submissions/excellent',
        method: 'GET'
      })
      return data || []
    } catch (error) {
      console.error('获取优秀作业失败:', error)
      return []
    }
  },

  // 获取现有复盘记录
  async getExistingReviews() {
    try {
      const data = await app.request({
        url: '/ebbinghaus/reviews/records',
        method: 'GET'
      })
      return data || []
    } catch (error) {
      console.error('获取复盘记录失败:', error)
      return []
    }
  },

  // 创建复盘记录
  async createReviewRecord(submission, reviewCount, scheduledDate) {
    try {
      await app.request({
        url: '/ebbinghaus/reviews/records',
        method: 'POST',
        data: {
          submission_id: submission.id,
          task_id: submission.task_id,
          review_count: reviewCount,
          next_review_date: scheduledDate,
          is_mastered: false,
          created_at: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('创建复盘记录失败:', error)
    }
  },

  // 构建复盘任务对象
  buildReviewTask(submission, reviewCount, ebbinghausDay) {
    return {
      id: submission.id,
      submission_id: submission.id,
      task_id: submission.task_id,
      title: submission.task_title || '未知任务',
      subject: submission.task_subject || '未知科目',
      review_count: reviewCount,
      status: 'pending',
      scheduled_date: new Date().toISOString(),
      original_date: this.formatDateStr(new Date(submission.submitted_at)),
      ebbinghaus_day: ebbinghausDay,
      grade: submission.grade
    }
  },

  // 获取艾宾浩斯对应天数
  getEbbinghausDay(reviewNumber) {
    const intervals = [1, 3, 7, 15, 30]
    return intervals[reviewNumber - 1] || 30
  },

  // 计算日期差异
  getDaysDifference(date1, date2) {
    const timeDiff = date2.getTime() - date1.getTime()
    return Math.floor(timeDiff / (1000 * 3600 * 24))
  },

  // 格式化日期字符串
  formatDateStr(date) {
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // TODO: 以下功能暂时注释 - 复杂设置功能预留
  // 获取复盘设置
  // async loadReviewSettings() {
  //   try {
  //     const response = await app.api.get('/reviews/settings')
  //     if (response.code === 0) {
  //       this.setData({ 
  //         reviewSettings: response.data,
  //         tempSettings: { ...response.data }
  //       })
  //       
  //       // 设置频率选择器的索引
  //       const frequencyIndex = this.data.frequencyOptions.findIndex(
  //         option => option.value === response.data.frequency
  //       )
  //       this.setData({ frequencyIndex: frequencyIndex >= 0 ? frequencyIndex : 1 })
  //     }
  //   } catch (error) {
  //     console.error('获取复盘设置失败:', error)
  //   }
  // },

  // 获取当前复盘任务
  // async loadCurrentReview() {
  //   try {
  //     const response = await app.api.get('/reviews/current')
  //     if (response.code === 0) {
  //       this.setData({ currentReview: response.data })
  //     }
  //   } catch (error) {
  //     console.error('获取当前复盘失败:', error)
  //   }
  // },

  // 获取复盘统计
  // async loadReviewStats() {
  //   try {
  //     const response = await app.api.get('/reviews/stats')
  //     if (response.code === 0) {
  //       this.setData({ reviewStats: response.data })
  //     }
  //   } catch (error) {
  //     console.error('获取复盘统计失败:', error)
  //   }
  // },

  // 获取复盘历史
  // async loadReviewHistory() {
  //   try {
  //     const response = await app.api.get('/reviews/history?limit=5')
  //     if (response.code === 0) {
  //       // 格式化日期
  //       const formattedHistory = response.data.map(item => ({
  //         ...item,
  //         review_date: this.formatDate(item.review_date),
  //         period_start: this.formatDate(item.period_start),
  //         period_end: this.formatDate(item.period_end)
  //       }))
  //       this.setData({ reviewHistory: formattedHistory })
  //     }
  //   } catch (error) {
  //     console.error('获取复盘历史失败:', error)
  //   }
  // },

  // 跳转到任务详情页
  viewTaskDetail(e) {
    const submissionId = e.currentTarget.dataset.id
    if (!submissionId) return

    // 从复盘任务列表中找到对应的任务
    const reviewTask = this.data.todayReviewTasks.find(t => t.id === parseInt(submissionId))
    if (!reviewTask) {
      wx.showToast({
        title: '任务不存在',
        icon: 'error'
      })
      return
    }

    // 使用 task_id 跳转到任务详情页
    wx.navigateTo({
      url: `/pages/task-detail/task-detail?id=${reviewTask.task_id}&from=review`
    })
  },

  // 完成复盘 - 基于真实数据的艾宾浩斯逻辑
  async startReview(e) {
    const taskId = e.currentTarget.dataset.id
    if (!taskId) return

    try {
      wx.showLoading({ title: '完成复盘...' })
      
      // 获取当前任务
      const currentTask = this.data.todayReviewTasks.find(t => t.id === parseInt(taskId))
      if (!currentTask) {
        throw new Error('任务不存在')
      }
      
      const newReviewCount = currentTask.review_count + 1
      const isMastered = newReviewCount >= 5
      
      // 计算下次复盘日期
      let nextReviewDate = null
      if (!isMastered) {
        const originalDate = new Date(currentTask.original_date)
        const intervals = [1, 3, 7, 15, 30]
        const nextInterval = intervals[newReviewCount]
        const nextDate = new Date(originalDate)
        nextDate.setDate(originalDate.getDate() + nextInterval)
        nextReviewDate = this.formatDateStr(nextDate)
      }
      
      // 更新数据库中的复盘记录
      const updateData = {
        submission_id: currentTask.submission_id,
        review_count: newReviewCount,
        next_review_date: nextReviewDate,
        is_mastered: isMastered,
        last_review_date: this.formatDateStr(new Date()),
        completed_at: new Date().toISOString()
      }
      
      await app.request({
        url: `/ebbinghaus/reviews/records/${currentTask.submission_id}`,
        method: 'PUT',
        data: updateData
      })
      
      // app.request 成功执行表示操作成功
      
      // 更新本地状态
      const updatedTasks = this.data.todayReviewTasks.map(task => {
        if (task.id === parseInt(taskId)) {
          return { 
            ...task, 
            status: 'completed',
            review_count: newReviewCount,
            next_review_date: nextReviewDate,
            is_mastered: isMastered
          }
        }
        return task
      })
      
      this.setData({ todayReviewTasks: updatedTasks })
      
      // 用户反馈
      if (isMastered) {
        wx.showToast({
          title: '🎉 已完全掌握！',
          icon: 'success',
          duration: 2000
        })
        
        // 可选：记录掌握日志
        this.logMasteredTask(currentTask)
      } else {
        wx.showToast({
          title: `复盘完成！下次：${nextReviewDate}`,
          icon: 'success',
          duration: 2000
        })
      }
      
    } catch (error) {
      console.error('完成复盘失败:', error)
      wx.showToast({
        title: error.message || '操作失败',
        icon: 'error'
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 记录已掌握的任务（用于统计）
  async logMasteredTask(task) {
    try {
      await app.request({
        url: '/ebbinghaus/reviews/mastered',
        method: 'POST',
        data: {
          submission_id: task.submission_id,
          task_id: task.task_id,
          task_title: task.title,
          subject: task.subject,
          original_date: task.original_date,
          mastered_date: this.formatDateStr(new Date()),
          total_reviews: 5
        }
      })
    } catch (error) {
      console.error('记录已掌握任务失败:', error)
    }
  },

  // 计算下次复盘日期（艾宾浩斯遗忘曲线）
  calculateNextReviewDate(originalDate, reviewCount) {
    const intervals = [1, 3, 7, 15, 30] // 艾宾浩斯间隔天数
    
    if (reviewCount >= 5) {
      return null // 已完成所有复盘
    }
    
    const startDate = new Date(originalDate)
    const nextInterval = intervals[reviewCount] // reviewCount从0开始，所以直接用作索引
    const nextDate = new Date(startDate)
    nextDate.setDate(startDate.getDate() + nextInterval)
    
    return this.formatDate(nextDate)
  },


  // TODO: 手动生成复盘 - 暂时注释，复杂功能预留
  // async generateReview() {
  //   try {
  //     wx.showLoading({ title: '生成中...' })
  //     
  //     const response = await app.api.post('/reviews/generate')
  //     if (response.code === 0) {
  //       wx.showToast({
  //         title: '生成成功',
  //         icon: 'success'
  //       })
  //       
  //       // 刷新数据
  //       this.loadReviewData()
  //     } else {
  //       throw new Error(response.msg)
  //     }
  //   } catch (error) {
  //     console.error('生成复盘失败:', error)
  //     wx.showToast({
  //       title: '生成失败',
  //       icon: 'error'
  //     })
  //   } finally {
  //     wx.hideLoading()
  //   }
  // },

  // TODO: 编辑设置 - 暂时注释，复杂功能预留
  // editSettings() {
  //   this.setData({ 
  //     showSettingsModal: true,
  //     tempSettings: { ...this.data.reviewSettings }
  //   })
  // },

  // 关闭设置弹窗
  // closeSettingsModal() {
  //   this.setData({ showSettingsModal: false })
  // },

  // 阻止事件冒泡
  stopPropagation() {
    // 阻止事件冒泡
  },

  // TODO: 以下复杂设置功能暂时注释 - 预留为未来版本
  // 切换提醒开关
  // async toggleReminder(e) {
  //   const enabled = e.detail.value
  //   
  //   try {
  //     const response = await app.api.put('/reviews/settings', {
  //       reminder_enabled: enabled
  //     })
  //     
  //     if (response.code === 0) {
  //       this.setData({
  //         'reviewSettings.reminder_enabled': enabled
  //       })
  //       
  //       wx.showToast({
  //         title: enabled ? '已开启提醒' : '已关闭提醒',
  //         icon: 'success'
  //       })
  //     }
  //   } catch (error) {
  //     console.error('更新提醒设置失败:', error)
  //   }
  // },

  // 频率选择变化
  // onFrequencyChange(e) {
  //   const index = e.detail.value
  //   const frequency = this.data.frequencyOptions[index].value
  //   
  //   this.setData({
  //     frequencyIndex: index,
  //     'tempSettings.frequency': frequency
  //   })
  // },

  // 自定义天数输入
  // onCustomDaysInput(e) {
  //   const days = parseInt(e.detail.value) || 7
  //   this.setData({
  //     'tempSettings.custom_days': days
  //   })
  // },

  // 时间选择变化
  // onTimeChange(e) {
  //   const time = e.detail.value
  //   const hour = parseInt(time.split(':')[0])
  //   
  //   this.setData({
  //     'tempSettings.preferred_time': hour
  //   })
  // },

  // 复盘内容选择变化
  // onContentChange(e) {
  //   const field = e.currentTarget.dataset.field
  //   const checked = e.detail.value.length > 0
  //   
  //   this.setData({
  //     [`tempSettings.${field}`]: checked
  //   })
  // },

  // 保存设置
  // async saveSettings() {
  //   const { tempSettings } = this.data
  //   
  //   // 验证设置
  //   if (tempSettings.frequency === 'custom' && (!tempSettings.custom_days || tempSettings.custom_days < 1)) {
  //     wx.showToast({
  //       title: '请设置有效的自定义天数',
  //       icon: 'error'
  //     })
  //     return
  //   }

  //   try {
  //     wx.showLoading({ title: '保存中...' })
  //     
  //     const response = await app.api.put('/reviews/settings', tempSettings)
  //     if (response.code === 0) {
  //       this.setData({
  //         reviewSettings: response.data,
  //         showSettingsModal: false
  //       })
  //       
  //       wx.showToast({
  //         title: '保存成功',
  //         icon: 'success'
  //       })
  //     } else {
  //       throw new Error(response.msg)
  //     }
  //   } catch (error) {
  //     console.error('保存设置失败:', error)
  //     wx.showToast({
  //       title: '保存失败',
  //       icon: 'error'
  //     })
  //   } finally {
  //     wx.hideLoading()
  //   }
  // },

  // TODO: 查看复盘详情 - 暂时注释，复杂功能预留
  // viewReviewDetail(e) {
  //   const reviewId = e.currentTarget.dataset.id
  //   wx.navigateTo({
  //     url: `/pages/review-detail/review-detail?id=${reviewId}`
  //   })
  // },

  // 查看全部历史
  // showAllHistory() {
  //   wx.navigateTo({
  //     url: '/pages/review-history/review-history'
  //   })
  // },

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return ''
    
    const date = new Date(dateString)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    
    return `${month}-${day}`
  }
})