/**
 * 用户友好的错误处理管理器
 * 提供智能错误分类、用户友好提示和自动恢复建议
 */
class UserFriendlyErrorManager {
  constructor() {
    this.errorPatterns = this.initErrorPatterns();
    this.recoveryStrategies = this.initRecoveryStrategies();
    this.errorHistory = [];
    this.maxHistorySize = 50;
    this.contextInfo = {};
  }

  /**
   * 初始化错误模式匹配规则
   */
  initErrorPatterns() {
    return {
      network: {
        patterns: [
          /network/i,
          /连接/,
          /timeout/i,
          /超时/,
          /网络/,
          /请求失败/,
          /fetch.*failed/i,
          /connection.*error/i
        ],
        type: 'network',
        severity: 'medium',
        recoverable: true
      },
      
      server: {
        patterns: [
          /5\d{2}/,
          /服务器.*错误/,
          /server.*error/i,
          /internal.*error/i,
          /service.*unavailable/i,
          /bad.*gateway/i
        ],
        type: 'server',
        severity: 'high',
        recoverable: true
      },
      
      permission: {
        patterns: [
          /4\d{1}/,
          /unauthorized/i,
          /权限/,
          /permission/i,
          /access.*denied/i,
          /forbidden/i,
          /登录/
        ],
        type: 'permission',
        severity: 'medium',
        recoverable: false
      },
      
      payment: {
        patterns: [
          /支付/,
          /payment/i,
          /订单/,
          /order/i,
          /余额/,
          /balance/i,
          /充值/,
          /charge/i
        ],
        type: 'payment',
        severity: 'high',
        recoverable: true
      },
      
      data: {
        patterns: [
          /数据.*格式/,
          /parse.*error/i,
          /json/i,
          /format.*error/i,
          /invalid.*data/i,
          /参数.*错误/
        ],
        type: 'data',
        severity: 'low',
        recoverable: true
      }
    };
  }

  /**
   * 初始化恢复策略
   */
  initRecoveryStrategies() {
    return {
      network: {
        autoRetry: true,
        retryCount: 3,
        retryDelay: [1000, 2000, 5000],
        suggestions: [
          '检查网络连接是否正常',
          '尝试切换到WiFi或4G网络',
          '稍后再试'
        ],
        actions: [
          { type: 'retry', label: '重试', primary: true },
          { type: 'refresh', label: '刷新页面' },
          { type: 'feedback', label: '反馈问题' }
        ]
      },
      
      server: {
        autoRetry: true,
        retryCount: 2,
        retryDelay: [3000, 10000],
        suggestions: [
          '服务器可能正在维护中',
          '请稍后再试',
          '如果问题持续，请联系客服'
        ],
        actions: [
          { type: 'retry', label: '重试', primary: true },
          { type: 'contact', label: '联系客服' }
        ]
      },
      
      permission: {
        autoRetry: false,
        suggestions: [
          '请检查登录状态',
          '确认账户权限设置',
          '联系管理员或客服'
        ],
        actions: [
          { type: 'login', label: '重新登录', primary: true },
          { type: 'upgrade', label: '升级权限' },
          { type: 'contact', label: '联系客服' }
        ]
      },
      
      payment: {
        autoRetry: false,
        suggestions: [
          '检查账户余额',
          '确认支付方式有效',
          '联系客服处理'
        ],
        actions: [
          { type: 'retry', label: '重试支付', primary: true },
          { type: 'changePayment', label: '更换支付方式' },
          { type: 'contact', label: '联系客服' }
        ]
      },
      
      data: {
        autoRetry: true,
        retryCount: 1,
        retryDelay: [1000],
        suggestions: [
          '数据格式可能异常',
          '尝试刷新页面',
          '清除缓存后重试'
        ],
        actions: [
          { type: 'refresh', label: '刷新页面', primary: true },
          { type: 'clearCache', label: '清除缓存' }
        ]
      }
    };
  }

  /**
   * 处理错误
   * @param {Error|string} error 错误对象或错误信息
   * @param {object} context 上下文信息
   * @param {object} options 选项
   */
  handleError(error, context = {}, options = {}) {
    try {
      // 解析错误信息
      const errorInfo = this.parseError(error, context);
      
      // 分类错误
      const classification = this.classifyError(errorInfo);
      
      // 记录错误历史
      this.recordError({ ...errorInfo, ...classification });
      
      // 检查是否需要自动重试
      if (this.shouldAutoRetry(classification)) {
        return this.executeAutoRetry(errorInfo, classification, options);
      }
      
      // 显示用户友好的错误提示
      return this.showUserFriendlyError(errorInfo, classification, options);
      
    } catch (handlingError) {
      console.error('错误处理器异常:', handlingError);
      return this.showFallbackError(error);
    }
  }

