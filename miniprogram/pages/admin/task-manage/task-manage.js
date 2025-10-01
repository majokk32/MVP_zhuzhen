// 课程作业管理页
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
    
    taskList: [],
    page: 1,
    pageSize: 10,
    
    // 状态文本映射 - 简化为两种状态
    statusTextMap: {
      'ongoing': '进行中',
      'ended': '已结束'
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('📋 [DEBUG] task-manage页面onLoad开始')
    this.checkPermission()
    console.log('📋 [DEBUG] 权限检查完成，准备加载任务列表')
    // 首次加载时重置状态并强制加载
    this.loadTaskList(true)
    console.log('📋 [DEBUG] task-manage页面onLoad完成')
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 从创建页面回来时刷新列表
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
    console.log('🔐 [DEBUG] 课程作业管理权限检查 - userInfo:', userInfo);
    
    if (!userInfo || userInfo.role !== 'teacher') {
      console.log('🔐 [ERROR] 权限不足 - role:', userInfo?.role, '预期: teacher');
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
    
    console.log('🔐 [DEBUG] 权限验证通过');
    return true
  },

  /**
   * 加载任务列表
   */
  async loadTaskList(reset = false) {
    console.log('📋 [DEBUG] loadTaskList被调用, reset:', reset)
    console.log('📋 [DEBUG] 当前状态 - loading:', this.data.loading, 'loadingMore:', this.data.loadingMore)
    if (!reset && (this.data.loading || this.data.loadingMore)) {
      console.log('📋 [DEBUG] 因loading状态返回，不执行加载')
      return
    }

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
        keyword: this.data.searchKeyword.trim()
      }
      
      // 只有支持的状态才添加status参数，需要传task_status参数
      if (this.data.currentFilter === 'ongoing' || this.data.currentFilter === 'ended') {
        params.task_status = this.data.currentFilter
      }

      const app = getApp();
      const res = await app.request({
        url: '/admin/task-progress',
        method: 'GET',
        data: {}
      });
      
      console.log('📋 [DEBUG] 任务列表响应:', res);
      console.log('📋 [DEBUG] 响应数据类型:', typeof res, Object.keys(res || {}));
      console.log('📋 [DEBUG] res是否为数组:', Array.isArray(res));
      console.log('📋 [DEBUG] 任务数量:', Array.isArray(res) ? res.length : 0);
      console.log('📋 [DEBUG] 当前筛选条件:', this.data.currentFilter);
      
      // 修复：app.request已经解包了响应，res直接就是data数组
      if (res && Array.isArray(res)) {
        const tasks = res;
        console.log('📋 [DEBUG] 原始任务数量:', tasks.length);
        console.log('📋 [DEBUG] 第一个任务示例:', tasks[0]);
        
        let filteredTasks = tasks;
        
        // 应用筛选条件 - 直接在这里计算状态，使用北京时间
        if (this.data.currentFilter !== 'all') {
          filteredTasks = tasks.filter(task => {
            // 计算当前任务的状态 - 使用北京时间
            let isEnded = false;
            if (task.task_deadline) {
              // 获取北京时间（UTC+8）
              const nowBeijing = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
              const deadline = new Date(task.task_deadline);
              isEnded = nowBeijing > deadline;
            }
            
            if (this.data.currentFilter === 'ongoing') {
              return !isEnded;
            } else if (this.data.currentFilter === 'ended') {
              return isEnded;
            }
            return true;
          });
          console.log('📋 [DEBUG] 筛选后任务数量:', filteredTasks.length);
        }
        
        // 应用搜索关键词
        if (this.data.searchKeyword.trim()) {
          const keyword = this.data.searchKeyword.trim().toLowerCase();
          filteredTasks = filteredTasks.filter(task => 
            task.task_title.toLowerCase().includes(keyword)
          );
          console.log('📋 [DEBUG] 搜索后任务数量:', filteredTasks.length);
        }
        
        const has_more = false; // admin接口返回所有数据
        
        // 处理任务数据 - 使用 admin API 返回的字段，简化状态逻辑
        const processedTasks = filteredTasks.map(task => {
          // 简单的状态判断：对比北京时间和截止时间
          let statusText = '进行中';
          let statusValue = 'ongoing';
          
          if (task.task_deadline) {
            // 获取北京时间（UTC+8）
            const nowBeijing = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
            const deadline = new Date(task.task_deadline);
            if (nowBeijing > deadline) {
              statusText = '已结束';
              statusValue = 'ended';
            }
          }
          
          return {
            id: task.task_id,
            title: task.task_title,
            status: statusValue,
            statusText: statusText,
            created_at: task.task_deadline ? this.formatDate(task.task_deadline) : '未设置',
            course_date: null,
            deadline: task.task_deadline,
            stats: {
              submitted: task.submitted_count || 0,
              reviewed: task.graded_count || 0,
              total_students: task.total_students || 0
            }
          }
        })

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
      console.log('📋 [ERROR] 错误详情:', error)
      console.log('📋 [ERROR] 当前状态 - loading:', this.data.loading, 'loadingMore:', this.data.loadingMore)
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
    this.loadTaskList(true)
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
    wx.navigateTo({
      url: `/pages/admin/task-detail/task-detail?id=${task.id}`
    })
  },

  /**
   * 操作按钮点击
   */
  onActionTap(e) {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation()
    }
  },

  onActionClick(e) {
    const { action, task } = e.currentTarget.dataset
    
    switch (action) {
      case 'edit':
        this.editTask(task)
        break
      case 'view':
        this.viewTask(task)
        break
      case 'share':
        this.shareTask(task)
        break
      case 'publish':
        this.publishTask(task)
        break
      case 'delete':
        this.deleteTask(task)
        break
    }
  },

  /**
   * 编辑任务
   */
  editTask(task) {
    wx.navigateTo({
      url: `/pages/admin/task-create/task-create?id=${task.id}&mode=edit`
    })
  },

  /**
   * 发布草稿任务
   */
  async publishTask(task) {
    wx.showModal({
      title: '确认发布',
      content: `确定要发布任务"${task.title}"吗？发布后学生将可以看到并提交作业。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '发布中...' })
            
            const app = getApp()
            await app.request({
              url: `/tasks/${task.id}`,
              method: 'PUT',
              data: {
                status: 'ongoing'
              }
            })
            
            wx.showToast({
              title: '发布成功',
              icon: 'success'
            })
            
            // 刷新任务列表
            this.onRefresh()
            
          } catch (error) {
            console.error('发布任务失败:', error)
            wx.showToast({
              title: '发布失败',
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
   * 查看任务详情
   */
  viewTask(task) {
    wx.navigateTo({
      url: `/pages/admin/task-detail/task-detail?id=${task.id}`
    })
  },

  /**
   * 分享任务
   */
  shareTask(task) {
    // 调用微信分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    // 设置分享内容
    this.shareTaskInfo = {
      title: task.title,
      path: `/pages/task-detail/task-detail?id=${task.id}`,
      imageUrl: '/assets/images/share-task.png'
    }
    
    wx.showToast({
      title: '请点击右上角分享',
      icon: 'none'
    })
  },

  /**
   * 删除任务
   */
  deleteTask(task) {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除任务"${task.title}"吗？删除后无法恢复。`,
      confirmColor: '#ff6b6b',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            
            const app = getApp();
            const result = await app.request({
              url: `/tasks/${task.id}`,
              method: 'DELETE'
            })
            
            if (result.code === 0) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              })
              this.loadTaskList(true)
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
   * 创建任务
   */
  onCreateTask() {
    this.shouldRefresh = true
    wx.navigateTo({
      url: '/pages/admin/task-create/task-create'
    })
  },

  /**
   * 获取空状态文本
   */
  getEmptyText() {
    const filterMap = {
      'all': '暂无任务',
      'ongoing': '暂无进行中的任务',
      'ended': '暂无已结束的任务'
    }
    return filterMap[this.data.currentFilter] || '暂无任务'
  },

  /**
   * 获取空状态提示
   */
  getEmptyHint() {
    if (this.data.searchKeyword) {
      return `没有找到包含"${this.data.searchKeyword}"的任务`
    }
    
    const hintMap = {
      'all': '创建第一个任务开始管理课程',
      'ongoing': '没有正在进行的任务',
      'ended': '没有已结束的任务'
    }
    return hintMap[this.data.currentFilter] || ''
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    this.loadTaskList(true)
  },

  /**
   * 上拉加载更多
   */
  onLoadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.loadTaskList()
  },

  /**
   * 分享配置
   */
  onShareAppMessage() {
    return this.shareTaskInfo || {
      title: '公考督学助手 - 教研管理',
      path: '/pages/login/login'
    }
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
  }
})