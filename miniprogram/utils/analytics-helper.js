// utils/analytics-helper.js
/**
 * 埋点辅助工具
 * 提供便捷的埋点集成方法
 */

const analytics = require('./analytics');

class AnalyticsHelper {
  constructor() {
    this.analytics = analytics;
    this.pageStartTime = {};
    this.pageInteractionCount = {};
  }

  /**
   * 页面埋点装饰器
   * 自动追踪页面生命周期和用户行为
   */
  wrapPage(pageConfig) {
    const wrappedConfig = { ...pageConfig };
    const pagePath = pageConfig.route || 'unknown';

    // 包装 onLoad
    const originalOnLoad = wrappedConfig.onLoad;
    wrappedConfig.onLoad = function(options) {
      const startTime = Date.now();
      analytics.trackPageView(this.route, options.referrer);
      
      // 记录页面开始时间
      const helper = getApp().globalData.analyticsHelper;
      if (helper) {
        helper.pageStartTime[this.route] = startTime;
        helper.pageInteractionCount[this.route] = 0;
      }

      if (originalOnLoad) {
        const result = originalOnLoad.call(this, options);
        
        // 记录页面加载性能
        const loadTime = Date.now() - startTime;
        analytics.trackPerformance({
          type: 'page_load',
          value: loadTime,
          pageRoute: this.route,
          operationName: 'page_load'
        });

        return result;
      }
    };

    // 包装 onShow
    const originalOnShow = wrappedConfig.onShow;
    wrappedConfig.onShow = function() {
      analytics.trackAppLifecycle('page_show', { page_route: this.route });
      
      if (originalOnShow) {
        return originalOnShow.call(this);
      }
    };

    // 包装 onHide
    const originalOnHide = wrappedConfig.onHide;
    wrappedConfig.onHide = function() {
      const helper = getApp().globalData.analyticsHelper;
      if (helper && helper.pageStartTime[this.route]) {
        const timeSpent = Date.now() - helper.pageStartTime[this.route];
        analytics.trackTimeSpent(this.route, timeSpent);
      }

      analytics.trackAppLifecycle('page_hide', { 
        page_route: this.route,
        interaction_count: helper ? helper.pageInteractionCount[this.route] : 0
      });

      if (originalOnHide) {
        return originalOnHide.call(this);
      }
    };

    // 包装 onUnload
    const originalOnUnload = wrappedConfig.onUnload;
    wrappedConfig.onUnload = function() {
      const helper = getApp().globalData.analyticsHelper;
      if (helper && helper.pageStartTime[this.route]) {
        const timeSpent = Date.now() - helper.pageStartTime[this.route];
        analytics.trackTimeSpent(this.route, timeSpent);
        delete helper.pageStartTime[this.route];
        delete helper.pageInteractionCount[this.route];
      }

      if (originalOnUnload) {
        return originalOnUnload.call(this);
      }
    };

    // 包装其他方法，自动添加用户交互埋点
    Object.keys(wrappedConfig).forEach(key => {
      if (typeof wrappedConfig[key] === 'function' && 
          !['onLoad', 'onShow', 'onHide', 'onUnload', 'onShareAppMessage', 'onShareTimeline'].includes(key)) {
        
        const originalMethod = wrappedConfig[key];
        wrappedConfig[key] = function(...args) {
          // 记录用户交互
          const helper = getApp().globalData.analyticsHelper;
          if (helper) {
            helper.pageInteractionCount[this.route] = (helper.pageInteractionCount[this.route] || 0) + 1;
          }

          analytics.trackInteraction('method_call', key, {
            pageRoute: this.route,
            args: args.length
          });

          return originalMethod.apply(this, args);
        };
      }
    });

    return wrappedConfig;
  }

  /**
   * 组件埋点装饰器
   */
  wrapComponent(componentConfig) {
    const wrappedConfig = { ...componentConfig };

    // 包装组件方法
    if (wrappedConfig.methods) {
      Object.keys(wrappedConfig.methods).forEach(key => {
        if (typeof wrappedConfig.methods[key] === 'function') {
          const originalMethod = wrappedConfig.methods[key];
          wrappedConfig.methods[key] = function(...args) {
            analytics.trackInteraction('component_method', key, {
              componentName: this.is,
              args: args.length
            });

            return originalMethod.apply(this, args);
          };
        }
      });
    }

    return wrappedConfig;
  }

