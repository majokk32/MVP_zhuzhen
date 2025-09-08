// utils/performance-helper.js
/**
 * 性能监控辅助工具
 * 提供便捷的性能监控集成方法
 */

const performanceMonitor = require('./performance-monitor');

class PerformanceHelper {
  constructor() {
    this.performanceMonitor = performanceMonitor;
    this.pageTimers = new Map();
    this.interactionTimers = new Map();
  }

  /**
   * 页面性能监控装饰器
   */
  wrapPageWithPerformanceMonitoring(pageConfig) {
    const wrappedConfig = { ...pageConfig };
    
    // 包装 onLoad - 页面加载性能监控
    const originalOnLoad = wrappedConfig.onLoad;
    wrappedConfig.onLoad = function(options) {
      const loadStartTime = Date.now();
      const pageRoute = this.route;
      
      // 开始页面性能监控
      const pageMonitor = performanceMonitor.startPagePerformanceMonitoring(pageRoute);
      this._pagePerformanceMonitor = pageMonitor;
      
      // 记录首屏渲染时间
      wx.nextTick(() => {
        performanceMonitor.recordFirstPaintTime(loadStartTime, pageRoute);
      });

      if (originalOnLoad) {
        const result = originalOnLoad.call(this, options);
        
        // 记录onLoad执行时间
        const onLoadTime = Date.now() - loadStartTime;
        performanceMonitor.recordInteractionDelay(pageRoute, 'onLoad', onLoadTime);
        
        return result;
      }
    };

    // 包装 onReady - 页面渲染完成
    const originalOnReady = wrappedConfig.onReady;
    wrappedConfig.onReady = function() {
      const pageRoute = this.route;
      
      if (originalOnReady) {
        const readyStartTime = Date.now();
        const result = originalOnReady.call(this);
        const readyTime = Date.now() - readyStartTime;
        
        performanceMonitor.recordInteractionDelay(pageRoute, 'onReady', readyTime);
        return result;
      }
    };

    // 包装 onHide - 结束页面性能监控
    const originalOnHide = wrappedConfig.onHide;
    wrappedConfig.onHide = function() {
      if (this._pagePerformanceMonitor) {
        this._pagePerformanceMonitor.endPageMonitoring({
          hideType: 'user_action'
        });
      }

      if (originalOnHide) {
        return originalOnHide.call(this);
      }
    };

    // 包装 onUnload - 结束页面性能监控
    const originalOnUnload = wrappedConfig.onUnload;
    wrappedConfig.onUnload = function() {
      if (this._pagePerformanceMonitor) {
        this._pagePerformanceMonitor.endPageMonitoring({
          unloadType: 'page_close'
        });
      }

      if (originalOnUnload) {
        return originalOnUnload.call(this);
      }
    };

    // 包装其他方法 - 用户交互性能监控
    Object.keys(wrappedConfig).forEach(key => {
      if (typeof wrappedConfig[key] === 'function' && 
          !['onLoad', 'onReady', 'onShow', 'onHide', 'onUnload', 'onShareAppMessage', 'onShareTimeline'].includes(key)) {
        
        const originalMethod = wrappedConfig[key];
        wrappedConfig[key] = function(...args) {
          const startTime = Date.now();
          const result = originalMethod.apply(this, args);
          const executionTime = Date.now() - startTime;
          
          // 记录用户交互延迟
          performanceMonitor.recordInteractionDelay(this.route, key, executionTime);
          
          return result;
        };
      }
    });

    return wrappedConfig;
  }

  /**
   * 组件性能监控装饰器
   */
  wrapComponentWithPerformanceMonitoring(componentConfig) {
    const wrappedConfig = { ...componentConfig };

    // 包装组件生命周期
    if (wrappedConfig.lifetimes) {
      Object.keys(wrappedConfig.lifetimes).forEach(lifecycleKey => {
        const originalLifecycle = wrappedConfig.lifetimes[lifecycleKey];
        wrappedConfig.lifetimes[lifecycleKey] = function(...args) {
          const startTime = Date.now();
          const result = originalLifecycle.apply(this, args);
          const executionTime = Date.now() - startTime;
          
          // 记录组件生命周期执行时间
          const componentName = this.is || 'unknown_component';
          performanceMonitor.recordInteractionDelay(`component_${componentName}`, lifecycleKey, executionTime);
          
          return result;
        };
      });
    }

    // 包装组件方法
    if (wrappedConfig.methods) {
      Object.keys(wrappedConfig.methods).forEach(methodKey => {
        const originalMethod = wrappedConfig.methods[methodKey];
        wrappedConfig.methods[methodKey] = function(...args) {
          const startTime = Date.now();
          const result = originalMethod.apply(this, args);
          const executionTime = Date.now() - startTime;
          
          // 记录组件方法执行时间
          const componentName = this.is || 'unknown_component';
          if (executionTime > 50) { // 只记录超过50ms的方法调用
            performanceMonitor.recordInteractionDelay(`component_${componentName}`, methodKey, executionTime);
          }
          
          return result;
        };
      });
    }

    return wrappedConfig;
  }

