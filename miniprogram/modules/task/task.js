/**
 * 任务管理模块
 * 负责：任务列表获取、任务详情、任务状态管理
 * @module task
 */

const app = getApp()

class TaskModule {
  constructor() {
    this.taskList = []
    this.currentTask = null
  }

  /**
   * 获取任务列表
   * @param {object} params - {status: 'ongoing'|'ended', page: 1, page_size: 20}
   * @returns {Promise<Array>}
   */
  async getTaskList(params = {}) {
    console.log('🚀 [DEBUG] TaskModule.getTaskList 开始执行, params:', params);
    
    const defaultParams = {
      page: 1,
      page_size: 20,
      ...params
    }
    
    console.log('🚀 [DEBUG] 最终请求参数:', defaultParams);

    try {
      console.log('🚀 [DEBUG] 准备调用 app.request...');
      console.log('🚀 [DEBUG] app 对象:', !!app);
      console.log('🚀 [DEBUG] app.request 函数:', typeof app.request);
      
      const result = await app.request({
        url: '/tasks/',
        data: defaultParams
      })
      
      console.log('🚀 [DEBUG] app.request 完成, result:', result);

      // 处理任务数据，添加显示状态
      const tasks = result.tasks || []
      const processedTasks = tasks.map(task => this.processTaskData(task))
      
      // 如果是第一页，替换列表；否则追加
      if (defaultParams.page === 1) {
        this.taskList = processedTasks
      } else {
        this.taskList = [...this.taskList, ...processedTasks]
      }

      return {
        tasks: processedTasks,
        total: result.total || 0,
        page: result.page || 1,
        page_size: result.page_size || 20
      }
    } catch (error) {
      console.error('获取任务列表失败', error)
      throw error
    }
  }

  /**
   * 获取任务详情
   * @param {number} taskId
   * @returns {Promise<object>}
   */
  async getTaskDetail(taskId) {
    try {
      const result = await app.request({
        url: `/tasks/${taskId}`
      })

      this.currentTask = this.processTaskData(result)
      return this.currentTask
    } catch (error) {
      console.error('获取任务详情失败', error)
      throw error
    }
  }

  /**
   * 处理任务数据，添加显示所需的字段
   * @private
   * @param {object} task
   * @returns {object}
   */
  processTaskData(task) {
    // 计算任务状态标签
    let statusLabel = ''
    let statusType = ''
    let cardColor = ''
    
    // 根据任务状态和提交状态确定显示
    if (task.submission_status === '未提交') {
      if (task.status === 'ongoing') {
        statusLabel = '正在进行中'
        statusType = 'primary'
        cardColor = '#fff'
      } else {
        statusLabel = '已结束'
        statusType = 'default'
        cardColor = '#f5f5f5'
      }
    } else if (task.submission_status === 'submitted') {
      statusLabel = '待批改'
      statusType = 'warning'
      cardColor = '#fffbe6'
    } else if (task.submission_grade) {
      statusLabel = '已完成'
      statusType = 'success'
      cardColor = '#f0f9ff'
    }

    // 处理右上角显示
    let topRightText = ''
    let topRightType = ''
    
    if (task.submission_status === '未提交') {
      topRightText = '待提交'
      topRightType = 'default'
    } else if (task.submission_status === 'submitted') {
      topRightText = '待批改'
      topRightType = 'warning'
    } else if (task.submission_grade) {
      topRightText = task.submission_grade
      topRightType = 'success'
    }

    // 格式化日期
    const deadline = task.deadline ? this.formatDate(task.deadline) : ''
    
    // 判断是否为课后加餐（根据task_type字段）
    const isExtra = task.task_type === 'extra'
    
    return {
      ...task,
      statusLabel,
      statusType,
      cardColor,
      topRightText,
      topRightType,
      deadlineText: deadline,
      isExtra,
      // 添加是否可以提交的标志
      canSubmit: task.status === 'ongoing' && task.submission_status !== 'graded'
    }
  }

  /**
   * 格式化日期
   * @private
   * @param {string} dateStr
   * @returns {string}
   */
  formatDate(dateStr) {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = date - now
    const dayDiff = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    // 今天
    if (dayDiff === 0) {
      return `今天 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
    }
    // 明天
    else if (dayDiff === 1) {
      return `明天 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
    }
    // 本周内
    else if (dayDiff > 0 && dayDiff < 7) {
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      return `${weekDays[date.getDay()]} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
    }
    // 其他
    else {
      return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
    }
  }

  /**
   * 创建任务（教师功能）
   * @param {object} taskData
   * @returns {Promise<object>}
   */
  async createTask(taskData) {
    try {
      const result = await app.request({
        url: '/tasks/',
        method: 'POST',
        data: taskData
      })
      
      // 刷新任务列表
      await this.getTaskList()
      
      return result
    } catch (error) {
      console.error('创建任务失败', error)
      throw error
    }
  }

  /**
   * 切换任务状态（教师功能）
   * @param {number} taskId
   * @returns {Promise<object>}
   */
  async toggleTaskStatus(taskId) {
    try {
      const result = await app.request({
        url: `/tasks/${taskId}/toggle-status`,
        method: 'POST'
      })
      
      // 更新本地数据
      const task = this.taskList.find(t => t.id === taskId)
      if (task) {
        task.status = result.new_status
      }
      
      return result
    } catch (error) {
      console.error('切换任务状态失败', error)
      throw error
    }
  }

  /**
   * 生成分享链接（教师功能）
   * @param {number} taskId
   * @returns {Promise<object>}
   */
  async generateShareLink(taskId) {
    try {
      const result = await app.request({
        url: `/tasks/${taskId}/share`,
        method: 'POST'
      })
      
      return result
    } catch (error) {
      console.error('生成分享链接失败', error)
      throw error
    }
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.taskList = []
    this.currentTask = null
  }
}

// 导出单例
module.exports = new TaskModule()