// utils/error-helper.js
/**
 * 错误处理辅助工具
 * 提供便捷的错误处理方法给页面和组件使用
 */

const errorHandler = require('./error-handler');

class ErrorHelper {
  constructor() {
    this.errorHandler = errorHandler;
  }

  /**
   * 页面错误处理包装器
   * 用于页面方法的错误处理
   */
  wrapPageMethod(methodName, method, context) {
    return async function(...args) {
      try {
        return await method.apply(context, args);
      } catch (error) {
        console.error(`页面方法 ${methodName} 出错:`, error);
        
        errorHandler.handleUIError(error, `page.${methodName}`, {
          methodName,
          args: args.length > 0 ? JSON.stringify(args) : undefined,
          pagePath: context.route || 'unknown'
        });
        
        throw error;
      }
    };
  }

  /**
   * 组件错误处理包装器
   */
  wrapComponentMethod(methodName, method, context) {
    return async function(...args) {
      try {
        return await method.apply(context, args);
      } catch (error) {
        console.error(`组件方法 ${methodName} 出错:`, error);
        
        errorHandler.handleUIError(error, `component.${methodName}`, {
          methodName,
          args: args.length > 0 ? JSON.stringify(args) : undefined,
          componentName: context.is || 'unknown'
        });
        
        throw error;
      }
    };
  }

  /**
   * 异步操作安全包装器
   */
  async safeAsync(operation, operationName = 'async_operation', showError = true) {
    try {
      return await operation();
    } catch (error) {
      console.error(`异步操作 ${operationName} 失败:`, error);
      
      if (showError) {
        errorHandler.handleUIError(error, operationName, {
          operation: operationName
        });
      }
      
      return null;
    }
  }