  /**
   * 异步操作性能监控
   */
  async measureAsyncOperation(operationName, operation, context = {}) {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      // 记录异步操作性能
      performanceMonitor.recordInteractionDelay(
        context.pageRoute || this.getCurrentPageRoute(), 
        operationName, 
        duration
      );
      
      return { success: true, data: result, duration };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 记录失败的异步操作
      performanceMonitor.recordInteractionDelay(
        context.pageRoute || this.getCurrentPageRoute(), 
        `${operationName}_error`, 
        duration
      );
      
      return { success: false, error, duration };
    }
  }

  /**
   * 资源加载性能监控
   */
  measureResourceLoading(resourceType, resourceUrl, loadOperation) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      loadOperation(
        // 成功回调
        (result) => {
          const loadTime = Date.now() - startTime;
          const size = result?.size || 0;
          
          performanceMonitor.recordResourceMetric(resourceType, resourceUrl, loadTime, size, true);
          resolve({ result, loadTime, size });
        },
        // 失败回调
        (error) => {
          const loadTime = Date.now() - startTime;
          
          performanceMonitor.recordResourceMetric(resourceType, resourceUrl, loadTime, 0, false);
          reject({ error, loadTime });
        }
      );
    });
  }

  /**
   * 图片加载性能监控
   */
  measureImageLoading(imageSrc, imageElement = null) {
    return this.measureResourceLoading('image', imageSrc, (onSuccess, onError) => {
      if (imageElement) {
        // 如果提供了image元素，直接监听其事件
        imageElement.onload = () => onSuccess({ src: imageSrc });
        imageElement.onerror = (error) => onError(error);
        imageElement.src = imageSrc;
      } else {
        // 使用wx.getImageInfo
        wx.getImageInfo({
          src: imageSrc,
          success: (info) => onSuccess(info),
          fail: (error) => onError(error)
        });
      }
    });
  }

  /**
   * 网络请求性能监控包装器
   */
  wrapNetworkRequest(requestFunction, requestName = 'network_request') {
    return async (...args) => {
      const startTime = Date.now();
      
      try {
        const result = await requestFunction(...args);
        const responseTime = Date.now() - startTime;
        
        // 这里的具体实现会被app.js中的API监控覆盖
        // 但可以作为额外的业务层监控
        console.log(`${requestName} 完成: ${responseTime}ms`);
        
        return result;
        
      } catch (error) {
        const responseTime = Date.now() - startTime;
        console.warn(`${requestName} 失败: ${responseTime}ms`, error);
        throw error;
      }
    };
  }

  /**
   * 长任务监控
   */
  measureLongTask(taskName, taskFunction, warningThreshold = 100) {
    return async (...args) => {
      const startTime = Date.now();
      
      try {
        const result = await taskFunction(...args);
        const duration = Date.now() - startTime;
        
        // 记录长任务执行时间
        if (duration > warningThreshold) {
          console.warn(`长任务警告: ${taskName} 执行了 ${duration}ms`);
          
          performanceMonitor.recordInteractionDelay(
            this.getCurrentPageRoute(),
            `long_task_${taskName}`,
            duration
          );
        }
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`长任务失败: ${taskName} (${duration}ms)`, error);
        throw error;
      }
    };
  }

  /**
   * 滚动性能监控
   */
  monitorScrollPerformance(scrollElement, scrollContainerName = 'scroll_container') {
    let scrollStartTime = Date.now();
    let frameCount = 0;
    let isScrolling = false;
    
    const onScrollStart = () => {
      if (!isScrolling) {
        scrollStartTime = Date.now();
        frameCount = 0;
        isScrolling = true;
      }
    };
    
    const onScrollEnd = () => {
      if (isScrolling) {
        const scrollDuration = Date.now() - scrollStartTime;
        const fps = frameCount / (scrollDuration / 1000);
        
        // 记录滚动性能
        performanceMonitor.recordInteractionDelay(
          this.getCurrentPageRoute(),
          `scroll_${scrollContainerName}`,
          scrollDuration
        );
        
        // 检查滚动性能问题
        if (fps < 30) {
          console.warn(`滚动性能问题: ${scrollContainerName} FPS=${fps.toFixed(1)}`);
        }
        
        isScrolling = false;
      }
    };
    
    const onScroll = () => {
      onScrollStart();
      frameCount++;
      
      // 使用防抖来检测滚动结束
      clearTimeout(this._scrollEndTimer);
      this._scrollEndTimer = setTimeout(onScrollEnd, 100);
    };
    
    return {
      startMonitoring: () => {
        if (scrollElement && scrollElement.addEventListener) {
          scrollElement.addEventListener('scroll', onScroll);
        }
      },
      
      stopMonitoring: () => {
        if (scrollElement && scrollElement.removeEventListener) {
          scrollElement.removeEventListener('scroll', onScroll);
        }
        clearTimeout(this._scrollEndTimer);
      }
    };
  }

  /**
   * 表单性能监控
   */
  measureFormPerformance(formName, formElement) {
    const formStartTime = Date.now();
    let inputStartTime = null;
    
    const onInputStart = () => {
      inputStartTime = Date.now();
    };
    
    const onInputEnd = () => {
      if (inputStartTime) {
        const inputDuration = Date.now() - inputStartTime;
        if (inputDuration > 200) { // 输入响应超过200ms才记录
          performanceMonitor.recordInteractionDelay(
            this.getCurrentPageRoute(),
            `form_input_${formName}`,
            inputDuration
          );
        }
        inputStartTime = null;
      }
    };
    
    const onFormSubmit = () => {
      const formDuration = Date.now() - formStartTime;
      performanceMonitor.recordInteractionDelay(
        this.getCurrentPageRoute(),
        `form_complete_${formName}`,
        formDuration
      );
    };
    
    return {
      onInputStart,
      onInputEnd,
      onFormSubmit
    };
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport() {
    return performanceMonitor.generatePerformanceReport();
  }

  /**
   * 获取页面性能分析
   */
  analyzePagePerformance(pageRoute) {
    return performanceMonitor.analyzePagePerformance(pageRoute);
  }

  /**
   * 获取API性能分析
   */
  analyzeApiPerformance() {
    return performanceMonitor.analyzeApiPerformance();
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats() {
    return performanceMonitor.getPerformanceStats();
  }

  /**
   * 立即上报性能指标
   */
  async reportPerformanceMetrics() {
    return performanceMonitor.reportPerformanceMetrics();
  }

  /**
   * 获取当前页面路由
   */
  getCurrentPageRoute() {
    try {
      const pages = getCurrentPages();
      return pages[pages.length - 1]?.route || 'unknown';
    } catch (error) {
      return 'error_getting_route';
    }
  }

  /**
   * 性能优化建议
   */
  getOptimizationSuggestions() {
    const report = this.getPerformanceReport();
    if (!report) return [];
    
    return report.recommendations || [];
  }

  /**
   * 批量页面性能监控
   */
  enableBatchPageMonitoring(pageConfigs) {
    const wrappedConfigs = {};
    
    Object.keys(pageConfigs).forEach(pageName => {
      wrappedConfigs[pageName] = this.wrapPageWithPerformanceMonitoring(pageConfigs[pageName]);
    });
    
    return wrappedConfigs;
  }

  /**
   * 性能预警
   */
  setupPerformanceAlerts(thresholds = {}) {
    const defaultThresholds = {
      pageLoadTime: 3000,
      apiResponseTime: 2000,
      interactionDelay: 500,
      memoryUsage: 150
    };
    
    const finalThresholds = { ...defaultThresholds, ...thresholds };
    
    // 这里可以实现性能预警逻辑
    console.log('性能预警已设置:', finalThresholds);
  }
}

// 创建全局实例
const performanceHelper = new PerformanceHelper();

// 导出便捷方法
module.exports = {
  performanceHelper,
  performanceMonitor,
  
  // 装饰器
  wrapPageWithPerformance: performanceHelper.wrapPageWithPerformanceMonitoring.bind(performanceHelper),
  wrapComponentWithPerformance: performanceHelper.wrapComponentWithPerformanceMonitoring.bind(performanceHelper),
  
  // 监控方法
  measureAsyncOperation: performanceHelper.measureAsyncOperation.bind(performanceHelper),
  measureResourceLoading: performanceHelper.measureResourceLoading.bind(performanceHelper),
  measureImageLoading: performanceHelper.measureImageLoading.bind(performanceHelper),
  measureLongTask: performanceHelper.measureLongTask.bind(performanceHelper),
  
  // 分析方法
  getPerformanceReport: performanceHelper.getPerformanceReport.bind(performanceHelper),
  analyzePagePerformance: performanceHelper.analyzePagePerformance.bind(performanceHelper),
  analyzeApiPerformance: performanceHelper.analyzeApiPerformance.bind(performanceHelper),
  getOptimizationSuggestions: performanceHelper.getOptimizationSuggestions.bind(performanceHelper),
  
  // 工具方法
  reportPerformanceMetrics: performanceHelper.reportPerformanceMetrics.bind(performanceHelper),
  setupPerformanceAlerts: performanceHelper.setupPerformanceAlerts.bind(performanceHelper)
};