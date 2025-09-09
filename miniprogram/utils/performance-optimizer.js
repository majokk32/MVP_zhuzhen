/**
 * 性能优化工具模块 - Phase 2 首屏加载优化
 * 
 * 特性:
 * - 关键路径优化
 * - 模块懒加载
 * - 资源预加载
 * - 启动性能监控
 * - 运行时优化
 */

class PerformanceOptimizer {
  constructor() {
    // 性能数据收集
    this.performanceData = {
      startTime: Date.now(),
      appLaunchTime: null,
      pageLoadTime: null,
      firstRenderTime: null,
      apiCallTimes: {},
      moduleLoadTimes: {},
      resourceLoadTimes: {}
    };
    
    // 懒加载模块缓存
    this.lazyModuleCache = new Map();
    
    // 预加载队列
    this.preloadQueue = [];
    
    // 性能配置
    this.config = {
      enableLazyLoad: true,
      enablePreload: true,
      enableMonitoring: true,
      criticalResourceTimeout: 5000,
      lazyLoadDelay: 100,
      preloadDelay: 500
    };
    
    this.init();
  }

  /**
   * 初始化性能优化器
   */
  init() {
    this.setupPerformanceMonitoring();
    this.setupLazyLoading();
    this.setupPreloading();
  }

  /**
   * 设置性能监控
   */
  setupPerformanceMonitoring() {
    if (!this.config.enableMonitoring) return;

    // 监控页面性能
    this.monitorPagePerformance();
    
    // 监控API调用性能
    this.monitorAPIPerformance();
    
    // 监控内存使用
    this.monitorMemoryUsage();
  }

  /**
   * 监控页面性能
   */
  monitorPagePerformance() {
    const originalPage = Page;
    const self = this;
    
    Page = function(pageConfig) {
      const originalOnLoad = pageConfig.onLoad;
      const originalOnReady = pageConfig.onReady;
      const originalOnShow = pageConfig.onShow;
      
      // 监控页面加载时间
      pageConfig.onLoad = function(options) {
        const pageStartTime = Date.now();
        this._performanceStartTime = pageStartTime;
        
        // 执行原始onLoad
        if (originalOnLoad) {
          const result = originalOnLoad.call(this, options);
          
          // 如果是Promise，等待完成
          if (result instanceof Promise) {
            result.finally(() => {
              self.recordPageLoadTime(this.route, Date.now() - pageStartTime);
            });
          } else {
            self.recordPageLoadTime(this.route, Date.now() - pageStartTime);
          }
          
          return result;
        }
        
        self.recordPageLoadTime(this.route, Date.now() - pageStartTime);
      };
      
      // 监控首屏渲染时间
      pageConfig.onReady = function() {
        if (this._performanceStartTime) {
          const renderTime = Date.now() - this._performanceStartTime;
          self.recordFirstRenderTime(this.route, renderTime);
        }
        
        if (originalOnReady) {
          originalOnReady.call(this);
        }
      };
      
      // 监控页面显示时间
      pageConfig.onShow = function() {
        const showTime = Date.now();
        this._performanceShowTime = showTime;
        
        if (originalOnShow) {
          originalOnShow.call(this);
        }
      };
      
      return originalPage(pageConfig);
    };
  }

  /**
   * 监控API性能
   */
  monitorAPIPerformance() {
    const originalRequest = wx.request;
    const self = this;
    
    wx.request = function(options) {
      const startTime = Date.now();
      const url = options.url;
      
      const originalSuccess = options.success;
      const originalFail = options.fail;
      const originalComplete = options.complete;
      
      options.success = function(res) {
        const duration = Date.now() - startTime;
        self.recordAPICallTime(url, duration, 'success');
        
        if (originalSuccess) {
          originalSuccess(res);
        }
      };
      
      options.fail = function(err) {
        const duration = Date.now() - startTime;
        self.recordAPICallTime(url, duration, 'fail');
        
        if (originalFail) {
          originalFail(err);
        }
      };
      
      return originalRequest(options);
    };
  }

  /**
   * 监控内存使用
   */
  monitorMemoryUsage() {
    // 定期检查内存使用情况
    setInterval(() => {
      try {
        const performance = wx.getPerformance && wx.getPerformance();
        if (performance && performance.memory) {
          const memoryInfo = {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            timestamp: Date.now()
          };
          
          this.recordMemoryUsage(memoryInfo);
        }
      } catch (error) {
        console.warn('内存监控失败:', error);
      }
    }, 30000); // 每30秒检查一次
  }