  /**
   * 解析错误信息
   */
  parseError(error, context) {
    let message = '';
    let code = '';
    let stack = '';
    
    if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      message = error.message || error.msg || error.errMsg || String(error);
      code = error.code || error.statusCode || error.errCode || '';
      stack = error.stack || '';
    }
    
    return {
      message,
      code,
      stack,
      timestamp: Date.now(),
      context: { ...this.contextInfo, ...context },
      userAgent: this.getUserAgent(),
      pageRoute: this.getCurrentRoute()
    };
  }

  /**
   * 分类错误
   */
  classifyError(errorInfo) {
    const { message, code } = errorInfo;
    const fullText = `${code} ${message}`.toLowerCase();
    
    // 遍历错误模式进行匹配
    for (const [key, config] of Object.entries(this.errorPatterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(fullText)) {
          return {
            ...config,
            matchedPattern: pattern.toString()
          };
        }
      }
    }
    
    // 默认分类
    return {
      type: 'unknown',
      severity: 'medium',
      recoverable: true,
      matchedPattern: null
    };
  }

  /**
   * 检查是否应该自动重试
   */
  shouldAutoRetry(classification) {
    const strategy = this.recoveryStrategies[classification.type];
    if (!strategy || !strategy.autoRetry) return false;
    
    // 检查是否已超过重试次数
    const recentErrors = this.getRecentErrors(classification.type, 60000); // 1分钟内
    return recentErrors.length <= (strategy.retryCount || 0);
  }

  /**
   * 执行自动重试
   */
  async executeAutoRetry(errorInfo, classification, options) {
    const strategy = this.recoveryStrategies[classification.type];
    const recentErrors = this.getRecentErrors(classification.type, 60000);
    const retryIndex = recentErrors.length;
    
    if (retryIndex >= strategy.retryCount) {
      return this.showUserFriendlyError(errorInfo, classification, options);
    }
    
    const delay = strategy.retryDelay[Math.min(retryIndex, strategy.retryDelay.length - 1)];
    
    // 显示重试提示
    wx.showLoading({
      title: `正在重试 (${retryIndex + 1}/${strategy.retryCount})`,
      mask: true
    });
    
    // 延迟重试
    return new Promise((resolve) => {
      setTimeout(() => {
        wx.hideLoading();
        if (options.retryFunction && typeof options.retryFunction === 'function') {
          resolve(options.retryFunction());
        } else {
          resolve(this.showUserFriendlyError(errorInfo, classification, options));
        }
      }, delay);
    });
  }

  /**
   * 显示用户友好的错误提示
   */
  showUserFriendlyError(errorInfo, classification, options = {}) {
    const strategy = this.recoveryStrategies[classification.type];
    
    // 生成友好的错误消息
    const friendlyMessage = this.generateFriendlyMessage(errorInfo, classification);
    
    const errorDialogConfig = {
      show: true,
      errorType: classification.type,
      title: this.getErrorTitle(classification),
      message: friendlyMessage,
      errorCode: errorInfo.code,
      suggestions: strategy ? strategy.suggestions : [],
      showRetry: classification.recoverable && !classification.autoRetried,
      showFeedback: true,
      showDetails: options.showDetails !== false,
      details: options.showDetails ? this.formatErrorDetails(errorInfo) : ''
    };
    
    // 触发全局错误事件
    this.triggerGlobalErrorEvent('userFriendlyError', {
      errorInfo,
      classification,
      dialogConfig: errorDialogConfig,
      actions: strategy ? strategy.actions : []
    });
    
    return errorDialogConfig;
  }

  /**
   * 生成友好的错误消息
   */
  generateFriendlyMessage(errorInfo, classification) {
    const baseMessages = {
      network: '网络连接出现问题，请检查网络后重试',
      server: '服务暂时不可用，我们正在努力修复中',
      permission: '您没有执行此操作的权限',
      payment: '支付过程中出现问题',
      data: '数据处理时出现异常',
      unknown: '出现了未知问题'
    };
    
    let message = baseMessages[classification.type] || baseMessages.unknown;
    
    // 根据错误代码优化消息
    if (errorInfo.code) {
      if (errorInfo.code === '404') {
        message = '请求的资源不存在';
      } else if (errorInfo.code === '401') {
        message = '身份验证失败，请重新登录';
      } else if (errorInfo.code === '403') {
        message = '权限不足，无法访问此功能';
      } else if (errorInfo.code.toString().startsWith('5')) {
        message = '服务器内部错误，请稍后重试';
      }
    }
    
    return message;
  }

  /**
   * 获取错误标题
   */
  getErrorTitle(classification) {
    const titles = {
      network: '网络连接异常',
      server: '服务异常',
      permission: '权限不足',
      payment: '支付异常',
      data: '数据异常',
      unknown: '出现问题'
    };
    
    return titles[classification.type] || titles.unknown;
  }

  /**
   * 格式化错误详情
   */
  formatErrorDetails(errorInfo) {
    const details = [];
    
    if (errorInfo.code) {
      details.push(`错误代码: ${errorInfo.code}`);
    }
    
    if (errorInfo.message) {
      details.push(`错误信息: ${errorInfo.message}`);
    }
    
    if (errorInfo.context && Object.keys(errorInfo.context).length > 0) {
      details.push(`上下文: ${JSON.stringify(errorInfo.context, null, 2)}`);
    }
    
    details.push(`时间: ${new Date(errorInfo.timestamp).toLocaleString()}`);
    details.push(`页面: ${errorInfo.pageRoute || '未知'}`);
    
    return details.join('\n');
  }

  /**
   * 记录错误历史
   */
  recordError(errorInfo) {
    this.errorHistory.unshift({
      ...errorInfo,
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    
    // 限制历史记录大小
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * 获取最近的错误
   */
  getRecentErrors(type, timeWindow) {
    const now = Date.now();
    return this.errorHistory.filter(error => 
      error.type === type && (now - error.timestamp) <= timeWindow
    );
  }

  /**
   * 显示备用错误提示
   */
  showFallbackError(originalError) {
    wx.showModal({
      title: '出现问题',
      content: '应用遇到了意外问题，请重启应用或联系客服',
      confirmText: '我知道了',
      showCancel: false
    });
  }

  /**
   * 触发全局错误事件
   */
  triggerGlobalErrorEvent(eventType, data) {
    try {
      const app = getApp();
      if (app && app.globalData && app.globalData.eventBus) {
        app.globalData.eventBus.emit(eventType, data);
      }
    } catch (error) {
      console.warn('触发全局错误事件失败:', error);
    }
  }

  /**
   * 获取用户代理信息
   */
  getUserAgent() {
    try {
      return {
        ...wx.getWindowInfo(),
        ...wx.getDeviceInfo(),
        ...wx.getAppBaseInfo()
      };
    } catch (error) {
      // 降级到老版本API
      try {
        return wx.getSystemInfoSync();
      } catch (e) {
        return {};
      }
    }
  }

  /**
   * 获取当前路由
   */
  getCurrentRoute() {
    try {
      const pages = getCurrentPages();
      return pages.length > 0 ? pages[pages.length - 1].route : '';
    } catch (error) {
      return '';
    }
  }

  /**
   * 设置上下文信息
   */
  setContext(context) {
    this.contextInfo = { ...this.contextInfo, ...context };
  }

  /**
   * 清除上下文信息
   */
  clearContext() {
    this.contextInfo = {};
  }

  /**
   * 获取错误统计信息
   */
  getErrorStats(timeWindow = 3600000) { // 默认1小时
    const now = Date.now();
    const recentErrors = this.errorHistory.filter(error => 
      (now - error.timestamp) <= timeWindow
    );
    
    const stats = {
      total: recentErrors.length,
      byType: {},
      bySeverity: {},
      recoverable: 0,
      unrecoverable: 0
    };
    
    recentErrors.forEach(error => {
      // 按类型统计
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      
      // 按严重程度统计
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
      
      // 按可恢复性统计
      if (error.recoverable) {
        stats.recoverable++;
      } else {
        stats.unrecoverable++;
      }
    });
    
    return stats;
  }
}

// 创建全局实例
let globalErrorManager = null;

/**
 * 获取全局错误管理器实例
 */
function getErrorManager() {
  if (!globalErrorManager) {
    globalErrorManager = new UserFriendlyErrorManager();
  }
  return globalErrorManager;
}

/**
 * 便捷方法：处理错误
 */
function handleError(error, context, options) {
  return getErrorManager().handleError(error, context, options);
}

module.exports = {
  UserFriendlyErrorManager,
  getErrorManager,
  handleError
};