  /**
   * 业务操作埋点包装器
   */
  wrapBusinessOperation(operationName, operation, context = {}) {
    return async (...args) => {
      const startTime = Date.now();
      
      try {
        const result = await operation(...args);
        
        // 成功埋点
        analytics.track(`${operationName}_success`, {
          operation_name: operationName,
          duration: Date.now() - startTime,
          ...context
        });
        
        return result;
      } catch (error) {
        // 失败埋点
        analytics.track(`${operationName}_failure`, {
          operation_name: operationName,
          duration: Date.now() - startTime,
          error_message: error.message,
          ...context
        });
        
        throw error;
      }
    };
  }

  /**
   * 表单提交埋点
   */
  trackFormSubmit(formName, formData, validationErrors = []) {
    analytics.track('form_submit', {
      form_name: formName,
      field_count: Object.keys(formData).length,
      has_errors: validationErrors.length > 0,
      error_count: validationErrors.length,
      validation_errors: validationErrors
    });
  }

  /**
   * 按钮点击埋点
   */
  trackButtonClick(buttonName, buttonType = 'primary', context = {}) {
    analytics.trackInteraction('click', buttonName, {
      element_type: 'button',
      button_type: buttonType,
      ...context
    });
  }

  /**
   * 列表操作埋点
   */
  trackListOperation(operationType, listName, itemData = {}) {
    analytics.track('list_operation', {
      operation_type: operationType, // view, scroll, select, filter, sort
      list_name: listName,
      item_id: itemData.id,
      item_type: itemData.type,
      list_position: itemData.position
    });
  }

  /**
   * 模态框操作埋点
   */
  trackModalOperation(modalName, operation, context = {}) {
    analytics.track('modal_operation', {
      modal_name: modalName,
      operation: operation, // show, hide, confirm, cancel
      ...context
    });
  }

  /**
   * 导航埋点
   */
  trackNavigation(navigationType, targetPage, sourceContext = {}) {
    analytics.track('navigation', {
      navigation_type: navigationType, // navigate, redirect, switch_tab, back
      target_page: targetPage,
      source_page: this.getCurrentPageRoute(),
      ...sourceContext
    });
  }

  /**
   * 媒体操作埋点
   */
  trackMediaOperation(mediaType, operation, mediaInfo = {}) {
    analytics.track('media_operation', {
      media_type: mediaType, // image, video, audio
      operation: operation, // view, play, pause, download, share
      media_id: mediaInfo.id,
      media_duration: mediaInfo.duration,
      media_size: mediaInfo.size
    });
  }

  // ==================== 业务特定埋点 ====================

  /**
   * 任务相关埋点
   */
  taskAnalytics = {
    viewTask: (taskId, taskType) => {
      analytics.track('task_view', {
        task_id: taskId,
        task_type: taskType,
        view_timestamp: Date.now()
      });
    },

    startTask: (taskId, taskType) => {
      analytics.track('task_start', {
        task_id: taskId,
        task_type: taskType,
        start_timestamp: Date.now()
      });
    },

    submitTask: (taskId, taskType, submissionData) => {
      analytics.trackTaskSubmission(taskId, taskType, submissionData);
    },

    saveTaskDraft: (taskId, taskType, draftData) => {
      analytics.track('task_draft_save', {
        task_id: taskId,
        task_type: taskType,
        word_count: draftData.wordCount || 0,
        save_timestamp: Date.now()
      });
    }
  };

  /**
   * 学习进度埋点
   */
  learningAnalytics = {
    updateProgress: (progressData) => {
      analytics.trackLearningProgress(progressData);
    },

    viewReport: (reportType, reportData) => {
      analytics.track('learning_report_view', {
        report_type: reportType,
        report_period: reportData.period,
        data_points: reportData.dataPoints || 0
      });
    },

    exportData: (exportType, dataRange) => {
      analytics.track('data_export', {
        export_type: exportType,
        data_range: dataRange,
        export_timestamp: Date.now()
      });
    }
  };

  /**
   * 社交功能埋点
   */
  socialAnalytics = {
    viewLeaderboard: (leaderboardType, timeRange) => {
      analytics.track('leaderboard_view', {
        leaderboard_type: leaderboardType,
        time_range: timeRange,
        view_timestamp: Date.now()
      });
    },

    shareContent: (contentType, shareChannel, contentData) => {
      analytics.trackShare({
        contentType,
        channel: shareChannel,
        contentId: contentData.id,
        title: contentData.title,
        customTitle: contentData.customTitle,
        shareType: contentType
      });
    }
  };

  /**
   * 设置和配置埋点
   */
  settingsAnalytics = {
    changeNotificationSetting: (settingName, oldValue, newValue) => {
      analytics.track('notification_setting_change', {
        setting_name: settingName,
        old_value: oldValue,
        new_value: newValue
      });
    },

    changeAppearanceSetting: (settingType, settingValue) => {
      analytics.track('appearance_setting_change', {
        setting_type: settingType,
        setting_value: settingValue
      });
    }
  };

