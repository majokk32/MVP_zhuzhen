// utils/performance-monitor.js
/**
 * 性能监控指标收集系统
 * 收集、分析和报告关键性能指标
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      // 应用启动性能
      appLaunch: {},
      // 页面性能
      pageMetrics: {},
      // API性能
      apiMetrics: {},
      // 用户交互性能
      interactionMetrics: {},
      // 资源性能
      resourceMetrics: {},
      // 内存性能
      memoryMetrics: {},
      // 网络性能
      networkMetrics: {}
    };
    
    this.performanceThresholds = {
      appLaunchTime: 3000, // 3秒
      pageLoadTime: 2000,  // 2秒
      apiResponseTime: 1000, // 1秒
      userInteractionDelay: 100, // 100毫秒
      memoryUsage: 100, // 100MB
      fpsThreshold: 50 // 50fps
    };

    this.reportUrl = '/api/performance/metrics';
    this.isCollecting = false;
    this.sessionMetrics = [];
    this.isDisabled = true; // 禁用性能监控以减少控制台噪声
    
    if (!this.isDisabled) {
      this.initPerformanceMonitoring();
    }
  }

  /**
   * 初始化性能监控
   */
  initPerformanceMonitoring() {
    try {
      // 监听内存警告
      wx.onMemoryWarning((res) => {
        this.recordMemoryMetric('memory_warning', {
          level: res.level,
          timestamp: Date.now()
        });
      });

      // 监听网络状态变化
      wx.onNetworkStatusChange((res) => {
        this.recordNetworkMetric('network_change', {
          isConnected: res.isConnected,
          networkType: res.networkType,
          timestamp: Date.now()
        });
      });

      // 启动定期性能检查
      this.startPerformanceCollection();
      
      console.log('性能监控系统初始化完成');
    } catch (error) {
      console.error('性能监控初始化失败:', error);
    }
  }

  /**
   * 启动性能数据收集
   */
  startPerformanceCollection() {
    if (this.isDisabled || this.isCollecting) return;
    
    this.isCollecting = true;
    
    // 每5秒收集一次性能指标
    this.performanceInterval = setInterval(() => {
      this.collectRuntimeMetrics();
    }, 5000);

    // 每30秒上报一次性能数据
    this.reportInterval = setInterval(() => {
      this.reportPerformanceMetrics();
    }, 30000);
  }

  /**
   * 停止性能数据收集
   */
  stopPerformanceCollection() {
    this.isCollecting = false;
    
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }
  }

  // ==================== 应用启动性能 ====================

  /**
   * 记录应用启动指标
   */
  recordAppLaunchMetrics(startTime, launchOptions = {}) {
    if (this.isDisabled) return;
    try {
      const launchTime = Date.now() - startTime;
      
      this.metrics.appLaunch = {
        launchTime,
        scene: launchOptions.scene,
        path: launchOptions.path,
        query: launchOptions.query,
        timestamp: Date.now(),
        systemInfo: this.getSystemInfo(),
        performance: this.getSystemPerformanceInfo()
      };

      // 检查性能问题
      if (launchTime > this.performanceThresholds.appLaunchTime) {
        this.reportPerformanceIssue('slow_app_launch', {
          launchTime,
          threshold: this.performanceThresholds.appLaunchTime
        });
      }

      console.log(`应用启动时间: ${launchTime}ms`);
      
      // 记录到会话指标
      this.addSessionMetric('app_launch', {
        duration: launchTime,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('记录应用启动指标失败:', error);
    }
  }

  /**
   * 记录首屏渲染时间
   */
  recordFirstPaintTime(startTime, pageRoute) {
    const firstPaintTime = Date.now() - startTime;
    
    this.addSessionMetric('first_paint', {
      page: pageRoute,
      duration: firstPaintTime,
      timestamp: Date.now()
    });

    if (firstPaintTime > this.performanceThresholds.pageLoadTime) {
      this.reportPerformanceIssue('slow_first_paint', {
        page: pageRoute,
        firstPaintTime,
        threshold: this.performanceThresholds.pageLoadTime
      });
    }
  }

  // ==================== 页面性能 ====================

  /**
   * 开始页面性能监控
   */
  startPagePerformanceMonitoring(pageRoute) {
    const startTime = Date.now();
    
    if (!this.metrics.pageMetrics[pageRoute]) {
      this.metrics.pageMetrics[pageRoute] = {
        loadTimes: [],
        renderTimes: [],
        interactionDelays: [],
        averageLoadTime: 0,
        visits: 0
      };
    }

    return {
      pageRoute,
      startTime,
      endPageMonitoring: (additionalData = {}) => {
        this.endPagePerformanceMonitoring(pageRoute, startTime, additionalData);
      }
    };
  }

  /**
   * 结束页面性能监控
   */
  endPagePerformanceMonitoring(pageRoute, startTime, additionalData = {}) {
    try {
      const loadTime = Date.now() - startTime;
      const pageMetrics = this.metrics.pageMetrics[pageRoute];
      
      pageMetrics.loadTimes.push(loadTime);
      pageMetrics.visits++;
      pageMetrics.averageLoadTime = pageMetrics.loadTimes.reduce((a, b) => a + b, 0) / pageMetrics.loadTimes.length;
      
      // 保持最近50次记录
      if (pageMetrics.loadTimes.length > 50) {
        pageMetrics.loadTimes = pageMetrics.loadTimes.slice(-50);
      }

      // 记录到会话指标
      this.addSessionMetric('page_load', {
        page: pageRoute,
        duration: loadTime,
        ...additionalData,
        timestamp: Date.now()
      });

      // 检查性能问题
      if (loadTime > this.performanceThresholds.pageLoadTime) {
        this.reportPerformanceIssue('slow_page_load', {
          page: pageRoute,
          loadTime,
          threshold: this.performanceThresholds.pageLoadTime,
          ...additionalData
        });
      }

      console.log(`页面 ${pageRoute} 加载时间: ${loadTime}ms`);

    } catch (error) {
      console.error('结束页面性能监控失败:', error);
    }
  }

  /**
   * 记录页面交互延迟
   */
  recordInteractionDelay(pageRoute, interactionType, delay) {
    try {
      if (!this.metrics.pageMetrics[pageRoute]) {
        this.metrics.pageMetrics[pageRoute] = { interactionDelays: [] };
      }

      this.metrics.pageMetrics[pageRoute].interactionDelays.push({
        type: interactionType,
        delay,
        timestamp: Date.now()
      });

      // 记录到会话指标
      this.addSessionMetric('interaction_delay', {
        page: pageRoute,
        type: interactionType,
        delay,
        timestamp: Date.now()
      });

      // 检查交互性能问题
      if (delay > this.performanceThresholds.userInteractionDelay) {
        this.reportPerformanceIssue('slow_interaction', {
          page: pageRoute,
          type: interactionType,
          delay,
          threshold: this.performanceThresholds.userInteractionDelay
        });
      }

    } catch (error) {
      console.error('记录交互延迟失败:', error);
    }
  }

  // ==================== API性能 ====================

  /**
   * 记录API性能指标
   */
  recordApiMetric(apiUrl, method, responseTime, statusCode, dataSize = 0, error = null) {
    if (this.isDisabled) return;
    try {
      const apiKey = `${method.toUpperCase()} ${apiUrl}`;
      
      if (!this.metrics.apiMetrics[apiKey]) {
        this.metrics.apiMetrics[apiKey] = {
          responseTimes: [],
          successCount: 0,
          errorCount: 0,
          averageResponseTime: 0,
          errors: []
        };
      }

      const apiMetrics = this.metrics.apiMetrics[apiKey];
      apiMetrics.responseTimes.push(responseTime);
      
      if (error) {
        apiMetrics.errorCount++;
        apiMetrics.errors.push({
          error: error.message || error,
          timestamp: Date.now(),
          statusCode
        });
      } else {
        apiMetrics.successCount++;
      }

      // 计算平均响应时间
      apiMetrics.averageResponseTime = apiMetrics.responseTimes.reduce((a, b) => a + b, 0) / apiMetrics.responseTimes.length;
      
      // 保持最近100次记录
      if (apiMetrics.responseTimes.length > 100) {
        apiMetrics.responseTimes = apiMetrics.responseTimes.slice(-100);
      }

      // 记录到会话指标
      this.addSessionMetric('api_call', {
        url: apiUrl,
        method,
        responseTime,
        statusCode,
        dataSize,
        success: !error,
        timestamp: Date.now()
      });

      // 检查API性能问题
      if (responseTime > this.performanceThresholds.apiResponseTime) {
        this.reportPerformanceIssue('slow_api_response', {
          api: apiKey,
          responseTime,
          threshold: this.performanceThresholds.apiResponseTime,
          statusCode
        });
      }

      // 检查API错误率
      const totalRequests = apiMetrics.successCount + apiMetrics.errorCount;
      const errorRate = apiMetrics.errorCount / totalRequests;
      if (totalRequests > 10 && errorRate > 0.1) { // 超过10次请求且错误率大于10%
        this.reportPerformanceIssue('high_api_error_rate', {
          api: apiKey,
          errorRate: Math.round(errorRate * 100),
          totalRequests,
          errorCount: apiMetrics.errorCount
        });
      }

    } catch (error) {
      console.error('记录API指标失败:', error);
    }
  }

  // ==================== 资源性能 ====================

  /**
   * 记录资源加载性能
   */
  recordResourceMetric(resourceType, resourceUrl, loadTime, size = 0, success = true) {
    try {
      if (!this.metrics.resourceMetrics[resourceType]) {
        this.metrics.resourceMetrics[resourceType] = {
          loadTimes: [],
          totalSize: 0,
          loadCount: 0,
          failCount: 0
        };
      }

      const resourceMetrics = this.metrics.resourceMetrics[resourceType];
      resourceMetrics.loadTimes.push(loadTime);
      resourceMetrics.totalSize += size;
      
      if (success) {
        resourceMetrics.loadCount++;
      } else {
        resourceMetrics.failCount++;
      }

      // 记录到会话指标
      this.addSessionMetric('resource_load', {
        type: resourceType,
        url: resourceUrl,
        loadTime,
        size,
        success,
        timestamp: Date.now()
      });

      // 检查资源加载性能问题
      if (loadTime > 3000) { // 资源加载超过3秒
        this.reportPerformanceIssue('slow_resource_load', {
          type: resourceType,
          url: resourceUrl,
          loadTime,
          size
        });
      }

    } catch (error) {
      console.error('记录资源指标失败:', error);
    }
  }

  // ==================== 内存性能 ====================

  /**
   * 记录内存指标
   */
  recordMemoryMetric(metricType, data) {
    try {
      if (!this.metrics.memoryMetrics[metricType]) {
        this.metrics.memoryMetrics[metricType] = [];
      }

      this.metrics.memoryMetrics[metricType].push({
        ...data,
        timestamp: Date.now()
      });

      // 记录到会话指标
      this.addSessionMetric('memory_metric', {
        type: metricType,
        ...data,
        timestamp: Date.now()
      });

      // 保持最近100条记录
      if (this.metrics.memoryMetrics[metricType].length > 100) {
        this.metrics.memoryMetrics[metricType] = this.metrics.memoryMetrics[metricType].slice(-100);
      }

    } catch (error) {
      console.error('记录内存指标失败:', error);
    }
  }

  // ==================== 网络性能 ====================

  /**
   * 记录网络指标
   */
  recordNetworkMetric(metricType, data) {
    try {
      if (!this.metrics.networkMetrics[metricType]) {
        this.metrics.networkMetrics[metricType] = [];
      }

      this.metrics.networkMetrics[metricType].push({
        ...data,
        timestamp: Date.now()
      });

      // 记录到会话指标
      this.addSessionMetric('network_metric', {
        type: metricType,
        ...data,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('记录网络指标失败:', error);
    }
  }

  // ==================== 运行时性能收集 ====================

  /**
   * 收集运行时性能指标
   */
  collectRuntimeMetrics() {
    if (this.isDisabled) return;
    try {
      // 获取系统信息
      const systemInfo = this.getSystemInfo();
      
      // 记录系统性能快照
      this.addSessionMetric('runtime_snapshot', {
        timestamp: Date.now(),
        batteryLevel: systemInfo.batteryLevel || 'unknown',
        memorySize: systemInfo.memorySize || 'unknown',
        performance: this.getSystemPerformanceInfo()
      });

      // 检查页面数量（可能影响内存）
      const pageStack = getCurrentPages();
      if (pageStack.length > 5) {
        this.reportPerformanceIssue('too_many_pages', {
          pageCount: pageStack.length,
          pages: pageStack.map(page => page.route)
        });
      }

    } catch (error) {
      console.error('收集运行时指标失败:', error);
    }
  }

  /**
   * 获取系统信息（兼容新旧API）
   */
  getSystemInfo() {
    try {
      return {
        ...wx.getWindowInfo(),
        ...wx.getDeviceInfo(),
        ...wx.getAppBaseInfo()
      };
    } catch (e) {
      // 降级到老版本API
      return wx.getSystemInfoSync();
    }
  }

  /**
   * 获取系统性能信息
   */
  getSystemPerformanceInfo() {
    try {
      return {
        timestamp: Date.now(),
        platform: this.getSystemInfo().platform,
        pageCount: getCurrentPages().length,
        // 这里可以添加更多性能指标
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // ==================== 性能问题报告 ====================

  /**
   * 报告性能问题
   */
  reportPerformanceIssue(issueType, issueData) {
    try {
      const issue = {
        type: issueType,
        data: issueData,
        timestamp: Date.now(),
        pageRoute: this.getCurrentPageRoute(),
        systemInfo: this.getSystemInfo()
      };

      // 记录到会话指标
      this.addSessionMetric('performance_issue', issue);

      console.warn(`性能问题报告: ${issueType}`, issueData);

      // 立即上报严重性能问题
      if (this.isCriticalPerformanceIssue(issueType)) {
        this.reportImmediately([issue]);
      }

    } catch (error) {
      console.error('报告性能问题失败:', error);
    }
  }

  /**
   * 判断是否为严重性能问题
   */
  isCriticalPerformanceIssue(issueType) {
    const criticalIssues = [
      'slow_app_launch',
      'high_api_error_rate', 
      'memory_warning',
      'too_many_pages'
    ];
    
    return criticalIssues.includes(issueType);
  }

  // ==================== 性能分析 ====================

  /**
   * 分析页面性能
   */
  analyzePagePerformance(pageRoute) {
    try {
      const pageMetrics = this.metrics.pageMetrics[pageRoute];
      if (!pageMetrics || pageMetrics.loadTimes.length === 0) {
        return null;
      }

      const loadTimes = pageMetrics.loadTimes;
      const analysis = {
        page: pageRoute,
        visits: pageMetrics.visits,
        averageLoadTime: pageMetrics.averageLoadTime,
        medianLoadTime: this.calculateMedian(loadTimes),
        p95LoadTime: this.calculatePercentile(loadTimes, 95),
        minLoadTime: Math.min(...loadTimes),
        maxLoadTime: Math.max(...loadTimes),
        performanceGrade: this.calculatePerformanceGrade(pageMetrics.averageLoadTime),
        recommendations: this.generatePerformanceRecommendations(pageRoute, pageMetrics)
      };

      return analysis;

    } catch (error) {
      console.error('分析页面性能失败:', error);
      return null;
    }
  }

  /**
   * 分析API性能
   */
  analyzeApiPerformance() {
    try {
      const analysis = {};
      
      Object.entries(this.metrics.apiMetrics).forEach(([apiKey, metrics]) => {
        const responseTimes = metrics.responseTimes;
        const totalRequests = metrics.successCount + metrics.errorCount;
        const errorRate = totalRequests > 0 ? metrics.errorCount / totalRequests : 0;

        analysis[apiKey] = {
          totalRequests,
          successRate: totalRequests > 0 ? metrics.successCount / totalRequests : 0,
          errorRate,
          averageResponseTime: metrics.averageResponseTime,
          medianResponseTime: this.calculateMedian(responseTimes),
          p95ResponseTime: this.calculatePercentile(responseTimes, 95),
          performanceGrade: this.calculatePerformanceGrade(metrics.averageResponseTime, 'api'),
          recentErrors: metrics.errors.slice(-5) // 最近5个错误
        };
      });

      return analysis;

    } catch (error) {
      console.error('分析API性能失败:', error);
      return {};
    }
  }

  /**
   * 生成性能报告
   */
  generatePerformanceReport() {
    try {
      const report = {
        timestamp: Date.now(),
        sessionMetricsCount: this.sessionMetrics.length,
        
        // 应用性能
        appPerformance: {
          launchTime: this.metrics.appLaunch.launchTime || 0,
          totalSessions: 1, // 简化处理
        },

        // 页面性能分析
        pagePerformance: {},
        
        // API性能分析  
        apiPerformance: this.analyzeApiPerformance(),
        
        // 系统资源使用
        resourceUsage: this.analyzeResourceUsage(),
        
        // 性能问题汇总
        performanceIssues: this.summarizePerformanceIssues(),
        
        // 性能趋势
        performanceTrends: this.calculatePerformanceTrends(),
        
        // 优化建议
        recommendations: this.generateOptimizationRecommendations()
      };

      // 分析所有页面性能
      Object.keys(this.metrics.pageMetrics).forEach(pageRoute => {
        report.pagePerformance[pageRoute] = this.analyzePagePerformance(pageRoute);
      });

      return report;

    } catch (error) {
      console.error('生成性能报告失败:', error);
      return null;
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 添加会话指标
   */
  addSessionMetric(type, data) {
    this.sessionMetrics.push({
      type,
      ...data,
      timestamp: Date.now()
    });

    // 保持最近1000条记录
    if (this.sessionMetrics.length > 1000) {
      this.sessionMetrics = this.sessionMetrics.slice(-1000);
    }
  }

  /**
   * 计算中位数
   */
  calculateMedian(values) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  /**
   * 计算百分位数
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    
    return sorted[Math.max(0, index)];
  }

  /**
   * 计算性能等级
   */
  calculatePerformanceGrade(value, type = 'page') {
    const thresholds = type === 'api' 
      ? { excellent: 300, good: 1000, poor: 3000 }
      : { excellent: 500, good: 2000, poor: 5000 };

    if (value <= thresholds.excellent) return 'A';
    if (value <= thresholds.good) return 'B'; 
    if (value <= thresholds.poor) return 'C';
    return 'D';
  }

  /**
   * 生成性能优化建议
   */
  generatePerformanceRecommendations(pageRoute, metrics) {
    const recommendations = [];
    
    if (metrics.averageLoadTime > 3000) {
      recommendations.push('页面加载时间过长，建议优化关键渲染路径');
    }
    
    if (metrics.interactionDelays?.some(d => d.delay > 200)) {
      recommendations.push('存在交互延迟，建议优化事件处理逻辑');
    }
    
    return recommendations;
  }

  /**
   * 分析资源使用情况
   */
  analyzeResourceUsage() {
    const analysis = {};
    
    Object.entries(this.metrics.resourceMetrics).forEach(([type, metrics]) => {
      analysis[type] = {
        totalLoads: metrics.loadCount,
        failureRate: metrics.loadCount > 0 ? metrics.failCount / (metrics.loadCount + metrics.failCount) : 0,
        averageSize: metrics.loadCount > 0 ? metrics.totalSize / metrics.loadCount : 0,
        totalSize: metrics.totalSize
      };
    });
    
    return analysis;
  }

  /**
   * 汇总性能问题
   */
  summarizePerformanceIssues() {
    const issues = this.sessionMetrics.filter(m => m.type === 'performance_issue');
    const summary = {};
    
    issues.forEach(issue => {
      const type = issue.data?.type;
      if (!summary[type]) {
        summary[type] = { count: 0, examples: [] };
      }
      summary[type].count++;
      if (summary[type].examples.length < 3) {
        summary[type].examples.push(issue.data);
      }
    });
    
    return summary;
  }

  /**
   * 计算性能趋势
   */
  calculatePerformanceTrends() {
    // 简化的趋势分析
    const recent = this.sessionMetrics.slice(-100);
    const pageLoads = recent.filter(m => m.type === 'page_load');
    const apiCalls = recent.filter(m => m.type === 'api_call');
    
    return {
      averagePageLoadTime: pageLoads.length > 0 
        ? pageLoads.reduce((sum, m) => sum + m.duration, 0) / pageLoads.length 
        : 0,
      averageApiResponseTime: apiCalls.length > 0
        ? apiCalls.reduce((sum, m) => sum + m.responseTime, 0) / apiCalls.length
        : 0
    };
  }

  /**
   * 生成优化建议
   */
  generateOptimizationRecommendations() {
    const recommendations = [];
    
    // 检查应用启动时间
    if (this.metrics.appLaunch.launchTime > 3000) {
      recommendations.push({
        type: 'app_startup',
        priority: 'high',
        suggestion: '应用启动时间过长，建议优化启动流程和减少同步操作'
      });
    }
    
    // 检查API性能
    const slowApis = Object.entries(this.metrics.apiMetrics)
      .filter(([_, metrics]) => metrics.averageResponseTime > 1000);
    
    if (slowApis.length > 0) {
      recommendations.push({
        type: 'api_performance',
        priority: 'medium',
        suggestion: `${slowApis.length}个API响应时间过长，建议优化服务端性能或添加缓存`
      });
    }
    
    return recommendations;
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
   * 上报性能指标
   */
  async reportPerformanceMetrics() {
    if (this.isDisabled) return;
    try {
      if (this.sessionMetrics.length === 0) return;

      const report = this.generatePerformanceReport();
      if (!report) return;

      const app = getApp();
      await app.request({
        url: this.reportUrl,
        method: 'POST',
        data: {
          report,
          sessionMetrics: this.sessionMetrics.slice(-100), // 最近100条
          timestamp: Date.now()
        },
        showLoading: false,
        showError: false
      });

      console.log('性能指标上报成功');

    } catch (error) {
      console.error('性能指标上报失败:', error);
    }
  }

  /**
   * 立即上报
   */
  async reportImmediately(data) {
    try {
      const app = getApp();
      await app.request({
        url: this.reportUrl,
        method: 'POST',
        data: {
          immediate: true,
          data,
          timestamp: Date.now()
        },
        showLoading: false,
        showError: false
      });

      console.log('性能问题立即上报成功');

    } catch (error) {
      console.error('性能问题立即上报失败:', error);
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats() {
    return {
      sessionMetricsCount: this.sessionMetrics.length,
      isCollecting: this.isCollecting,
      metrics: this.metrics,
      thresholds: this.performanceThresholds
    };
  }

  /**
   * 重置性能指标
   */
  resetMetrics() {
    this.metrics = {
      appLaunch: {},
      pageMetrics: {},
      apiMetrics: {},
      interactionMetrics: {},
      resourceMetrics: {},
      memoryMetrics: {},
      networkMetrics: {}
    };
    this.sessionMetrics = [];
  }
}

// 创建全局实例
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;