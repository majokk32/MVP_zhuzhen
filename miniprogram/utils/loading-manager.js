/**
 * 智能加载状态管理器
 * 提供统一的加载状态管理，包括防抖、超时处理、错误重试等
 */
class LoadingManager {
  constructor(context) {
    this.context = context; // 页面或组件实例
    this.loadingTasks = new Map(); // 正在加载的任务
    this.loadingTimers = new Map(); // 加载超时定时器
    this.retryConfig = new Map(); // 重试配置
    this.globalConfig = {
      defaultTimeout: 15000, // 默认超时时间15秒
      maxRetries: 3, // 最大重试次数
      retryDelay: 1000, // 重试延迟时间
      enableDebounce: true, // 启用防抖
      debounceDelay: 300 // 防抖延迟时间
    };
  }

  /**
   * 开始加载
   * @param {string} taskName 任务名称
   * @param {object} options 选项
   * @param {number} options.timeout 超时时间
   * @param {boolean} options.showGlobalLoading 是否显示全局loading
   * @param {string} options.loadingText 加载文本
   * @param {Function} options.onTimeout 超时回调
   */
  startLoading(taskName, options = {}) {
    const {
      timeout = this.globalConfig.defaultTimeout,
      showGlobalLoading = false,
      loadingText = '加载中...',
      onTimeout
    } = options;

    // 如果任务已在加载中，直接返回
    if (this.isLoading(taskName)) {
      return;
    }

    // 记录加载任务
    this.loadingTasks.set(taskName, {
      startTime: Date.now(),
      options
    });

    // 更新页面加载状态
    this.updateLoadingState(taskName, true);

    // 显示全局loading
    if (showGlobalLoading) {
      wx.showLoading({
        title: loadingText,
        mask: true
      });
    }

    // 设置超时定时器
    if (timeout > 0) {
      const timer = setTimeout(() => {
        this.handleTimeout(taskName, onTimeout);
      }, timeout);
      
      this.loadingTimers.set(taskName, timer);
    }
  }

  /**
   * 结束加载
   * @param {string} taskName 任务名称
   * @param {object} result 结果数据
   * @param {boolean} result.success 是否成功
   * @param {string} result.error 错误信息
   * @param {any} result.data 数据
   */
  endLoading(taskName, result = {}) {
    const { success = true, error, data } = result;

    // 清理任务记录
    this.clearTask(taskName);

    // 更新页面加载状态
    this.updateLoadingState(taskName, false, { success, error, data });

    // 隐藏全局loading
    wx.hideLoading();

    // 如果失败且配置了重试，进行重试
    if (!success && this.canRetry(taskName)) {
      this.scheduleRetry(taskName, error);
    }
  }

  /**
   * 处理超时
   */
  handleTimeout(taskName, onTimeout) {
    console.warn(`任务 ${taskName} 加载超时`);
    
    if (onTimeout && typeof onTimeout === 'function') {
      onTimeout();
    } else {
      // 默认超时处理
      this.endLoading(taskName, {
        success: false,
        error: '网络请求超时，请检查网络后重试'
      });
    }
  }

  /**
   * 配置重试
   */
  configRetry(taskName, retryFunction, maxRetries = this.globalConfig.maxRetries) {
    this.retryConfig.set(taskName, {
      function: retryFunction,
      maxRetries,
      currentRetries: 0
    });
  }

  /**
   * 检查是否可以重试
   */
  canRetry(taskName) {
    const config = this.retryConfig.get(taskName);
    return config && config.currentRetries < config.maxRetries;
  }

  /**
   * 安排重试
   */
  scheduleRetry(taskName, error) {
    const config = this.retryConfig.get(taskName);
    if (!config) return;

    config.currentRetries++;
    
    const delay = this.globalConfig.retryDelay * config.currentRetries;
    
    setTimeout(() => {
      console.log(`重试任务 ${taskName}，第 ${config.currentRetries} 次`);
      config.function();
    }, delay);
  }

  /**
   * 手动重试
   */
  retry(taskName) {
    const config = this.retryConfig.get(taskName);
    if (config && config.function) {
      config.currentRetries = 0; // 重置重试次数
      config.function();
    }
  }

  /**
   * 检查是否正在加载
   */
  isLoading(taskName) {
    return this.loadingTasks.has(taskName);
  }

  /**
   * 获取加载进度
   */
  getLoadingProgress(taskName) {
    const task = this.loadingTasks.get(taskName);
    if (!task) return 0;

    const { startTime, options } = task;
    const { timeout = this.globalConfig.defaultTimeout } = options;
    
    const elapsed = Date.now() - startTime;
    return Math.min((elapsed / timeout) * 100, 99); // 最大99%，避免在完成前显示100%
  }

  /**
   * 批量加载管理
   */
  async loadBatch(tasks) {
    const results = {};
    const promises = tasks.map(async (task) => {
      const { name, loader, options = {} } = task;
      
      this.startLoading(name, options);
      
      try {
        const data = await loader();
        this.endLoading(name, { success: true, data });
        results[name] = { success: true, data };
      } catch (error) {
        this.endLoading(name, { success: false, error: error.message });
        results[name] = { success: false, error };
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * 更新页面加载状态
   */
  updateLoadingState(taskName, isLoading, result = {}) {
    const stateKey = `${taskName}Loading`;
    const errorKey = `${taskName}Error`;
    const dataKey = `${taskName}Data`;
    
    const updateData = { [stateKey]: isLoading };
    
    if (!isLoading && result) {
      const { success, error, data } = result;
      
      if (!success && error) {
        updateData[errorKey] = error;
      } else if (success && data !== undefined) {
        updateData[dataKey] = data;
        updateData[errorKey] = null;
      }
    }
    
    if (this.context.setData) {
      this.context.setData(updateData);
    }
  }

  /**
   * 清理任务
   */
  clearTask(taskName) {
    // 清理任务记录
    this.loadingTasks.delete(taskName);
    
    // 清理定时器
    const timer = this.loadingTimers.get(taskName);
    if (timer) {
      clearTimeout(timer);
      this.loadingTimers.delete(taskName);
    }
  }

  /**
   * 清理所有任务
   */
  clearAll() {
    // 清理所有定时器
    this.loadingTimers.forEach(timer => clearTimeout(timer));
    
    // 清理所有数据
    this.loadingTasks.clear();
    this.loadingTimers.clear();
    this.retryConfig.clear();
    
    // 隐藏全局loading
    wx.hideLoading();
  }

  /**
   * 获取加载统计信息
   */
  getStats() {
    return {
      activeTasks: this.loadingTasks.size,
      totalRetries: Array.from(this.retryConfig.values())
        .reduce((sum, config) => sum + config.currentRetries, 0),
      avgLoadingTime: this.calculateAverageLoadingTime()
    };
  }

  /**
   * 计算平均加载时间
   */
  calculateAverageLoadingTime() {
    const tasks = Array.from(this.loadingTasks.values());
    if (tasks.length === 0) return 0;
    
    const now = Date.now();
    const totalTime = tasks.reduce((sum, task) => sum + (now - task.startTime), 0);
    return Math.round(totalTime / tasks.length);
  }

  /**
   * 设置全局配置
   */
  setConfig(config) {
    Object.assign(this.globalConfig, config);
  }
}

/**
 * 创建加载管理器实例
 */
function createLoadingManager(context) {
  return new LoadingManager(context);
}

module.exports = {
  LoadingManager,
  createLoadingManager
};