  // ==================== 辅助方法 ====================

  /**
   * 获取当前页面路由
   */
  getCurrentPageRoute() {
    return analytics.getCurrentPageRoute();
  }

  /**
   * 批量上报事件
   */
  async flush() {
    return analytics.flush();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return analytics.getStats();
  }

  /**
   * 设置用户信息
   */
  setUser(userId, userRole, userInfo) {
    analytics.setUser(userId, userRole, userInfo);
  }

  /**
   * 自动埋点配置
   */
  enableAutoTracking(config = {}) {
    const defaultConfig = {
      pageViews: true,
      userInteractions: true,
      errors: true,
      performance: true,
      api: true
    };

    const finalConfig = { ...defaultConfig, ...config };

    // 启用页面访问自动追踪
    if (finalConfig.pageViews) {
      this.enablePageViewTracking();
    }

    // 启用性能自动追踪
    if (finalConfig.performance) {
      this.enablePerformanceTracking();
    }

    console.log('自动埋点已启用:', finalConfig);
  }

  /**
   * 启用页面访问自动追踪
   */
  enablePageViewTracking() {
    // 劫持页面导航方法
    const originalNavigateTo = wx.navigateTo;
    wx.navigateTo = (options) => {
      this.trackNavigation('navigate', options.url);
      return originalNavigateTo(options);
    };

    const originalRedirectTo = wx.redirectTo;
    wx.redirectTo = (options) => {
      this.trackNavigation('redirect', options.url);
      return originalRedirectTo(options);
    };

    const originalSwitchTab = wx.switchTab;
    wx.switchTab = (options) => {
      this.trackNavigation('switch_tab', options.url);
      return originalSwitchTab(options);
    };
  }

  /**
   * 启用性能自动追踪
   */
  enablePerformanceTracking() {
    // 监控网络请求性能
    const app = getApp();
    if (app && app._executeRequest) {
      const originalExecuteRequest = app._executeRequest;
      app._executeRequest = function(options, requestKey, retryCount = 0) {
        const startTime = Date.now();
        
        const promise = originalExecuteRequest.call(this, options, requestKey, retryCount);
        
        promise.then(
          (result) => {
            analytics.trackApiPerformance({
              url: options.url,
              method: options.method || 'GET',
              responseTime: Date.now() - startTime,
              statusCode: 200,
              success: true,
              dataSize: JSON.stringify(result).length
            });
          },
          (error) => {
            analytics.trackApiPerformance({
              url: options.url,
              method: options.method || 'GET',
              responseTime: Date.now() - startTime,
              statusCode: error.statusCode || 0,
              success: false
            });
          }
        );

        return promise;
      };
    }
  }
}

// 创建全局实例
const analyticsHelper = new AnalyticsHelper();

// 导出便捷方法
module.exports = {
  analyticsHelper,
  analytics,
  
  // 装饰器
  wrapPage: analyticsHelper.wrapPage.bind(analyticsHelper),
  wrapComponent: analyticsHelper.wrapComponent.bind(analyticsHelper),
  wrapBusinessOperation: analyticsHelper.wrapBusinessOperation.bind(analyticsHelper),
  
  // 通用埋点
  trackFormSubmit: analyticsHelper.trackFormSubmit.bind(analyticsHelper),
  trackButtonClick: analyticsHelper.trackButtonClick.bind(analyticsHelper),
  trackListOperation: analyticsHelper.trackListOperation.bind(analyticsHelper),
  trackModalOperation: analyticsHelper.trackModalOperation.bind(analyticsHelper),
  trackNavigation: analyticsHelper.trackNavigation.bind(analyticsHelper),
  trackMediaOperation: analyticsHelper.trackMediaOperation.bind(analyticsHelper),
  
  // 业务埋点
  taskAnalytics: analyticsHelper.taskAnalytics,
  learningAnalytics: analyticsHelper.learningAnalytics,
  socialAnalytics: analyticsHelper.socialAnalytics,
  settingsAnalytics: analyticsHelper.settingsAnalytics,
  
  // 工具方法
  setUser: analyticsHelper.setUser.bind(analyticsHelper),
  flush: analyticsHelper.flush.bind(analyticsHelper),
  getStats: analyticsHelper.getStats.bind(analyticsHelper),
  enableAutoTracking: analyticsHelper.enableAutoTracking.bind(analyticsHelper)
};