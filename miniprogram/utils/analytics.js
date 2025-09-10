// utils/analytics.js
/**
 * 关键业务埋点系统
 * 监控用户行为和系统性能关键指标
 */

class Analytics {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.eventQueue = [];
    this.maxQueueSize = 50;
    this.reportUrl = '/analytics/events';
    this.isReporting = false;
    this.sessionStartTime = Date.now();
    
    // 用户信息
    this.userId = null;
    this.userRole = null;
    this.deviceInfo = null;
    
    // 初始化设备信息
    this.initDeviceInfo();
    
    // 定期上报队列中的事件
    this.startPeriodicReport();
  }

  /**
   * 初始化设备信息
   */
  initDeviceInfo() {
    try {
      const systemInfo = this.getSystemInfo();
      this.deviceInfo = {
        brand: systemInfo.brand,
        model: systemInfo.model,
        pixelRatio: systemInfo.pixelRatio,
        screenWidth: systemInfo.screenWidth,
        screenHeight: systemInfo.screenHeight,
        windowWidth: systemInfo.windowWidth,
        windowHeight: systemInfo.windowHeight,
        statusBarHeight: systemInfo.statusBarHeight,
        language: systemInfo.language,
        version: systemInfo.version,
        system: systemInfo.system,
        platform: systemInfo.platform,
        fontSizeSetting: systemInfo.fontSizeSetting,
        SDKVersion: systemInfo.SDKVersion
      };
    } catch (error) {
      console.error('获取设备信息失败:', error);
      this.deviceInfo = {};
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
   * 生成会话ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 设置用户信息
   */
  setUser(userId, userRole = null, userInfo = {}) {
    this.userId = userId;
    this.userRole = userRole;
    
    // 记录用户身份设置事件
    this.track('user_identity_set', {
      user_id: userId,
      user_role: userRole,
      user_info: userInfo
    });
  }

  /**
   * 核心跟踪方法
   */
  track(eventName, properties = {}, options = {}) {
    try {
      const event = {
        event_name: eventName,
        properties: {
          ...properties,
          // 通用属性
          user_id: this.userId,
          user_role: this.userRole,
          session_id: this.sessionId,
          timestamp: Date.now(),
          page_route: this.getCurrentPageRoute(),
          // 设备信息
          device_info: this.deviceInfo,
          // 网络信息
          network_type: wx.getStorageSync('network_type') || 'unknown',
          // 应用版本信息
          app_version: this.getAppVersion()
        },
        client_timestamp: Date.now(),
        server_timestamp: null // 由服务器设置
      };

      // 添加到队列
      this.eventQueue.push(event);
      
      // 如果是高优先级事件或队列满了，立即上报
      if (options.immediate || this.eventQueue.length >= this.maxQueueSize) {
        this.reportEvents();
      }

      console.log(`Analytics Event: ${eventName}`, properties);
      
    } catch (error) {
      console.error('埋点记录失败:', error);
    }
  }

  // ==================== 用户认证埋点 ====================

  /**
   * 用户登录埋点
   */
  trackLogin(method = 'wechat', success = true, error = null) {
    this.track('user_login', {
      login_method: method,
      login_success: success,
      error_message: error ? error.message : null,
      login_timestamp: Date.now()
    }, { immediate: true });
  }

  /**
   * 用户登出埋点
   */
  trackLogout(reason = 'user_action') {
    this.track('user_logout', {
      logout_reason: reason,
      session_duration: Date.now() - this.sessionStartTime
    }, { immediate: true });
  }

  /**
   * 用户注册埋点
   */
  trackRegistration(method = 'wechat', userRole = 'student') {
    this.track('user_registration', {
      registration_method: method,
      user_role: userRole,
      registration_timestamp: Date.now()
    }, { immediate: true });
  }

  // ==================== 学习行为埋点 ====================

  /**
   * 任务提交埋点
   */
  trackTaskSubmission(taskId, taskType, submissionData = {}) {
    this.track('task_submission', {
      task_id: taskId,
      task_type: taskType,
      submission_id: submissionData.submissionId,
      word_count: submissionData.wordCount || 0,
      time_spent: submissionData.timeSpent || 0,
      submission_method: submissionData.method || 'manual'
    });
  }

  /**
   * 任务完成埋点
   */
  trackTaskCompletion(taskId, taskType, score = null, feedback = null) {
    this.track('task_completion', {
      task_id: taskId,
      task_type: taskType,
      score: score,
      has_feedback: feedback !== null,
      completion_timestamp: Date.now()
    });
  }

  /**
   * 学习进度埋点
   */
  trackLearningProgress(progressData) {
    this.track('learning_progress', {
      total_tasks: progressData.totalTasks || 0,
      completed_tasks: progressData.completedTasks || 0,
      completion_rate: progressData.completionRate || 0,
      current_streak: progressData.currentStreak || 0,
      best_streak: progressData.bestStreak || 0,
      total_score: progressData.totalScore || 0,
      monthly_score: progressData.monthlyScore || 0
    });
  }

  /**
   * 打卡签到埋点
   */
  trackCheckin(checkinType = 'daily', streakCount = 0) {
    this.track('user_checkin', {
      checkin_type: checkinType,
      streak_count: streakCount,
      checkin_timestamp: Date.now()
    });
  }

  // ==================== 支付订阅埋点 ====================

  /**
   * 支付开始埋点
   */
  trackPaymentStart(paymentData) {
    this.track('payment_start', {
      order_id: paymentData.orderId,
      plan_id: paymentData.planId,
      plan_name: paymentData.planName,
      amount: paymentData.amount,
      currency: paymentData.currency || 'CNY',
      payment_method: paymentData.paymentMethod || 'wechat_pay'
    }, { immediate: true });
  }

  /**
   * 支付成功埋点
   */
  trackPaymentSuccess(paymentData) {
    this.track('payment_success', {
      order_id: paymentData.orderId,
      transaction_id: paymentData.transactionId,
      plan_id: paymentData.planId,
      amount: paymentData.amount,
      payment_duration: paymentData.paymentDuration || 0
    }, { immediate: true });
  }

  /**
   * 支付失败埋点
   */
  trackPaymentFailure(paymentData, error) {
    this.track('payment_failure', {
      order_id: paymentData.orderId,
      plan_id: paymentData.planId,
      amount: paymentData.amount,
      error_code: error.errorCode,
      error_message: error.message,
      failure_reason: this.classifyPaymentFailure(error)
    }, { immediate: true });
  }

  /**
   * 订阅状态变更埋点
   */
  trackSubscriptionChange(changeData) {
    this.track('subscription_change', {
      subscription_id: changeData.subscriptionId,
      old_status: changeData.oldStatus,
      new_status: changeData.newStatus,
      plan_id: changeData.planId,
      change_reason: changeData.reason,
      expires_at: changeData.expiresAt
    }, { immediate: true });
  }

  // ==================== 功能使用埋点 ====================

  /**
   * 功能访问埋点
   */
  trackFeatureAccess(featureName, accessResult = 'success', context = {}) {
    this.track('feature_access', {
      feature_name: featureName,
      access_result: accessResult,
      access_method: context.method || 'direct',
      from_page: context.fromPage,
      user_permission: context.userPermission || 'unknown'
    });
  }

  /**
   * 页面访问埋点
   */
  trackPageView(pagePath, referrer = null, loadTime = null) {
    this.track('page_view', {
      page_path: pagePath,
      referrer: referrer,
      load_time: loadTime,
      view_timestamp: Date.now()
    });
  }

  /**
   * 分享行为埋点
   */
  trackShare(shareData) {
    this.track('content_share', {
      share_type: shareData.shareType,
      share_channel: shareData.channel,
      content_type: shareData.contentType,
      content_id: shareData.contentId,
      share_title: shareData.title,
      custom_title: shareData.customTitle !== shareData.title
    });
  }

  /**
   * 搜索行为埋点
   */
  trackSearch(query, resultCount = 0, searchType = 'general') {
    this.track('search_action', {
      search_query: query,
      search_type: searchType,
      result_count: resultCount,
      query_length: query.length
    });
  }

  // ==================== 错误和性能埋点 ====================

  /**
   * 错误埋点
   */
  trackError(errorData) {
    this.track('error_occurred', {
      error_type: errorData.type,
      error_message: errorData.message,
      error_stack: errorData.stack,
      error_page: errorData.pageRoute,
      error_component: errorData.component,
      error_severity: errorData.severity || 'medium'
    }, { immediate: true });
  }

  /**
   * 性能埋点
   */
  trackPerformance(performanceData) {
    this.track('performance_metrics', {
      metric_type: performanceData.type,
      metric_value: performanceData.value,
      metric_unit: performanceData.unit || 'ms',
      page_route: performanceData.pageRoute,
      operation_name: performanceData.operationName
    });
  }

  /**
   * API调用性能埋点
   */
  trackApiPerformance(apiData) {
    this.track('api_performance', {
      api_url: apiData.url,
      api_method: apiData.method,
      response_time: apiData.responseTime,
      status_code: apiData.statusCode,
      success: apiData.success,
      data_size: apiData.dataSize || 0
    });
  }

  // ==================== 用户行为埋点 ====================

  /**
   * 用户互动埋点
   */
  trackInteraction(interactionType, targetElement, context = {}) {
    this.track('user_interaction', {
      interaction_type: interactionType, // click, scroll, swipe, input
      target_element: targetElement,
      page_route: context.pageRoute || this.getCurrentPageRoute(),
      element_position: context.position,
      interaction_timestamp: Date.now()
    });
  }

  /**
   * 停留时间埋点
   */
  trackTimeSpent(pageRoute, timeSpent) {
    this.track('time_spent', {
      page_route: pageRoute,
      time_spent: timeSpent,
      session_id: this.sessionId
    });
  }

  /**
   * 应用生命周期埋点
   */
  trackAppLifecycle(lifecycleEvent, context = {}) {
    this.track('app_lifecycle', {
      lifecycle_event: lifecycleEvent, // launch, show, hide, error
      context: context
    });
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取当前页面路由
   */
  getCurrentPageRoute() {
    try {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      return currentPage ? currentPage.route : 'unknown';
    } catch (error) {
      return 'error_getting_route';
    }
  }

  /**
   * 获取应用版本
   */
  getAppVersion() {
    try {
      return wx.getAccountInfoSync().miniProgram.version || '1.0.0';
    } catch (error) {
      return '1.0.0';
    }
  }

  /**
   * 分类支付失败原因
   */
  classifyPaymentFailure(error) {
    const errorMsg = error.errMsg || error.message || '';
    
    if (errorMsg.includes('cancel')) {
      return 'user_cancelled';
    } else if (errorMsg.includes('fail')) {
      return 'payment_failed';
    } else if (errorMsg.includes('timeout')) {
      return 'timeout';
    } else {
      return 'unknown_error';
    }
  }

  /**
   * 上报事件到服务器
   */
  async reportEvents() {
    if (this.isReporting || this.eventQueue.length === 0) {
      return;
    }

    let eventsToReport = [];
    try {
      this.isReporting = true;
      
      eventsToReport = [...this.eventQueue];
      this.eventQueue = [];

      const app = getApp();
      await app.request({
        url: this.reportUrl,
        method: 'POST',
        data: {
          events: eventsToReport,
          session_id: this.sessionId,
          batch_timestamp: Date.now()
        },
        showLoading: false,
        showError: false
      });

      console.log(`上报 ${eventsToReport.length} 个埋点事件`);

    } catch (error) {
      // 上报失败，将事件重新加入队列
      this.eventQueue.unshift(...eventsToReport);
      console.error('埋点事件上报失败:', error);
    } finally {
      this.isReporting = false;
    }
  }

  /**
   * 开始定期上报
   */
  startPeriodicReport() {
    setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.reportEvents();
      }
    }, 30000); // 30秒上报一次
  }

  /**
   * 立即上报所有事件
   */
  async flush() {
    await this.reportEvents();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      session_id: this.sessionId,
      user_id: this.userId,
      user_role: this.userRole,
      queue_size: this.eventQueue.length,
      session_duration: Date.now() - this.sessionStartTime
    };
  }

  /**
   * 重置会话
   */
  resetSession() {
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = Date.now();
    this.trackAppLifecycle('session_reset');
  }
}

// 创建全局实例
const analytics = new Analytics();

// 应用生命周期埋点
const app = getApp();
if (app) {
  // 监听应用显示
  const originalOnShow = app.onShow;
  app.onShow = function(options) {
    analytics.trackAppLifecycle('app_show', {
      scene: options.scene,
      path: options.path,
      query: options.query
    });
    
    if (originalOnShow) {
      originalOnShow.call(this, options);
    }
  };

  // 监听应用隐藏
  const originalOnHide = app.onHide;
  app.onHide = function() {
    analytics.trackAppLifecycle('app_hide');
    analytics.flush(); // 应用隐藏时立即上报

    if (originalOnHide) {
      originalOnHide.call(this);
    }
  };
}

module.exports = analytics;