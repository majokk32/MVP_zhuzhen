// app.js
// 小程序全局应用实例
const performanceOptimizer = require('./utils/performance-optimizer');
const errorHandler = require('./utils/error-handler');
const { analyticsHelper, analytics } = require('./utils/analytics-helper');
const performanceMonitor = require('./utils/performance-monitor');

App({
  // 优化的启动流程
  onLaunch(options) {
    const launchStartTime = Date.now();
    
    // 记录启动时间
    performanceOptimizer.performanceData.startTime = launchStartTime;
    
    // 追踪应用启动
    analytics.trackAppLifecycle('app_launch', {
      scene: options.scene,
      path: options.path,
      query: options.query,
      referrerInfo: options.referrerInfo
    });
    
    // 优化关键路径启动
    this.optimizedStartup(options, launchStartTime);
  },

  // 优化的启动流程
  async optimizedStartup(options, startTime) {
    try {
      // 阶段1: 关键系统初始化（同步，最快速度）
      this.initCriticalSystems();
      
      // 阶段2: 关键路径任务（异步并行）
      const criticalTasks = this.defineCriticalTasks();
      await performanceOptimizer.optimizeCriticalPath(criticalTasks);
      
      // 阶段3: 次要任务（延迟执行）
      setTimeout(() => {
        this.initSecondaryFeatures(options);
      }, 100);
      
      // 记录启动完成时间
      const appLaunchTime = Date.now() - startTime;
      performanceOptimizer.performanceData.appLaunchTime = appLaunchTime;
      
      // 记录应用启动性能指标
      performanceMonitor.recordAppLaunchMetrics(startTime, options);
      
      console.log(`应用启动完成: ${appLaunchTime}ms`);
      
    } catch (error) {
      console.error('优化启动流程失败:', error);
      // 降级到传统启动方式
      this.fallbackStartup(options);
    }
  },

  // 关键系统初始化
  initCriticalSystems() {
    // 获取系统信息（同步，必需）
    this.globalData.systemInfo = wx.getSystemInfoSync();
    
    // 设置全局错误处理（同步，必需）
    this.setupGlobalErrorHandler();
    
    // 初始化性能监控
    this.globalData.performanceOptimizer = performanceOptimizer;
    this.globalData.performanceMonitor = performanceMonitor;
    
    // 初始化埋点系统
    this.setupAnalytics();
  },

  // 定义关键路径任务
  defineCriticalTasks() {
    return [
      {
        id: 'auth_check',
        type: 'auth',
        priority: 'critical',
        timeout: 2000
      },
      {
        id: 'user_info',
        type: 'userInfo', 
        priority: 'critical',
        timeout: 1500
      }
    ];
  },

  // 次要功能初始化
  initSecondaryFeatures(options) {
    // 处理深链接参数
    this.handleLaunchOptions(options);
    
    // 设置预加载任务
    this.setupPreloadTasks();
    
    // 初始化其他非关键功能
    this.initNonCriticalFeatures();
  },

  // 设置预加载任务
  setupPreloadTasks() {
    // 预加载任务模块
    performanceOptimizer.addPreloadTask({
      type: 'module',
      path: '../../modules/task/task',
      priority: 'high'
    });
    
    // 预加载常用图片资源
    performanceOptimizer.addPreloadTask({
      type: 'image',
      url: '/assets/images/default-avatar.svg',
      priority: 'medium'
    });
    
    performanceOptimizer.addPreloadTask({
      type: 'image', 
      url: '/assets/images/avatar-placeholder.svg',
      priority: 'low'
    });
  },

  // 初始化非关键功能
  initNonCriticalFeatures() {
    // 这些功能延迟初始化，不影响首屏
    setTimeout(() => {
      // 初始化分享功能
      this.initShareFeatures();
      
      // 初始化统计功能
      this.initAnalytics();
      
    }, 500);
  },

  // 降级启动方式
  fallbackStartup(options) {
    console.warn('使用降级启动方式');
    
    // 设置全局错误处理
    this.setupGlobalErrorHandler();
    
    // 获取系统信息
    this.globalData.systemInfo = wx.getSystemInfoSync();
    
    // 处理深链接参数
    this.handleLaunchOptions(options);
    
    // 检查登录状态
    this.checkSession();
  },

  // 设置全局错误处理
  setupGlobalErrorHandler() {
    try {
      // 错误处理器已经在模块加载时自动初始化
      // 这里只需要设置app级别的配置
      this.globalData.errorHandler = errorHandler;
      
      // 监听内存不足警告
      wx.onMemoryWarning((res) => {
        console.warn('内存不足警告:', res.level);
        wx.setStorageSync('memory_warning', res.level >= 10);
        
        if (res.level >= 10) {
          errorHandler.handleUIError(
            new Error(`内存警告等级: ${res.level}`),
            'system',
            { memoryLevel: res.level }
          );
        }
      });

      // 设置订阅事件处理
      this.onSubscriptionEvent = (eventData) => {
        console.log('订阅事件:', eventData);
        // 这里可以添加全局的订阅事件处理逻辑
      };

      console.log('全局错误处理器已设置');
    } catch (error) {
      console.error('设置全局错误处理器失败:', error);
    }
  },

  // 设置埋点系统
  setupAnalytics() {
    try {
      // 设置全局引用
      this.globalData.analytics = analytics;
      this.globalData.analyticsHelper = analyticsHelper;
      
      // 启用自动追踪
      analyticsHelper.enableAutoTracking({
        pageViews: true,
        userInteractions: true,
        errors: true,
        performance: true,
        api: true
      });
      
      // 集成错误处理器和埋点系统
      const originalHandleError = errorHandler.handleUIError;
      errorHandler.handleUIError = function(error, component, context) {
        // 先执行原来的错误处理
        const result = originalHandleError.call(this, error, component, context);
        
        // 然后发送错误埋点
        analytics.trackError({
          type: 'UI_ERROR',
          message: error.message || '界面错误',
          stack: error.stack,
          pageRoute: analytics.getCurrentPageRoute(),
          component: component,
          severity: 'medium',
          context
        });
        
        return result;
      };

      const originalHandleApiError = errorHandler.handleApiError;
      errorHandler.handleApiError = function(error, context) {
        // 先执行原来的错误处理
        const result = originalHandleApiError.call(this, error, context);
        
        // 然后发送API错误埋点
        analytics.trackError({
          type: 'API_ERROR',
          message: error.message || error.errMsg || 'API错误',
          statusCode: error.statusCode,
          url: context.url,
          method: context.method,
          pageRoute: analytics.getCurrentPageRoute(),
          severity: error.statusCode >= 500 ? 'high' : 'medium',
          context
        });
        
        return result;
      };

      const originalHandlePaymentError = errorHandler.handlePaymentError;
      errorHandler.handlePaymentError = function(error, context) {
        // 先执行原来的错误处理
        const result = originalHandlePaymentError.call(this, error, context);
        
        // 然后发送支付错误埋点
        analytics.trackError({
          type: 'PAYMENT_ERROR',
          message: error.message || error.errMsg || '支付错误',
          errorCode: error.errorCode,
          pageRoute: analytics.getCurrentPageRoute(),
          severity: 'high',
          context
        });
        
        return result;
      };

      console.log('埋点系统初始化完成');
    } catch (error) {
      console.error('埋点系统初始化失败:', error);
    }
  },

  // 检查登录会话是否有效
  async checkSession() {
    try {
      // 检查session是否过期
      const checkResult = await wx.checkSession()
      
      // session未过期，检查本地是否有token
      const token = wx.getStorageSync('token')
      const userInfo = wx.getStorageSync('userInfo')
      
      if (token && userInfo) {
        // 验证token有效性（可选）
        this.globalData.token = token
        this.globalData.userInfo = userInfo
        this.globalData.isLogin = true
        
        // 根据角色动态设置
        if (userInfo.role === 'teacher') {
          this.globalData.isTeacher = true
        }
      } else {
        // 静默登录
        await this.silentLogin()
      }
    } catch (error) {
      console.log('Session已过期，需要重新登录')
      // 清除本地存储
      wx.removeStorageSync('token')
      wx.removeStorageSync('userInfo')
    }
  },

  // 静默登录（不需要用户授权）
  silentLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (res.code) {
            try {
              // 使用code换取token（静默登录）
              const loginResult = await this.request({
                url: '/users/login',
                method: 'POST',
                data: { code: res.code }
              })
              
              // 保存登录态
              this.saveLoginState(loginResult)
              resolve(loginResult)
            } catch (error) {
              console.error('登录失败', error)
              
              // 埋点：用户登录失败
              analytics.trackLogin('wechat', false, error);
              
              reject(error)
            }
          } else {
            reject(new Error('获取code失败'))
          }
        },
        fail: reject
      })
    })
  },

  // 保存登录状态
  saveLoginState(loginData) {
    const { token, user } = loginData
    
    // 埋点：用户登录成功
    analytics.trackLogin('wechat', true);
    analytics.setUser(user.id, user.role, user);
    
    // 保存到本地存储
    wx.setStorageSync('token', token)
    wx.setStorageSync('userInfo', user)
    
    // 更新全局数据
    this.globalData.token = token
    this.globalData.userInfo = user
    this.globalData.isLogin = true
    
    // 判断是否为教师
    if (user.role === 'teacher') {
      this.globalData.isTeacher = true
    }
    
    // 动态更新tabBar
    this.updateTabBar()
  },

  // 动态更新tabBar配置
  updateTabBar() {
    const userInfo = this.globalData.userInfo || wx.getStorageSync('userInfo')
    
    if (!userInfo) return
    
    // 基础tabBar配置
    let tabBarList = [
      {
        "pagePath": "pages/index/index",
        "text": "任务",
        "iconPath": "/images/tabbar/task.png",
        "selectedIconPath": "/images/tabbar/task_active.png"
      },
      {
        "pagePath": "pages/profile/profile", 
        "text": "我的",
        "iconPath": "/images/tabbar/profile.png",
        "selectedIconPath": "/images/tabbar/profile_active.png"
      }
    ]
    
    // 如果是教师角色，添加教研标签
    if (userInfo.isTeacher || userInfo.role === 'teacher') {
      tabBarList.push({
        "pagePath": "pages/admin/index/index",
        "text": "教研", 
        "iconPath": "/images/tabbar/admin.png",
        "selectedIconPath": "/images/tabbar/admin_active.png"
      })
    }
    
    // 动态设置tabBar
    try {
      // 小程序基础库 2.5.0 以上支持 wx.setTabBarItem
      for (let i = 0; i < tabBarList.length; i++) {
        wx.setTabBarItem({
          index: i,
          text: tabBarList[i].text,
          iconPath: tabBarList[i].iconPath,
          selectedIconPath: tabBarList[i].selectedIconPath
        })
      }
      
      // 显示或隐藏tabBar标签
      if (tabBarList.length > 2) {
        // 显示教研标签
        wx.showTabBarRedDot({
          index: 2
        }).then(() => {
          wx.hideTabBarRedDot({
            index: 2
          })
        }).catch(() => {
          // 忽略错误，可能页面不存在tabBar
        })
      }
    } catch (error) {
      console.warn('动态设置tabBar失败:', error)
      // 降级方案：通过页面跳转实现
      this.globalData.shouldShowTeacherTab = (userInfo.isTeacher || userInfo.role === 'teacher')
    }
  },

  // 智能Loading管理器
  loadingManager: {
    loadingCount: 0,
    loadingQueue: new Set(),
    
    // 显示loading
    show(options = {}) {
      const requestId = options.requestId || Date.now().toString();
      this.loadingQueue.add(requestId);
      
      if (this.loadingCount === 0) {
        wx.showLoading({
          title: options.title || '加载中...',
          mask: options.mask !== false
        });
      }
      this.loadingCount++;
      return requestId;
    },
    
    // 隐藏loading
    hide(requestId) {
      if (requestId) {
        this.loadingQueue.delete(requestId);
      }
      
      this.loadingCount = Math.max(0, this.loadingCount - 1);
      
      if (this.loadingCount === 0 && this.loadingQueue.size === 0) {
        wx.hideLoading();
      }
    },
    
    // 强制隐藏所有loading
    hideAll() {
      this.loadingCount = 0;
      this.loadingQueue.clear();
      wx.hideLoading();
    }
  },

  // 智能重试管理器
  retryManager: {
    retryMap: new Map(),
    
    // 添加重试策略
    addRetry(requestKey, retryOptions) {
      this.retryMap.set(requestKey, {
        maxRetries: retryOptions.maxRetries || 3,
        currentRetry: 0,
        baseDelay: retryOptions.baseDelay || 1000,
        backoffFactor: retryOptions.backoffFactor || 2,
        originalRequest: retryOptions.originalRequest
      });
    },
    
    // 检查是否可以重试
    canRetry(requestKey) {
      const retryInfo = this.retryMap.get(requestKey);
      if (!retryInfo) return false;
      return retryInfo.currentRetry < retryInfo.maxRetries;
    },
    
    // 执行重试
    async executeRetry(requestKey) {
      const retryInfo = this.retryMap.get(requestKey);
      if (!retryInfo || !this.canRetry(requestKey)) {
        this.retryMap.delete(requestKey);
        throw new Error('重试次数已用完');
      }
      
      retryInfo.currentRetry++;
      
      // 指数退避延迟
      const delay = retryInfo.baseDelay * Math.pow(retryInfo.backoffFactor, retryInfo.currentRetry - 1);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        const result = await retryInfo.originalRequest();
        this.retryMap.delete(requestKey);
        return result;
      } catch (error) {
        if (this.canRetry(requestKey)) {
          return this.executeRetry(requestKey);
        } else {
          this.retryMap.delete(requestKey);
          throw error;
        }
      }
    },
    
    // 清除重试信息
    clearRetry(requestKey) {
      this.retryMap.delete(requestKey);
    }
  },

  // 错误处理管理器
  errorManager: {
    // 错误分类
    classifyError(error) {
      if (!error) return 'unknown';
      
      const errorMsg = error.errMsg || error.message || '';
      
      // 网络错误
      if (errorMsg.includes('timeout')) return 'network_timeout';
      if (errorMsg.includes('fail')) return 'network_fail';
      if (errorMsg.includes('abort')) return 'network_abort';
      if (errorMsg.includes('interrupted')) return 'network_interrupted';
      
      // HTTP状态码错误
      if (error.statusCode) {
        if (error.statusCode === 401) return 'auth_expired';
        if (error.statusCode === 403) return 'permission_denied';
        if (error.statusCode === 404) return 'not_found';
        if (error.statusCode >= 500) return 'server_error';
      }
      
      // 业务错误
      if (error.code && error.code !== 0 && error.code !== 200) return 'business_error';
      
      return 'unknown';
    },
    
    // 获取用户友好的错误信息
    getErrorMessage(errorType, error) {
      const messages = {
        network_timeout: '网络超时，请检查网络连接',
        network_fail: '网络连接失败，请稍后重试',
        network_abort: '请求被取消',
        network_interrupted: '网络连接被中断',
        auth_expired: '登录已过期，请重新登录',
        permission_denied: '权限不足，请联系管理员',
        not_found: '请求的资源不存在',
        server_error: '服务器错误，请稍后重试',
        business_error: error?.msg || error?.message || '操作失败',
        unknown: '发生未知错误，请稍后重试'
      };
      
      return messages[errorType] || messages.unknown;
    },
    
    // 检查错误是否可重试
    isRetryableError(errorType) {
      const retryableErrors = [
        'network_timeout',
        'network_fail', 
        'network_interrupted',
        'server_error'
      ];
      return retryableErrors.includes(errorType);
    },
    
    // 显示错误信息
    showErrorMessage(errorType, error, options = {}) {
      const message = this.getErrorMessage(errorType, error);
      
      if (errorType === 'auth_expired') {
        wx.showModal({
          title: '提示',
          content: message,
          showCancel: false,
          success: () => {
            // 清除登录信息并跳转到登录页
            wx.removeStorageSync('token');
            wx.removeStorageSync('userInfo');
            wx.reLaunch({
              url: '/pages/login/login'
            });
          }
        });
      } else if (options.showRetry && this.isRetryableError(errorType)) {
        wx.showModal({
          title: '网络异常',
          content: message + '\n\n是否重试？',
          confirmText: '重试',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm && options.onRetry) {
              options.onRetry();
            }
          }
        });
      } else {
        wx.showToast({
          title: message,
          icon: 'none',
          duration: options.duration || 2500
        });
      }
    }
  },

  // 封装网络请求
  request(options) {
    const requestKey = options.requestKey || `${options.method || 'GET'}_${options.url}_${Date.now()}`;
    
    return this._executeRequest(options, requestKey);
  },
  
  // 内部执行请求的方法
  _executeRequest(options, requestKey, retryCount = 0) {
    let loadingId = null;
    const requestStartTime = Date.now(); // 记录请求开始时间
    
    // 智能显示加载提示
    if (options.showLoading !== false) {
      loadingId = this.loadingManager.show({
        title: options.loadingText || '加载中...',
        mask: options.loadingMask !== false,
        requestId: options.requestId || requestKey
      });
    }
    
    const baseUrl = this.globalData.baseUrl;
    const token = this.globalData.token || wx.getStorageSync('token');
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: baseUrl + options.url,
        method: options.method || 'GET',
        data: options.data || {},
        header: {
          'content-type': options.contentType || 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          ...options.header
        },
        success: (res) => {
          // 隐藏loading
          if (loadingId) {
            this.loadingManager.hide(loadingId);
          }
          
          // 记录API性能指标
          const responseTime = Date.now() - requestStartTime;
          const dataSize = JSON.stringify(res.data).length;
          performanceMonitor.recordApiMetric(
            options.url, 
            options.method || 'GET', 
            responseTime, 
            res.statusCode, 
            dataSize,
            res.statusCode !== 200 ? res : null
          );
          
          // 请求成功时重置重试计数
          if (this.retryManager.retryRecord[requestKey]) {
            delete this.retryManager.retryRecord[requestKey];
          }
          
          // 处理HTTP状态码
          if (res.statusCode === 200) {
            // 处理业务状态码
            if (res.data.code === 0 || res.data.code === 200) {
              resolve(res.data);
            } else {
              // 业务错误处理
              const error = res.data;
              error.statusCode = res.statusCode;
              
              // 使用新的错误处理器
              const errorInfo = errorHandler.handleApiError(error, {
                url: options.url,
                method: options.method || 'GET',
                data: options.data,
                retryCount,
                requestKey
              });
              
              reject(error);
            }
          } else {
            // HTTP错误处理
            const error = { statusCode: res.statusCode, message: `HTTP ${res.statusCode}`, errMsg: `HTTP ${res.statusCode}` };
            
            // 使用新的错误处理器
            const errorInfo = errorHandler.handleApiError(error, {
              url: options.url,
              method: options.method || 'GET',
              data: options.data,
              retryCount,
              requestKey
            });
            
            reject(error);
          }
        },
        fail: (err) => {
          // 隐藏loading
          if (loadingId) {
            this.loadingManager.hide(loadingId);
          }
          
          // 记录API性能指标（失败的请求）
          const responseTime = Date.now() - requestStartTime;
          performanceMonitor.recordApiMetric(
            options.url, 
            options.method || 'GET', 
            responseTime, 
            err.statusCode || 0, 
            0,
            err
          );
          
          // 网络错误处理
          err.message = err.errMsg || '网络请求失败';
          
          // 使用新的错误处理器
          const errorInfo = errorHandler.handleApiError(err, {
            url: options.url,
            method: options.method || 'GET',
            data: options.data,
            retryCount,
            requestKey,
            retryCallback: () => this._handleRetry(options, requestKey, retryCount)
          });
          
          // 自动重试逻辑（保留现有重试机制）
          if (this.shouldRetryRequest(err, retryCount)) {
            this.retryManager.executeRetry(requestKey, () => {
              this._executeRequest(options, requestKey, retryCount + 1)
                .then(resolve)
                .catch(reject);
            });
          } else {
            reject(err);
          }
        }
      });
    });
  },
  
  // 处理手动重试
  _handleRetry(options, requestKey, retryCount) {
    this.retryManager.executeRetry(requestKey, () => {
      return this._executeRequest(options, requestKey, retryCount + 1);
    });
  },

  // 判断是否应该重试请求
  shouldRetryRequest(error, retryCount) {
    // 检查是否达到最大重试次数
    if (retryCount >= this.retryManager.maxRetries) {
      return false;
    }

    // 检查错误类型是否可重试
    const retryableErrors = [
      'request:fail timeout',
      'request:fail -1',
      'request:fail -2',
      'request:fail socket hang up'
    ];

    const errMsg = error.errMsg || '';
    
    // 网络相关错误可以重试
    if (retryableErrors.some(msg => errMsg.includes(msg))) {
      return true;
    }

    // HTTP 5xx 错误可以重试
    if (error.statusCode >= 500) {
      return true;
    }

    return false;
  },

  // 上传文件（增强版）
  async uploadFile(options) {
    const uploadKey = options.uploadKey || `upload_${options.filePath}_${Date.now()}`;
    
    // 如果是图片且启用压缩，先进行压缩处理
    let finalFilePath = options.filePath;
    let compressInfo = null;
    
    if (this._isImage(options.filePath) && options.compress !== false) {
      try {
        const imageOptimizer = require('./utils/image-optimizer');
        const compressResult = await imageOptimizer.compressImage(options.filePath, {
          quality: options.quality || 0.8,
          maxWidth: options.maxWidth || 1200,
          maxHeight: options.maxHeight || 1200
        });
        
        finalFilePath = compressResult.tempFilePath;
        compressInfo = compressResult;
        
        console.log('图片压缩完成:', {
          originalSize: compressResult.originalSize,
          compressedSize: compressResult.compressedSize,
          compressionRatio: compressResult.compressionRatio
        });
        
      } catch (error) {
        console.warn('图片压缩失败，使用原图:', error);
        // 压缩失败时继续使用原图
      }
    }
    
    // 使用处理后的文件路径进行上传
    const uploadOptions = {
      ...options,
      filePath: finalFilePath,
      _compressInfo: compressInfo
    };
    
    return this._executeUpload(uploadOptions, uploadKey, 0);
  },
  
  // 内部执行上传的方法
  _executeUpload(options, uploadKey, retryCount = 0) {
    return new Promise((resolve, reject) => {
      const baseUrl = this.globalData.baseUrl;
      const token = this.globalData.token || wx.getStorageSync('token');
      
      // 记录上传开始时间用于计算速度
      const startTime = Date.now();
      
      const uploadTask = wx.uploadFile({
        url: baseUrl + options.url,
        filePath: options.filePath,
        name: options.name || 'file',
        formData: options.formData || {},
        header: {
          'Authorization': token ? `Bearer ${token}` : '',
          ...options.header
        },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            
            // 上传成功时重置重试计数
            if (this.retryManager.retryRecord[uploadKey]) {
              delete this.retryManager.retryRecord[uploadKey];
            }
            
            if (data.code === 0 || data.code === 200) {
              // 计算上传耗时
              const uploadTime = Date.now() - startTime;
              
              // 触发上传完成回调
              if (options.onComplete) {
                options.onComplete({
                  success: true,
                  data: data.data,
                  uploadTime
                });
              }
              
              resolve(data.data);
            } else {
              // 业务错误处理
              const errorType = this.errorManager.classifyError(data);
              
              if (options.showError !== false) {
                this.errorManager.showErrorMessage(errorType, data, {
                  showRetry: this.errorManager.isRetryableError(errorType) && retryCount < this.retryManager.maxRetries,
                  onRetry: () => this._handleUploadRetry(options, uploadKey, retryCount)
                });
              }
              
              // 触发上传失败回调
              if (options.onComplete) {
                options.onComplete({
                  success: false,
                  error: data,
                  uploadTime: Date.now() - startTime
                });
              }
              
              reject(data);
            }
          } catch (parseError) {
            const error = { message: '解析响应数据失败', parseError };
            
            if (options.onComplete) {
              options.onComplete({
                success: false,
                error,
                uploadTime: Date.now() - startTime
              });
            }
            
            reject(error);
          }
        },
        fail: (err) => {
          const errorType = this.errorManager.classifyError(err);
          
          // 自动重试逻辑
          if (this.errorManager.isRetryableError(errorType) && retryCount < this.retryManager.maxRetries) {
            this.retryManager.executeRetry(uploadKey, () => {
              this._executeUpload(options, uploadKey, retryCount + 1)
                .then(resolve)
                .catch(reject);
            });
          } else {
            // 显示错误信息
            if (options.showError !== false) {
              this.errorManager.showErrorMessage(errorType, err, {
                showRetry: false
              });
            }
            
            // 触发上传失败回调
            if (options.onComplete) {
              options.onComplete({
                success: false,
                error: err,
                uploadTime: Date.now() - startTime
              });
            }
            
            reject(err);
          }
        }
      });
      
      // 监听上传进度
      if (options.onProgress) {
        uploadTask.onProgressUpdate((res) => {
          const progress = {
            progress: res.progress,
            totalBytesSent: res.totalBytesSent,
            totalBytesExpectedToSend: res.totalBytesExpectedToSend,
            speed: this._calculateUploadSpeed(startTime, res.totalBytesSent),
            remainingTime: this._calculateRemainingTime(startTime, res.progress, res.totalBytesSent)
          };
          
          options.onProgress(progress);
        });
      }
      
      // 存储上传任务引用，支持外部取消
      if (options.onTaskCreated) {
        options.onTaskCreated(uploadTask);
      }
    });
  },
  
  // 处理上传重试
  _handleUploadRetry(options, uploadKey, retryCount) {
    this.retryManager.executeRetry(uploadKey, () => {
      return this._executeUpload(options, uploadKey, retryCount + 1);
    });
  },
  
  // 计算上传速度 (KB/s)
  _calculateUploadSpeed(startTime, uploadedBytes) {
    const elapsedTime = (Date.now() - startTime) / 1000; // 秒
    if (elapsedTime <= 0) return 0;
    
    return Math.round((uploadedBytes / 1024) / elapsedTime); // KB/s
  },
  
  // 计算剩余上传时间 (秒)
  _calculateRemainingTime(startTime, progress, uploadedBytes) {
    if (progress <= 0) return 0;
    
    const elapsedTime = (Date.now() - startTime) / 1000;
    const speed = uploadedBytes / elapsedTime; // bytes/s
    
    if (speed <= 0) return 0;
    
    const remainingBytes = (uploadedBytes / progress * 100) - uploadedBytes;
    return Math.round(remainingBytes / speed);
  },

  // 判断文件是否为图片
  _isImage(filePath) {
    if (!filePath) return false;
    
    const ext = filePath.split('.').pop()?.toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    
    return imageExtensions.includes(ext);
  },

  // 处理启动参数（深链接）
  handleLaunchOptions(options) {
    console.log('Launch options:', options);
    
    // 保存启动参数，登录完成后处理跳转
    if (options && options.query) {
      this.globalData.launchQuery = options.query;
    }
    
    // 处理场景值
    if (options.scene) {
      this.globalData.launchScene = options.scene;
    }
  },

  // 小程序显示时处理（处理分享进入场景）
  onShow(options) {
    if (options) {
      this.handleLaunchOptions(options);
    }
  },

  // 处理深链接跳转
  handleDeepLink() {
    const query = this.globalData.launchQuery;
    if (!query) return;
    
    // 清除启动参数，避免重复跳转
    this.globalData.launchQuery = null;
    
    // 根据参数跳转到对应页面
    if (query.taskId) {
      // 跳转到任务详情页
      wx.navigateTo({
        url: `/pages/task-detail/task-detail?id=${query.taskId}`,
        fail: (err) => {
          console.error('Deep link navigation failed:', err);
          // 跳转失败则跳转到首页
          wx.switchTab({
            url: '/pages/index/index'
          });
        }
      });
    } else if (query.page) {
      // 其他页面跳转
      wx.navigateTo({
        url: query.page,
        fail: (err) => {
          console.error('Deep link navigation failed:', err);
          wx.switchTab({
            url: '/pages/index/index'
          });
        }
      });
    }
  },

  // 初始化分享功能
  initShareFeatures() {
    // 分享功能延迟初始化，不影响首屏加载
    console.log('初始化分享功能');
    
    // 可以在这里预设分享配置、统计等非关键功能
    this.globalData.shareConfig = {
      title: '公考督学助手',
      path: '/pages/index/index'
    };
  },

  // 初始化统计功能
  initAnalytics() {
    // 统计功能延迟初始化
    console.log('初始化统计功能');
    
    // 可以在这里初始化第三方统计SDK、埋点系统等
    this.globalData.analyticsEnabled = true;
  },

  // 全局数据
  globalData: {
    userInfo: null,
    token: null,
    isLogin: false,
    isTeacher: false,
    systemInfo: null,
    // 深链接参数
    launchQuery: null,
    launchScene: null,
    // API基础地址
    // baseUrl: 'http://120.77.57.53:8000/api/v1',  // 开发环境
    baseUrl: 'http://192.168.1.139:8000/api/v1',
    // baseUrl: 'https://api.zhuzhen.com/api/v1',  // 生产环境
  }
})