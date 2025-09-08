// utils/error-handler.js
/**
 * 全局错误处理器
 * 提供统一的错误捕获、处理和上报机制
 */

class ErrorHandler {
  constructor() {
    this.errorLogs = [];
    this.maxErrorLogs = 100;
    this.reportUrl = '/api/error-report';
    this.isReporting = false;
    
    // 错误类型映射
    this.errorTypes = {
      'NETWORK_ERROR': '网络错误',
      'API_ERROR': 'API错误',
      'UI_ERROR': '界面错误',
      'DATA_ERROR': '数据错误',
      'PERMISSION_ERROR': '权限错误',
      'PAYMENT_ERROR': '支付错误',
      'STORAGE_ERROR': '存储错误',
      'UNKNOWN_ERROR': '未知错误'
    };

    // 用户友好的错误消息
    this.userFriendlyMessages = {
      'NETWORK_ERROR': '网络连接异常，请检查网络后重试',
      'API_ERROR': '服务暂时不可用，请稍后重试',
      'UI_ERROR': '页面出现异常，请刷新重试',
      'DATA_ERROR': '数据加载失败，请重试',
      'PERMISSION_ERROR': '权限不足，请联系管理员',
      'PAYMENT_ERROR': '支付处理异常，请重试或联系客服',
      'STORAGE_ERROR': '数据存储异常，请清理缓存后重试',
      'UNKNOWN_ERROR': '出现未知错误，请重试'
    };

    this.initErrorHandlers();
  }

  /**
   * 初始化全局错误处理器
   */
  initErrorHandlers() {
    // 全局错误监听
    wx.onError((error) => {
      this.handleGlobalError(error);
    });

    // 未处理的Promise拒绝
    wx.onUnhandledRejection((res) => {
      this.handleUnhandledRejection(res);
    });

    // 网络状态变化监听
    wx.onNetworkStatusChange((res) => {
      this.handleNetworkChange(res);
    });

    console.log('全局错误处理器初始化完成');
  }

  /**
   * 处理全局错误
   */
  handleGlobalError(error) {
    try {
      const errorInfo = {
        type: 'GLOBAL_ERROR',
        message: error,
        timestamp: new Date().toISOString(),
        stack: error.stack || 'No stack trace available',
        userAgent: wx.getSystemInfoSync(),
        pageRoute: this.getCurrentPageRoute(),
        context: this.getErrorContext()
      };

      this.logError(errorInfo);
      this.showUserFriendlyError('UNKNOWN_ERROR', errorInfo);
      this.reportError(errorInfo);

    } catch (handlerError) {
      console.error('错误处理器本身出错:', handlerError);
    }
  }

  /**
   * 处理未处理的Promise拒绝
   */
  handleUnhandledRejection(res) {
    try {
      const errorInfo = {
        type: 'UNHANDLED_REJECTION',
        message: res.reason,
        timestamp: new Date().toISOString(),
        promise: res.promise,
        pageRoute: this.getCurrentPageRoute(),
        context: this.getErrorContext()
      };

      this.logError(errorInfo);
      console.warn('未处理的Promise拒绝:', res.reason);

    } catch (handlerError) {
      console.error('处理未处理Promise拒绝时出错:', handlerError);
    }
  }

  /**
   * 处理网络状态变化
   */
  handleNetworkChange(res) {
    if (!res.isConnected) {
      this.showNetworkError();
    } else if (this.wasOffline) {
      wx.showToast({
        title: '网络已恢复',
        icon: 'success',
        duration: 2000
      });
    }
    this.wasOffline = !res.isConnected;
  }

  /**
   * 处理API错误
   */
  handleApiError(error, context = {}) {
    try {
      const errorInfo = {
        type: 'API_ERROR',
        message: error.message || error.errMsg || '接口请求失败',
        statusCode: error.statusCode,
        url: context.url,
        method: context.method,
        data: context.data,
        timestamp: new Date().toISOString(),
        pageRoute: this.getCurrentPageRoute(),
        context: { ...this.getErrorContext(), ...context }
      };

      this.logError(errorInfo);
      
      // 根据错误类型显示不同的用户消息
      const userMessage = this.getApiErrorMessage(error);
      this.showUserFriendlyError('API_ERROR', errorInfo, userMessage);
      
      this.reportError(errorInfo);

      return errorInfo;
    } catch (handlerError) {
      console.error('处理API错误时出错:', handlerError);
    }
  }