  /**
   * 存储操作安全包装器
   */
  safeStorage = {
    setSync: (key, data) => {
      try {
        wx.setStorageSync(key, data);
        return true;
      } catch (error) {
        errorHandler.logError({
          type: 'STORAGE_ERROR',
          message: `存储设置失败: ${key}`,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        return false;
      }
    },

    getSync: (key, defaultValue = null) => {
      try {
        return wx.getStorageSync(key) || defaultValue;
      } catch (error) {
        errorHandler.logError({
          type: 'STORAGE_ERROR',
          message: `存储获取失败: ${key}`,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        return defaultValue;
      }
    },

    removeSync: (key) => {
      try {
        wx.removeStorageSync(key);
        return true;
      } catch (error) {
        errorHandler.logError({
          type: 'STORAGE_ERROR',
          message: `存储删除失败: ${key}`,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        return false;
      }
    }
  };

  /**
   * API调用安全包装器
   */
  async safeApiCall(apiCall, apiName = 'unknown_api', retryCount = 0) {
    try {
      const result = await apiCall();
      return { success: true, data: result };
    } catch (error) {
      console.error(`API调用 ${apiName} 失败:`, error);
      
      errorHandler.handleApiError(error, {
        apiName,
        retryCount
      });
      
      return { success: false, error };
    }
  }

  /**
   * 支付操作安全包装器
   */
  async safePayment(paymentCall, context = {}) {
    try {
      const result = await paymentCall();
      return { success: true, data: result };
    } catch (error) {
      console.error('支付操作失败:', error);
      
      errorHandler.handlePaymentError(error, context);
      
      return { success: false, error };
    }
  }

  /**
   * 图片加载错误处理
   */
  handleImageError(imageSrc, context = {}) {
    errorHandler.logError({
      type: 'IMAGE_LOAD_ERROR',
      message: `图片加载失败: ${imageSrc}`,
      imageSrc,
      timestamp: new Date().toISOString(),
      context
    });
  }

  /**
   * 表单验证错误处理
   */
  handleValidationError(errors, formName = 'unknown_form') {
    const errorMessage = Array.isArray(errors) ? errors.join(', ') : errors;
    
    errorHandler.logError({
      type: 'VALIDATION_ERROR',
      message: `表单验证失败: ${formName}`,
      errors: errorMessage,
      timestamp: new Date().toISOString(),
      formName
    });

    wx.showToast({
      title: errorMessage.length > 20 ? '输入信息有误' : errorMessage,
      icon: 'none',
      duration: 3000
    });
  }

  /**
   * 网络状态检查包装器
   */
  async withNetworkCheck(operation, operationName = 'network_operation') {
    try {
      const networkInfo = await wx.getNetworkType();
      
      if (networkInfo.networkType === 'none') {
        wx.showModal({
          title: '网络异常',
          content: '请检查网络连接后重试',
          showCancel: false
        });
        return { success: false, error: 'NO_NETWORK' };
      }

      return await operation();
    } catch (error) {
      console.error(`网络操作 ${operationName} 失败:`, error);
      return { success: false, error };
    }
  }

  /**
   * 权限检查包装器
   */
  async withPermissionCheck(permission, operation, operationName = 'permission_operation') {
    try {
      const authResult = await wx.getSetting();
      
      if (!authResult.authSetting[permission]) {
        const authResult = await wx.authorize({ scope: permission });
      }

      return await operation();
    } catch (error) {
      if (error.errMsg && error.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '权限不足',
          content: '该功能需要相应权限，请在设置中开启',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
      }

      errorHandler.logError({
        type: 'PERMISSION_ERROR',
        message: `权限操作失败: ${operationName}`,
        permission,
        error: error.message || error.errMsg,
        timestamp: new Date().toISOString()
      });

      return { success: false, error };
    }
  }

  /**
   * 页面生命周期错误处理
   */
  wrapLifecycle(lifecycleName, lifecycleMethod, context) {
    return function(...args) {
      try {
        return lifecycleMethod.apply(context, args);
      } catch (error) {
        console.error(`生命周期 ${lifecycleName} 出错:`, error);
        
        errorHandler.handleUIError(error, `lifecycle.${lifecycleName}`, {
          lifecycle: lifecycleName,
          pagePath: context.route || 'unknown'
        });
      }
    };
  }

  /**
   * 批量错误处理包装
   */
  wrapPage(pageConfig) {
    const wrappedConfig = { ...pageConfig };
    
    // 包装生命周期方法
    const lifecycles = ['onLoad', 'onReady', 'onShow', 'onHide', 'onUnload'];
    lifecycles.forEach(lifecycle => {
      if (wrappedConfig[lifecycle]) {
        wrappedConfig[lifecycle] = this.wrapLifecycle(lifecycle, wrappedConfig[lifecycle], wrappedConfig);
      }
    });

    // 包装其他方法
    Object.keys(wrappedConfig).forEach(key => {
      if (typeof wrappedConfig[key] === 'function' && !lifecycles.includes(key)) {
        wrappedConfig[key] = this.wrapPageMethod(key, wrappedConfig[key], wrappedConfig);
      }
    });

    return wrappedConfig;
  }

  /**
   * 批量组件错误处理包装
   */
  wrapComponent(componentConfig) {
    const wrappedConfig = { ...componentConfig };
    
    // 包装方法
    if (wrappedConfig.methods) {
      Object.keys(wrappedConfig.methods).forEach(key => {
        if (typeof wrappedConfig.methods[key] === 'function') {
          wrappedConfig.methods[key] = this.wrapComponentMethod(key, wrappedConfig.methods[key], wrappedConfig);
        }
      });
    }

    // 包装生命周期
    if (wrappedConfig.lifetimes) {
      Object.keys(wrappedConfig.lifetimes).forEach(key => {
        if (typeof wrappedConfig.lifetimes[key] === 'function') {
          wrappedConfig.lifetimes[key] = this.wrapLifecycle(key, wrappedConfig.lifetimes[key], wrappedConfig);
        }
      });
    }

    return wrappedConfig;
  }

  /**
   * 获取错误统计
   */
  getErrorStats() {
    return errorHandler.getErrorStats();
  }

  /**
   * 清理错误日志
   */
  clearErrorLogs() {
    return errorHandler.clearErrorLogs();
  }

  /**
   * 手动报告错误
   */
  reportError(error, context = {}) {
    return errorHandler.handleUIError(error, 'manual_report', context);
  }
}

// 创建单例实例
const errorHelper = new ErrorHelper();

// 导出便捷方法
module.exports = {
  errorHelper,
  
  // 便捷的包装函数
  safeAsync: errorHelper.safeAsync.bind(errorHelper),
  safeStorage: errorHelper.safeStorage,
  safeApiCall: errorHelper.safeApiCall.bind(errorHelper),
  safePayment: errorHelper.safePayment.bind(errorHelper),
  
  wrapPage: errorHelper.wrapPage.bind(errorHelper),
  wrapComponent: errorHelper.wrapComponent.bind(errorHelper),
  
  handleImageError: errorHelper.handleImageError.bind(errorHelper),
  handleValidationError: errorHelper.handleValidationError.bind(errorHelper),
  
  withNetworkCheck: errorHelper.withNetworkCheck.bind(errorHelper),
  withPermissionCheck: errorHelper.withPermissionCheck.bind(errorHelper),
  
  getErrorStats: errorHelper.getErrorStats.bind(errorHelper),
  clearErrorLogs: errorHelper.clearErrorLogs.bind(errorHelper),
  reportError: errorHelper.reportError.bind(errorHelper)
};