  /**
   * 设置懒加载
   */
  setupLazyLoading() {
    if (!this.config.enableLazyLoad) return;
    
    // 包装require函数实现懒加载
    this.originalRequire = global.require || require;
  }

  /**
   * 路径解析器 - 从utils/目录解析到正确的模块路径
   */
  resolveFromUtils(path) {
    if (!path) return path;
    // 已经是相对路径
    if (path.startsWith('./') || path.startsWith('../')) return path;
    // 从 app.js 传入的是 'modules/xxx/xxx.js'
    if (path.startsWith('modules/')) return `../${path}`;
    // 防止有人传了 '/modules/...'
    if (path.startsWith('/modules/')) return `..${path}`;
    return path; // 其他情况原样
  }

  /**
   * 安全require - 模块不存在时返回空对象
   */
  safeRequire(path) {
    const resolvedPath = this.resolveFromUtils(path);
    try {
      return require(resolvedPath);
    } catch (e) {
      console.warn('safeRequire fail:', path, '->', resolvedPath, e);
      return {};
    }
  }

  /**
   * 懒加载模块
   * @param {string} modulePath - 模块路径
   * @param {boolean} critical - 是否为关键模块
   * @returns {Promise} 模块
   */
  async lazyLoadModule(modulePath, critical = false) {
    try {
      // 检查缓存
      if (this.lazyModuleCache.has(modulePath)) {
        return this.lazyModuleCache.get(modulePath);
      }
      
      const startTime = Date.now();
      
      // 如果不是关键模块，添加延迟
      if (!critical && this.config.lazyLoadDelay > 0) {
        await this.delay(this.config.lazyLoadDelay);
      }
      
      // 安全加载模块
      const module = this.safeRequire(modulePath);
      
      // 记录加载时间
      const loadTime = Date.now() - startTime;
      this.recordModuleLoadTime(modulePath, loadTime);
      
      // 缓存模块
      this.lazyModuleCache.set(modulePath, module);
      
      return module;
      
    } catch (error) {
      console.warn('懒加载模块失败，返回空对象:', modulePath, error);
      // 返回空对象作为占位，防止阻塞UI
      const placeholderModule = {};
      this.lazyModuleCache.set(modulePath, placeholderModule);
      return placeholderModule;
    }
  }

  /**
   * 设置预加载
   */
  setupPreloading() {
    if (!this.config.enablePreload) return;
    
    // 延迟启动预加载，避免影响首屏
    setTimeout(() => {
      this.startPreloading();
    }, this.config.preloadDelay);
  }

  /**
   * 开始预加载
   */
  async startPreloading() {
    for (const task of this.preloadQueue) {
      try {
        await this.executePreloadTask(task);
      } catch (error) {
        console.warn('预加载任务失败:', task, error);
      }
    }
  }

  /**
   * 添加预加载任务
   * @param {Object} task - 预加载任务
   */
  addPreloadTask(task) {
    this.preloadQueue.push({
      id: this.generateTaskId(),
      ...task,
      addTime: Date.now()
    });
  }

  /**
   * 执行预加载任务
   * @param {Object} task - 预加载任务
   */
  async executePreloadTask(task) {
    const startTime = Date.now();
    
    try {
      switch (task.type) {
        case 'module':
          await this.preloadModule(task.path);
          break;
        case 'image':
          await this.preloadImage(task.url);
          break;
        case 'data':
          await this.preloadData(task.api);
          break;
        default:
          console.warn('未知的预加载任务类型:', task.type);
      }
      
      const duration = Date.now() - startTime;
      console.log(`预加载任务完成: ${task.type} ${task.path || task.url || task.api} (${duration}ms)`);
      
    } catch (error) {
      console.error('预加载任务执行失败:', task, error);
    }
  }

  /**
   * 预加载模块
   * @param {string} modulePath - 模块路径
   */
  async preloadModule(modulePath) {
    if (!this.lazyModuleCache.has(modulePath)) {
      await this.lazyLoadModule(modulePath);
    }
  }

  /**
   * 预加载图片
   * @param {string} imageUrl - 图片URL
   */
  async preloadImage(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
      return Promise.resolve();
    }

    // 1) 阻止SVG预加载（小程序不支持）
    if (/\.svg(\?.*)?$/i.test(imageUrl)) {
      console.warn('跳过SVG预加载（小程序不支持）:', imageUrl);
      return Promise.resolve();
    }