  /**
   * 处理支付错误
   */
  handlePaymentError(error, context = {}) {
    try {
      const errorInfo = {
        type: 'PAYMENT_ERROR',
        message: error.message || error.errMsg || '支付处理失败',
        errorCode: error.errorCode,
        timestamp: new Date().toISOString(),
        pageRoute: this.getCurrentPageRoute(),
        context: { ...this.getErrorContext(), ...context }
      };

      this.logError(errorInfo);
      
      // 支付错误需要特殊处理
      const userMessage = this.getPaymentErrorMessage(error);
      wx.showModal({
        title: '支付异常',
        content: userMessage,
        confirmText: '重试',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm && context.retryCallback) {
            context.retryCallback();
          }
        }
      });

      this.reportError(errorInfo, 'high'); // 支付错误高优先级上报

      return errorInfo;
    } catch (handlerError) {
      console.error('处理支付错误时出错:', handlerError);
    }
  }

  /**
   * 处理UI错误
   */
  handleUIError(error, component, context = {}) {
    try {
      const errorInfo = {
        type: 'UI_ERROR',
        message: error.message || '界面渲染异常',
        component: component,
        timestamp: new Date().toISOString(),
        pageRoute: this.getCurrentPageRoute(),
        context: { ...this.getErrorContext(), ...context }
      };

      this.logError(errorInfo);
      this.showUserFriendlyError('UI_ERROR', errorInfo);
      this.reportError(errorInfo);

      return errorInfo;
    } catch (handlerError) {
      console.error('处理UI错误时出错:', handlerError);
    }
  }

  /**
   * 显示网络错误
   */
  showNetworkError() {
    wx.showModal({
      title: '网络连接异常',
      content: '请检查网络连接后重试',
      showCancel: false,
      confirmText: '重试',
      success: () => {
        // 可以在这里添加重试逻辑
        wx.navigateBack({
          fail: () => {
            wx.reLaunch({
              url: '/pages/index/index'
            });
          }
        });
      }
    });
  }

  /**
   * 显示用户友好的错误消息
   */
  showUserFriendlyError(errorType, errorInfo, customMessage) {
    const message = customMessage || this.userFriendlyMessages[errorType] || '出现了一些问题';
    
    // 根据错误严重程度选择不同的显示方式
    if (this.isServerError(errorInfo)) {
      wx.showModal({
        title: '服务异常',
        content: message,
        showCancel: false,
        confirmText: '我知道了'
      });
    } else {
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 3000
      });
    }
  }

  /**
   * 记录错误日志
   */
  logError(errorInfo) {
    try {
      // 添加到内存日志
      this.errorLogs.unshift(errorInfo);
      
      // 保持日志数量在限制内
      if (this.errorLogs.length > this.maxErrorLogs) {
        this.errorLogs = this.errorLogs.slice(0, this.maxErrorLogs);
      }

      // 存储到本地
      wx.setStorageSync('error_logs', this.errorLogs);
      
      console.error('错误记录:', errorInfo);
    } catch (storageError) {
      console.error('记录错误日志失败:', storageError);
    }
  }

  /**
   * 上报错误到服务器
   */
  async reportError(errorInfo, priority = 'normal') {
    try {
      if (this.isReporting) return;
      
      this.isReporting = true;
      
      const reportData = {
        ...errorInfo,
        priority,
        appVersion: this.getAppVersion(),
        userId: this.getUserId(),
        deviceInfo: this.getDeviceInfo()
      };

      // 延迟上报，避免影响用户体验
      setTimeout(async () => {
        try {
          await wx.request({
            url: this.reportUrl,
            method: 'POST',
            data: reportData,
            header: {
              'Content-Type': 'application/json'
            }
          });
        } catch (reportError) {
          console.error('错误上报失败:', reportError);
        } finally {
          this.isReporting = false;
        }
      }, 1000);

    } catch (error) {
      console.error('准备错误上报时出错:', error);
      this.isReporting = false;
    }
  }

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
   * 获取错误上下文信息
   */
  getErrorContext() {
    try {
      return {
        timestamp: Date.now(),
        networkType: wx.getStorageSync('network_type') || 'unknown',
        batteryLevel: wx.getStorageSync('battery_level') || 'unknown',
        memoryWarning: wx.getStorageSync('memory_warning') || false,
        userActionHistory: this.getRecentUserActions()
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * 获取最近的用户操作历史
   */
  getRecentUserActions() {
    try {
      return wx.getStorageSync('user_actions') || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取API错误消息
   */
  getApiErrorMessage(error) {
    if (error.statusCode) {
      switch (error.statusCode) {
        case 400:
          return '请求参数有误，请检查输入信息';
        case 401:
          return '登录已过期，请重新登录';
        case 403:
          return '权限不足，无法访问该功能';
        case 404:
          return '请求的资源不存在';
        case 500:
          return '服务器内部错误，请稍后重试';
        case 502:
        case 503:
          return '服务暂时不可用，请稍后重试';
        default:
          return '网络请求失败，请检查网络连接';
      }
    }
    return '网络请求异常，请重试';
  }

  /**
   * 获取支付错误消息
   */
  getPaymentErrorMessage(error) {
    const errorMsg = error.errMsg || '';
    
    if (errorMsg.includes('cancel')) {
      return '支付已取消';
    } else if (errorMsg.includes('fail')) {
      return '支付失败，请重试或联系客服';
    } else {
      return '支付过程中出现异常，请重试';
    }
  }

  /**
   * 判断是否为服务器错误
   */
  isServerError(errorInfo) {
    return errorInfo.statusCode >= 500 || errorInfo.type === 'NETWORK_ERROR';
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
   * 获取用户ID
   */
  getUserId() {
    try {
      const app = getApp();
      return app.globalData.userInfo?.id || 'anonymous';
    } catch (error) {
      return 'anonymous';
    }
  }

  /**
   * 获取设备信息
   */
  getDeviceInfo() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      return {
        platform: systemInfo.platform,
        model: systemInfo.model,
        pixelRatio: systemInfo.pixelRatio,
        windowWidth: systemInfo.windowWidth,
        windowHeight: systemInfo.windowHeight,
        version: systemInfo.version,
        system: systemInfo.system,
        language: systemInfo.language,
        SDKVersion: systemInfo.SDKVersion
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * 清理错误日志
   */
  clearErrorLogs() {
    try {
      this.errorLogs = [];
      wx.removeStorageSync('error_logs');
    } catch (error) {
      console.error('清理错误日志失败:', error);
    }
  }

  /**
   * 获取错误统计信息
   */
  getErrorStats() {
    try {
      const logs = this.errorLogs;
      const stats = {
        total: logs.length,
        byType: {},
        byPage: {},
        recent24Hours: 0
      };

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      logs.forEach(log => {
        // 按类型统计
        stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
        
        // 按页面统计
        stats.byPage[log.pageRoute] = (stats.byPage[log.pageRoute] || 0) + 1;
        
        // 24小时内的错误
        if (new Date(log.timestamp).getTime() > oneDayAgo) {
          stats.recent24Hours++;
        }
      });

      return stats;
    } catch (error) {
      console.error('获取错误统计失败:', error);
      return { total: 0, byType: {}, byPage: {}, recent24Hours: 0 };
    }
  }

  /**
   * 错误恢复机制
   */
  attemptErrorRecovery(errorInfo) {
    try {
      // 根据错误类型尝试不同的恢复策略
      switch (errorInfo.type) {
        case 'NETWORK_ERROR':
          this.retryNetworkOperation(errorInfo);
          break;
        case 'STORAGE_ERROR':
          this.clearCorruptedStorage();
          break;
        case 'UI_ERROR':
          this.refreshCurrentPage();
          break;
        default:
          console.log('无可用的恢复策略');
      }
    } catch (recoveryError) {
      console.error('错误恢复失败:', recoveryError);
    }
  }

  /**
   * 重试网络操作
   */
  retryNetworkOperation(errorInfo) {
    // 实现网络操作重试逻辑
    console.log('尝试重新进行网络操作');
  }

  /**
   * 清理损坏的存储
   */
  clearCorruptedStorage() {
    try {
      wx.clearStorageSync();
      wx.showToast({
        title: '已清理异常数据',
        icon: 'success'
      });
    } catch (error) {
      console.error('清理存储失败:', error);
    }
  }

  /**
   * 刷新当前页面
   */
  refreshCurrentPage() {
    try {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (currentPage && currentPage.onLoad) {
        currentPage.onLoad({});
      }
    } catch (error) {
      console.error('刷新页面失败:', error);
    }
  }
}

// 创建全局实例
const errorHandler = new ErrorHandler();

// 扩展console，自动捕获console.error
const originalConsoleError = console.error;
console.error = function(...args) {
  originalConsoleError.apply(console, args);
  
  // 将console.error的内容也记录到错误处理器
  if (args.length > 0) {
    errorHandler.logError({
      type: 'CONSOLE_ERROR',
      message: args.join(' '),
      timestamp: new Date().toISOString(),
      pageRoute: errorHandler.getCurrentPageRoute(),
      context: errorHandler.getErrorContext()
    });
  }
};

module.exports = errorHandler;