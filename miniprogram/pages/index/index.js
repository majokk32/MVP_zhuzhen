// pages/index/index.js
const app = getApp()

// 使用性能优化器进行懒加载
let auth = null;
let taskModule = null;

// 懒加载辅助函数
async function loadAuth() {
  if (!auth) {
    const performanceOptimizer = app.globalData.performanceOptimizer;
    auth = await performanceOptimizer.lazyLoadModule('modules/auth/auth.js', true);
  }
  return auth;
}

async function loadTaskModule() {
  if (!taskModule) {
    const performanceOptimizer = app.globalData.performanceOptimizer;
    taskModule = await performanceOptimizer.lazyLoadModule('modules/task/task.js', false);
  }
  return taskModule;
}

Page({
  data: {
    // 用户信息
    userInfo: null,
    isTeacher: false,
    
    // 任务列表
    taskList: [],
    
    // 加载状态
    loading: false,
    refreshing: false,
    loadingMore: false,
    hasMore: true,
    
    // 分页
    page: 1,
    pageSize: 20,
    total: 0,
    
    // 筛选
    currentFilter: 'all', // all, ongoing, ended
    
    // 搜索
    searchKeyword: '',
    showSearch: false, // 控制搜索框显示
    originalTaskList: [], // 保存原始任务列表用于搜索
    
    // 空状态
    isEmpty: false,
    
    // 虚拟列表
    listHeight: 600, // 默认高度，会在页面加载时动态计算
    
    // 升级引导相关
    showUpgradeGuide: false,
    upgradeGuideType: 'permission_denied'
  },

  async onLoad(options) {
    const pageStartTime = Date.now();
    console.log('主页开始加载');

    try {
      // 阶段1: 立即显示骨架屏，避免白屏
      this.setData({ loading: true });
      
      // 阶段2: 关键路径 - 并行加载认证和用户信息
      const [authModule] = await Promise.all([
        loadAuth(),
        this.calculateListHeight() // 同步计算，立即完成
      ]);
      
      // 检查认证模块是否正确加载
      if (!authModule || typeof authModule.checkLogin !== 'function') {
        console.error('认证模块加载失败:', authModule);
        console.error('authModule keys:', Object.keys(authModule || {}));
        // 降级处理：使用同步require方式加载
        try {
          const authSync = require('../../modules/auth/auth');
          auth = authSync.default || authSync;
          if (!auth.checkLogin()) {
            console.log('用户未登录，跳转登录页');
            return;
          }
        } catch (e) {
          console.error('同步加载认证模块也失败:', e);
          return;
        }
      } else {
        // 检查登录状态
        if (!authModule.checkLogin()) {
          console.log('用户未登录，跳转登录页');
          return;
        }
      }
      
      // 获取用户信息（已缓存，速度很快）
      const currentAuth = auth || authModule;
      const token = currentAuth.getToken();
      const userInfo = currentAuth.getUserInfo();
      
      if (token && userInfo) {
        // 同步全局状态
        app.globalData.token = token;
        app.globalData.userInfo = userInfo;
        app.globalData.isLogin = true;
        
        // 立即更新UI显示用户信息
        this.setData({
          userInfo,
          isTeacher: currentAuth.isTeacher()
        });
        
        console.log('用户信息加载完成:', Date.now() - pageStartTime + 'ms');
      }
      
      // 阶段3: 异步加载任务列表（不阻塞首屏渲染）
      setTimeout(async () => {
        console.log('🎯 [DEBUG] 开始异步加载任务列表...');
        console.log('🎯 [DEBUG] 强制重置所有loading状态以允许任务加载');
        // 强制重置所有loading状态，允许loadTaskList执行
        this.setData({ 
          loading: false, 
          loadingMore: false, 
          refreshing: false 
        });
        try {
          console.log('🎯 [DEBUG] 调用 this.loadTaskList()...');
          await this.loadTaskList();
          console.log('🎯 [DEBUG] 任务列表加载完成');
        } catch (error) {
          console.error('🎯 [DEBUG] 任务列表加载失败:', error);
          this.setData({ loading: false, loadingMore: false, refreshing: false });
        }
      }, 50); // 很短的延迟，让首屏先渲染
      
      // 阶段4: 处理分享链接（低优先级）
      if (options.share && options.id) {
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/task-detail/task-detail?id=${options.id}`
          });
        }, 300); // 等UI稳定后再跳转
      }
      
      const totalLoadTime = Date.now() - pageStartTime;
      console.log(`主页首屏加载完成: ${totalLoadTime}ms`);
      
    } catch (error) {
      console.error('主页加载失败:', error);
      // 降级处理
      this.fallbackLoad(options);
    }
  },

  // 降级加载方式
  async fallbackLoad(options) {
    console.warn('使用降级加载方式');
    
    try {
      const authModule = require('../../modules/auth/auth');
      const taskModuleSync = require('../../modules/task/task');
      
      // 兼容default导出
      auth = authModule.default || authModule;
      taskModule = taskModuleSync.default || taskModuleSync;
      
      if (!auth.checkLogin()) return;
      
      const userInfo = auth.getUserInfo();
      this.setData({
        userInfo,
        isTeacher: auth.isTeacher()
      });
      
      this.calculateListHeight();
      await this.loadTaskList();
      
    } catch (error) {
      console.error('降级加载也失败:', error);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    }
  },

  onShow() {
    // 更新自定义tabBar
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().updateTabBarData()
      this.getTabBar().updateSelected()
    }
    
    // 页面显示时刷新（如果需要）
    if (this.data.userInfo) {
      // 检查是否需要刷新（比如从详情页返回）
      const needRefresh = wx.getStorageSync('needRefreshTaskList')
      if (needRefresh) {
        wx.removeStorageSync('needRefreshTaskList')
        this.onRefresh()
      }
    }
  },

  // 加载任务列表
  async loadTaskList(loadMore = false) {
    console.log('🎯 [DEBUG] loadTaskList 函数开始执行, loadMore:', loadMore);
    console.log('🎯 [DEBUG] 当前loading状态:', this.data.loading, this.data.loadingMore);
    console.log('🎯 [DEBUG] 当前data对象:', JSON.stringify({
      loading: this.data.loading,
      loadingMore: this.data.loadingMore,
      page: this.data.page,
      currentFilter: this.data.currentFilter
    }));
    
    if (this.data.loading || this.data.loadingMore) {
      console.log('🎯 [DEBUG] 已在加载中，跳过请求');
      return;
    }
    
    console.log('🎯 [DEBUG] 设置loading状态...');
    this.setData({
      [loadMore ? 'loadingMore' : 'loading']: true
    });
    
    try {
      console.log('🎯 [DEBUG] 开始懒加载任务模块...');
      // 懒加载任务模块
      const taskModuleInstance = await loadTaskModule();
      console.log('🎯 [DEBUG] 任务模块加载完成:', !!taskModuleInstance);
      
      const params = {
        page: loadMore ? this.data.page + 1 : 1,
        page_size: this.data.pageSize
      };
      
      // 添加筛选条件
      if (this.data.currentFilter !== 'all') {
        params.status = this.data.currentFilter;
      }
      
      console.log('🎯 [DEBUG] 准备调用 taskModuleInstance.getTaskList, params:', params);
      const result = await taskModuleInstance.getTaskList(params);
      console.log('🎯 [DEBUG] getTaskList 调用完成, result:', result);
      
      let tasks = result.tasks || []
      
      
      const newTaskList = loadMore ? [...this.data.taskList, ...tasks] : tasks
      
      this.setData({
        taskList: newTaskList,
        originalTaskList: loadMore ? [...this.data.originalTaskList, ...tasks] : tasks, // 保存原始数据用于搜索
        page: result.page,
        total: result.total,
        hasMore: (result.page * result.page_size) < result.total,
        isEmpty: !loadMore && tasks.length === 0,
        loading: false,
        loadingMore: false,
        refreshing: false
      })
    } catch (error) {
      console.error('加载任务列表失败', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      this.setData({
        loading: false,
        loadingMore: false,
        refreshing: false
      })
    }
  },

  // 下拉刷新
  async onRefresh() {
    if (this.data.refreshing) return
    
    this.setData({ 
      refreshing: true,
      page: 1,
      hasMore: true
    })
    
    await this.loadTaskList(false)
  },

  // 上拉加载更多
  onLoadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.loadTaskList(true)
  },

  // 切换筛选
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.currentFilter) return
    
    this.setData({
      currentFilter: filter,
      page: 1,
      hasMore: true,
      taskList: []
    })
    
    this.loadTaskList()
  },

  // 任务卡片点击
  async onTaskClick(e) {
    const { task } = e.detail
    
    // 权限检查
    const authModule = await loadAuth()
    
    // 教师用户直接跳转
    if (authModule.isTeacher()) {
      wx.navigateTo({
        url: `/pages/task-detail/task-detail?id=${task.id}`
      })
      return
    }
    
    // 检查是否为试用用户
    if (authModule.isTrialUser()) {
      wx.showModal({
        title: '试用学员无法使用',
        content: '只能浏览课程目录',
        confirmText: '返回',
        showCancel: false
      })
      return
    }
    
    // 检查权限是否过期
    if (authModule.isPermissionExpired()) {
      wx.showModal({
        title: '权限已过期',
        content: '您的学习权限已过期，请联系客服续费。',
        confirmText: '联系客服',
        cancelText: '返回'
      })
      return
    }
    
    // 付费用户正常跳转
    wx.navigateTo({
      url: `/pages/task-detail/task-detail?id=${task.id}`
    })
  },

  // 切换任务状态（教师功能）
  async onToggleStatus(e) {
    const { task } = e.detail
    
    wx.showModal({
      title: '切换状态',
      content: `确定要将任务状态切换为${task.status === 'ongoing' ? '已结束' : '进行中'}吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' })
            const taskModuleInstance = await loadTaskModule()
            await taskModuleInstance.toggleTaskStatus(task.id)
            wx.hideLoading()
            wx.showToast({
              title: '切换成功',
              icon: 'success'
            })
            // 刷新列表
            this.onRefresh()
          } catch (error) {
            wx.hideLoading()
            wx.showToast({
              title: '切换失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 分享任务（教师功能）
  async onShareTask(e) {
    const { task } = e.detail
    
    try {
      wx.showLoading({ title: '生成分享...' })
      const taskModuleInstance = await loadTaskModule()
      const shareData = await taskModuleInstance.generateShareLink(task.id)
      wx.hideLoading()
      
      // 设置分享信息
      this.shareData = shareData
      
      // 显示分享菜单
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      })
      
      // 提示用户点击右上角分享
      wx.showToast({
        title: '请点击右上角分享',
        icon: 'none',
        duration: 2000
      })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({
        title: '生成分享失败',
        icon: 'none'
      })
    }
  },

  // 查看任务统计（教师功能）
  onViewStats(e) {
    const { task } = e.detail
    wx.navigateTo({
      url: `/pages/admin/task-manage/task-manage?id=${task.id}`
    })
  },

  // 跳转到创建任务（教师功能）
  async onCreateTask() {
    try {
      const authModule = await loadAuth()
      if (!authModule.checkTeacherRole()) return
      
      wx.navigateTo({
        url: '/pages/admin/task-manage/task-manage?action=create'
      })
    } catch (error) {
      console.error('检查教师权限失败:', error)
    }
  },

  // 计算虚拟列表高度
  calculateListHeight() {
    wx.getSystemInfo({
      success: (res) => {
        // 获取窗口高度
        const windowHeight = res.windowHeight
        
        // 计算其他元素占用的高度
        // 顶部用户信息栏约 120rpx = 120/750 * windowWidth
        // 任务筛选器约 88rpx = 88/750 * windowWidth  
        // 底部安全区约 20rpx = 20/750 * windowWidth
        const rpxRatio = res.windowWidth / 750
        const headerHeight = 120 * rpxRatio
        const filterHeight = 88 * rpxRatio
        const safeBottomHeight = 20 * rpxRatio
        
        // 计算列表可用高度
        const listHeight = windowHeight - headerHeight - filterHeight - safeBottomHeight - 20 // 20px预留空间
        
        this.setData({
          listHeight: Math.max(listHeight, 400) // 最小高度400px
        })
      }
    })
  },

  // 虚拟列表滚动事件
  onVirtualScroll(e) {
    // 透传滚动事件，可以在这里添加滚动监听逻辑
    // console.log('虚拟列表滚动', e.detail)
    
    // 可以在这里添加滚动位置记忆、无限滚动等功能
  },

  // 搜索相关方法
  onSearchToggle() {
    this.setData({
      showSearch: !this.data.showSearch
    })
  },

  onCancelSearch() {
    this.setData({
      showSearch: false,
      searchKeyword: '',
      taskList: this.data.originalTaskList
    })
  },

  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({
      searchKeyword: keyword
    })
    
    // 实时搜索，延迟300ms执行
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.performSearch(keyword)
    }, 300)
  },

  onSearch(e) {
    const keyword = e.detail.value || this.data.searchKeyword
    this.performSearch(keyword)
  },

  onClearSearch() {
    this.setData({
      searchKeyword: '',
      taskList: this.data.originalTaskList
    })
  },

  performSearch(keyword) {
    if (!keyword.trim()) {
      // 如果搜索关键字为空，显示所有任务
      this.setData({
        taskList: this.data.originalTaskList
      })
      return
    }

    // 在原始任务列表中搜索
    const filteredTasks = this.data.originalTaskList.filter(task => {
      return task.title && task.title.toLowerCase().includes(keyword.toLowerCase())
    })

    this.setData({
      taskList: filteredTasks,
      isEmpty: filteredTasks.length === 0
    })
  },

  // 分享设置
  onShareAppMessage() {
    if (this.shareData) {
      return {
        title: this.shareData.title,
        path: this.shareData.path,
        imageUrl: this.shareData.imageUrl
      }
    }
    
    return {
      title: '公考督学助手 - 高效提升申论成绩',
      path: '/pages/index/index',
      // imageUrl: '/assets/images/share-default.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '公考督学助手 - 高效提升申论成绩',
      query: '',
      // imageUrl: '/assets/images/share-timeline.png'
    }
  },

  // 图片加载错误处理
  onImageError(e) {
    console.warn('图片加载失败:', e.detail.errMsg);
    // 可以在这里添加默认图片或重试逻辑
  },

  // 升级引导相关方法
  
  // 关闭升级引导
  onUpgradeGuideClose() {
    this.setData({ showUpgradeGuide: false });
  }
})