    // 2) 远程HTTPS URL → downloadFile
    if (/^https?:\/\//i.test(imageUrl)) {
      return new Promise((resolve) => {
        wx.downloadFile({
          url: imageUrl,
          success: (res) => {
            if (res.statusCode === 200) {
              // 可选：对临时文件使用 getImageInfo 预热缓存
              wx.getImageInfo({
                src: res.tempFilePath,
                success: () => resolve(res.tempFilePath),
                fail: (e) => {
                  console.warn('getImageInfo在下载后失败', e);
                  resolve(res.tempFilePath);
                }
              });
            } else {
              console.warn('downloadFile非200状态码:', res.statusCode, imageUrl);
              resolve(); // 预加载失败不应阻塞应用
            }
          },
          fail: (err) => {
            console.warn('downloadFile失败:', imageUrl, err);
            resolve(); // 预加载失败不应阻塞应用
          }
        });
      });
    }

    // 3) 本地项目资源（相对路径或以/开头） → getImageInfo
    const localSrc = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
    return new Promise((resolve) => {
      wx.getImageInfo({
        src: localSrc,
        success: () => resolve(localSrc),
        fail: (e) => {
          console.warn('getImageInfo（本地）失败:', localSrc, e);
          resolve(); // 预加载失败不应阻塞应用
        }
      });
    });
  }

  /**
   * 预加载数据
   * @param {Object} apiConfig - API配置
   */
  async preloadData(apiConfig) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: apiConfig.url,
        method: apiConfig.method || 'GET',
        data: apiConfig.data || {},
        header: apiConfig.header || {},
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error(`数据预加载失败: ${res.statusCode}`));
          }
        },
        fail: reject
      });
    });
  }

  /**
   * 关键路径优化
   * @param {Array} criticalTasks - 关键任务列表
   */
  async optimizeCriticalPath(criticalTasks) {
    const startTime = Date.now();
    const results = [];
    
    try {
      // 并行执行关键任务
      const promises = criticalTasks.map(async (task) => {
        const taskStartTime = Date.now();
        
        try {
          const result = await this.executeCriticalTask(task);
          return {
            task,
            result,
            duration: Date.now() - taskStartTime,
            success: true
          };
        } catch (error) {
          return {
            task,
            error,
            duration: Date.now() - taskStartTime,
            success: false
          };
        }
      });
      
      // 等待所有关键任务完成，但设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('关键路径执行超时')), this.config.criticalResourceTimeout);
      });
      
      const raceResult = await Promise.race([
        Promise.allSettled(promises),
        timeoutPromise
      ]);
      
      results.push(...raceResult);
      
      const totalDuration = Date.now() - startTime;
      this.recordCriticalPathTime(totalDuration);
      
      console.log('关键路径优化完成:', {
        totalDuration,
        taskCount: criticalTasks.length,
        successCount: results.filter(r => r.success).length
      });
      
      return results;
      
    } catch (error) {
      console.error('关键路径优化失败:', error);
      throw error;
    }
  }

  /**
   * 执行关键任务
   * @param {Object} task - 关键任务
   */
  async executeCriticalTask(task) {
    switch (task.type) {
      case 'auth':
        return await this.executeCriticalAuth(task);
      case 'userInfo':
        return await this.executeCriticalUserInfo(task);
      case 'taskList':
        return await this.executeCriticalTaskList(task);
      default:
        throw new Error(`未知的关键任务类型: ${task.type}`);
    }
  }

  /**
   * 执行关键认证任务
   */
  async executeCriticalAuth(task) {
    const auth = await this.lazyLoadModule('/modules/auth/auth.js', true);
    return auth.checkLogin();
  }

  /**
   * 执行关键用户信息任务
   */
  async executeCriticalUserInfo(task) {
    const auth = await this.lazyLoadModule('/modules/auth/auth.js', true);
    return auth.getUserInfo();
  }

  /**
   * 执行关键任务列表任务
   */
  async executeCriticalTaskList(task) {
    const taskModule = await this.lazyLoadModule('/modules/task/task.js', true);
    return taskModule.getTaskList({ page: 1, page_size: 10 });
  }

  // ==================== 数据记录方法 ====================

  recordPageLoadTime(route, duration) {
    if (!this.performanceData.pageLoadTime) {
      this.performanceData.pageLoadTime = {};
    }
    this.performanceData.pageLoadTime[route] = duration;
    console.log(`页面加载时间: ${route} - ${duration}ms`);
  }

  recordFirstRenderTime(route, duration) {
    if (!this.performanceData.firstRenderTime) {
      this.performanceData.firstRenderTime = {};
    }
    this.performanceData.firstRenderTime[route] = duration;
    console.log(`首屏渲染时间: ${route} - ${duration}ms`);
  }

  recordAPICallTime(url, duration, status) {
    if (!this.performanceData.apiCallTimes[url]) {
      this.performanceData.apiCallTimes[url] = [];
    }
    this.performanceData.apiCallTimes[url].push({ duration, status, timestamp: Date.now() });
  }

  recordModuleLoadTime(modulePath, duration) {
    this.performanceData.moduleLoadTimes[modulePath] = duration;
    console.log(`模块加载时间: ${modulePath} - ${duration}ms`);
  }

  recordCriticalPathTime(duration) {
    this.performanceData.criticalPathTime = duration;
    console.log(`关键路径执行时间: ${duration}ms`);
  }

  recordMemoryUsage(memoryInfo) {
    if (!this.performanceData.memoryUsage) {
      this.performanceData.memoryUsage = [];
    }
    this.performanceData.memoryUsage.push(memoryInfo);
  }

  // ==================== 工具方法 ====================

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport() {
    const currentTime = Date.now();
    const totalTime = currentTime - this.performanceData.startTime;
    
    return {
      totalRunTime: totalTime,
      appLaunchTime: this.performanceData.appLaunchTime,
      pageLoadTimes: this.performanceData.pageLoadTime,
      firstRenderTimes: this.performanceData.firstRenderTime,
      criticalPathTime: this.performanceData.criticalPathTime,
      apiCallStats: this.calculateAPIStats(),
      moduleLoadStats: this.calculateModuleStats(),
      memoryStats: this.calculateMemoryStats(),
      cacheHitRate: this.calculateCacheHitRate(),
      recommendations: this.generateRecommendations()
    };
  }

  calculateAPIStats() {
    const stats = {};
    for (const [url, calls] of Object.entries(this.performanceData.apiCallTimes)) {
      const durations = calls.map(call => call.duration);
      const successCalls = calls.filter(call => call.status === 'success');
      
      stats[url] = {
        callCount: calls.length,
        averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        successRate: (successCalls.length / calls.length * 100).toFixed(1)
      };
    }
    return stats;
  }

  calculateModuleStats() {
    const loadTimes = Object.values(this.performanceData.moduleLoadTimes);
    if (loadTimes.length === 0) return null;
    
    return {
      moduleCount: loadTimes.length,
      averageLoadTime: loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length,
      minLoadTime: Math.min(...loadTimes),
      maxLoadTime: Math.max(...loadTimes),
      totalLoadTime: loadTimes.reduce((a, b) => a + b, 0)
    };
  }

  calculateMemoryStats() {
    const memoryUsage = this.performanceData.memoryUsage;
    if (!memoryUsage || memoryUsage.length === 0) return null;
    
    const latest = memoryUsage[memoryUsage.length - 1];
    const first = memoryUsage[0];
    
    return {
      currentUsage: latest.usedJSHeapSize,
      currentTotal: latest.totalJSHeapSize,
      initialUsage: first.usedJSHeapSize,
      growthRate: ((latest.usedJSHeapSize - first.usedJSHeapSize) / first.usedJSHeapSize * 100).toFixed(1),
      samples: memoryUsage.length
    };
  }

  calculateCacheHitRate() {
    const totalRequests = this.lazyModuleCache.size + this.preloadQueue.length;
    const hits = this.lazyModuleCache.size;
    
    return totalRequests > 0 ? (hits / totalRequests * 100).toFixed(1) : 0;
  }

  generateRecommendations() {
    const recommendations = [];
    const report = this.getPerformanceReport();
    
    // 首屏加载时间建议
    const indexLoadTime = report.firstRenderTimes && report.firstRenderTimes['pages/index/index'];
    if (indexLoadTime && indexLoadTime > 2000) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: `首屏加载时间${indexLoadTime}ms超过2秒，建议优化关键路径`
      });
    }
    
    // API性能建议
    if (report.apiCallStats) {
      for (const [url, stats] of Object.entries(report.apiCallStats)) {
        if (stats.averageDuration > 3000) {
          recommendations.push({
            type: 'api',
            priority: 'medium',
            message: `API ${url} 平均响应时间过长: ${stats.averageDuration}ms`
          });
        }
      }
    }
    
    // 内存使用建议
    if (report.memoryStats && parseFloat(report.memoryStats.growthRate) > 50) {
      recommendations.push({
        type: 'memory',
        priority: 'medium',
        message: `内存增长率${report.memoryStats.growthRate}%过高，建议检查内存泄漏`
      });
    }
    
    return recommendations;
  }
}

// 创建全局实例
const performanceOptimizer = new PerformanceOptimizer();

module.exports = performanceOptimizer;