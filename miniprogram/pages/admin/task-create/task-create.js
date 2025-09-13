// 创建新任务页
Page({
  /**
   * 页面的初始数据
   */
  data: {
    isEditMode: false,
    taskId: null,
    isSubmitting: false,
    submitMode: '', // 'draft' | 'publish'
    showAdvanced: false,
    
    // 表单数据
    formData: {
      title: '',
      date: '',
      time: '',
      requirements: '',
      typeIndex: 0,
      totalScore: 100,
      maxSubmissions: 3,
      publishImmediately: true
    },
    
    // 任务类型选项
    taskTypes: [
      { name: '直播课任务', value: 'live_course' },
      { name: '录播课任务', value: 'recorded_course', disabled: true },
      { name: '个人指定任务', value: 'personal_task', disabled: true }
    ],
    
    // 表单验证错误
    errors: {},
    
    // 最小日期（今天）
    minDate: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.initPage(options)
    this.setMinDate()
  },

  /**
   * 初始化页面
   */
  initPage(options) {
    const { id, mode } = options
    
    if (id && mode === 'edit') {
      this.setData({
        isEditMode: true,
        taskId: id
      })
      this.loadTaskData(id)
    }
    
    this.checkPermission()
  },

  /**
   * 设置最小日期
   */
  setMinDate() {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    
    this.setData({
      minDate: `${year}-${month}-${day}`
    })
  },

  /**
   * 检查用户权限
   */
  checkPermission() {
    const userInfo = wx.getStorageSync('userInfo')
    console.log('🔐 [DEBUG] 任务创建权限检查 - userInfo:', userInfo);
    
    if (!userInfo || userInfo.role !== 'teacher') {
      console.log('🔐 [ERROR] 权限不足 - role:', userInfo?.role, '预期: teacher');
      wx.showModal({
        title: '权限不足',
        content: '您没有创建任务的权限',
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
   * 加载任务数据（编辑模式）
   */
  async loadTaskData(taskId) {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const res = await this.request(`/api/admin/tasks/${taskId}`)
      
      if (res.code === 0) {
        const task = res.data
        const courseDate = new Date(task.course_date)
        
        this.setData({
          formData: {
            title: task.title || '',
            date: this.formatDate(courseDate),
            time: this.formatTime(courseDate),
            requirements: task.requirements || '',
            typeIndex: this.getTypeIndex(task.task_type),
            totalScore: task.total_score || 100,
            maxSubmissions: task.max_submissions || 3,
            publishImmediately: task.status !== 'draft'
          }
        })
      } else {
        throw new Error(res.msg || '加载失败')
      }
    } catch (error) {
      console.error('加载任务数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * 获取任务类型索引
   */
  getTypeIndex(taskType) {
    const index = this.data.taskTypes.findIndex(type => type.value === taskType)
    return index >= 0 ? index : 0
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  },

  /**
   * 输入框变化
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    
    this.setData({
      [`formData.${field}`]: value,
      [`errors.${field}`]: '' // 清除错误提示
    })
    
    this.updateCanSubmit()
  },

  /**
   * 日期选择
   */
  onDateChange(e) {
    this.setData({
      'formData.date': e.detail.value,
      'errors.date': ''
    })
    this.updateCanSubmit()
  },

  /**
   * 时间选择
   */
  onTimeChange(e) {
    this.setData({
      'formData.time': e.detail.value,
      'errors.time': ''
    })
    this.updateCanSubmit()
  },

  /**
   * 任务类型选择
   */
  onTypeChange(e) {
    const index = parseInt(e.detail.value)
    const selectedType = this.data.taskTypes[index]
    
    if (selectedType.disabled) {
      wx.showToast({
        title: 'V1.0版本暂不支持',
        icon: 'none'
      })
      return
    }
    
    this.setData({
      'formData.typeIndex': index
    })
  },

  /**
   * 开关切换
   */
  onSwitchChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    
    this.setData({
      [`formData.${field}`]: value
    })
  },

  /**
   * 切换高级设置
   */
  toggleAdvanced() {
    this.setData({
      showAdvanced: !this.data.showAdvanced
    })
  },

  /**
   * 表单验证
   */
  validateForm() {
    const { formData } = this.data
    const errors = {}
    
    // 课程名称验证
    if (!formData.title.trim()) {
      errors.title = '请输入课程名称'
    } else if (formData.title.trim().length < 2) {
      errors.title = '课程名称至少需要2个字符'
    }
    
    // 日期验证
    if (!formData.date) {
      errors.date = '请选择直播日期'
    }
    
    // 时间验证
    if (!formData.time) {
      errors.time = '请选择直播时间'
    }
    
    // 日期时间组合验证
    if (formData.date && formData.time) {
      const selectedDateTime = new Date(`${formData.date} ${formData.time}`)
      const now = new Date()
      
      if (selectedDateTime <= now) {
        errors.date = '直播时间不能早于当前时间'
      }
    }
    
    // 题目详情验证
    if (!formData.requirements.trim()) {
      errors.requirements = '请输入题目详情'
    } else if (formData.requirements.trim().length < 10) {
      errors.requirements = '题目详情至少需要10个字符'
    }
    
    this.setData({ errors })
    return Object.keys(errors).length === 0
  },

  /**
   * 更新提交按钮状态
   */
  updateCanSubmit() {
    const { formData } = this.data
    const canSubmit = formData.title.trim() && 
                     formData.date && 
                     formData.time && 
                     formData.requirements.trim().length >= 10
    
    this.setData({ canSubmit })
  },

  /**
   * 保存草稿
   */
  async saveDraft() {
    if (this.data.isSubmitting) return
    
    if (!this.validateForm()) {
      wx.showToast({
        title: '请检查输入内容',
        icon: 'error'
      })
      return
    }
    
    this.submitTask('draft')
  },

  /**
   * 表单提交
   */
  onSubmit(e) {
    if (this.data.isSubmitting) return
    
    if (!this.validateForm()) {
      wx.showToast({
        title: '请检查输入内容',
        icon: 'error'
      })
      return
    }
    
    const publishMode = this.data.formData.publishImmediately ? 'publish' : 'draft'
    this.submitTask(publishMode)
  },

  /**
   * 提交任务
   */
  async submitTask(mode) {
    try {
      this.setData({
        isSubmitting: true,
        submitMode: mode
      })

      const { formData } = this.data
      
      // 构建提交数据（匹配后端TaskCreate schema）
      const submitData = {
        title: formData.title.trim(),
        course: this.data.taskTypes[formData.typeIndex].name, // 使用课程类型名称
        desc: formData.requirements.trim(),
        total_score: parseFloat(formData.totalScore) || 100,
        deadline: formData.date && formData.time ? new Date(`${formData.date} ${formData.time}:00`).toISOString() : null
      }

      console.log('📝 [DEBUG] 提交任务数据:', submitData);
      
      const app = getApp();
      let res
      if (this.data.isEditMode) {
        res = await app.request({
          url: `/tasks/${this.data.taskId}`,
          method: 'PUT',
          data: submitData
        });
      } else {
        res = await app.request({
          url: '/tasks',
          method: 'POST', 
          data: submitData
        });
      }
      
      console.log('📝 [DEBUG] 任务创建响应:', res);

      if (res && res.id) {  // app.request提取了data，直接检查返回数据
        const actionText = this.data.isEditMode ? '更新' : (mode === 'publish' ? '发布' : '保存')
        wx.showToast({
          title: `${actionText}成功`,
          icon: 'success'
        })

        // 延迟返回，让用户看到成功提示
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(res.msg || '提交失败')
      }
    } catch (error) {
      console.error('提交任务失败:', error)
      wx.showToast({
        title: '提交失败',
        icon: 'error'
      })
    } finally {
      this.setData({
        isSubmitting: false,
        submitMode: ''
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
  }
})