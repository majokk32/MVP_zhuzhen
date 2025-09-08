/**
 * 微信通知消息优化模块 - Phase 2 微信生态集成
 * 
 * 特性:
 * - 智能订阅消息管理
 * - 通知消息调度和批处理
 * - 用户偏好管理
 * - 消息发送优化
 * - 用户参与度追踪
 */

const app = getApp();

class NotificationModule {
  constructor() {
    // 通知模板配置
    this.templates = {
      // 任务提醒
      taskReminder: {
        templateId: 'task_reminder_template_id',
        title: '任务提醒',
        description: '新任务发布提醒',
        keywords: ['任务名称', '发布时间', '截止时间'],
        priority: 'high',
        category: 'task'
      },
      // 批改完成通知
      gradingComplete: {
        templateId: 'grading_complete_template_id', 
        title: '批改完成',
        description: '作业批改完成通知',
        keywords: ['任务名称', '批改结果', '查看时间'],
        priority: 'high',
        category: 'grading'
      },
      // 截止时间提醒
      deadline: {
        templateId: 'deadline_template_id',
        title: '截止提醒', 
        description: '任务即将截止提醒',
        keywords: ['任务名称', '剩余时间', '提醒时间'],
        priority: 'medium',
        category: 'reminder'
      },
      // 学习进度报告
      progressReport: {
        templateId: 'progress_report_template_id',
        title: '学习报告',
        description: '每周学习进度报告',
        keywords: ['学习天数', '完成任务', '进度排名'],
        priority: 'low',
        category: 'report'
      },
      // 系统消息
      systemMessage: {
        templateId: 'system_message_template_id',
        title: '系统消息',
        description: '系统重要通知',
        keywords: ['消息内容', '发送时间', '操作提醒'],
        priority: 'high',
        category: 'system'
      }
    };

    // 用户通知偏好缓存
    this.userPreferences = null;
    
    // 消息发送队列
    this.messageQueue = [];
    
    // 批处理配置
    this.batchConfig = {
      batchSize: 10,
      batchInterval: 5000, // 5秒
      retryLimit: 3,
      retryDelay: 2000
    };
    
    // 用户参与度数据
    this.engagementData = {
      clickRate: 0,
      openRate: 0,
      subscribeRate: 0,
      lastUpdate: null
    };
    
    this.init();
  }

  /**
   * 初始化通知模块
   */
  async init() {
    try {
      // 加载用户通知偏好
      await this.loadUserPreferences();
      
      // 启动消息队列处理器
      this.startBatchProcessor();
      
      // 初始化参与度追踪
      this.initEngagementTracking();
      
      console.log('通知模块初始化完成');
    } catch (error) {
      console.error('通知模块初始化失败:', error);
    }
  }

  /**
   * 请求订阅消息权限
   * @param {Array} templateIds - 模板ID数组
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 订阅结果
   */
  async requestSubscribeMessage(templateIds, options = {}) {
    try {
      // 检查是否已订阅过
      const subscriptionStatus = await this.getSubscriptionStatus(templateIds);
      const needSubscribe = templateIds.filter(id => 
        !subscriptionStatus[id] || subscriptionStatus[id] === 'reject'
      );
      
      if (needSubscribe.length === 0) {
        return { success: true, alreadySubscribed: true };
      }

      // 智能订阅策略：根据用户历史行为决定请求数量
      const smartTemplateIds = this.optimizeSubscriptionRequest(needSubscribe, options);
      
      const result = await this.performSubscribeRequest(smartTemplateIds, options);
      
      // 记录订阅结果
      await this.recordSubscriptionResult(result);
      
      return result;
    } catch (error) {
      console.error('请求订阅消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 执行订阅请求
   */
  performSubscribeRequest(templateIds, options) {
    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: templateIds,
        success: (res) => {
          const result = this.parseSubscriptionResult(res, templateIds);
          resolve(result);
        },
        fail: (error) => {
          console.error('订阅消息请求失败:', error);
          resolve({
            success: false,
            error: error.errMsg || '订阅请求失败'
          });
        }
      });
    });
  }

  /**
   * 解析订阅结果
   */
  parseSubscriptionResult(res, templateIds) {
    const result = {
      success: true,
      subscriptions: {},
      acceptedCount: 0,
      rejectedCount: 0
    };

    templateIds.forEach(templateId => {
      const status = res[templateId];
      result.subscriptions[templateId] = status;
      
      if (status === 'accept') {
        result.acceptedCount++;
      } else if (status === 'reject') {
        result.rejectedCount++;
      }
    });

    return result;
  }

  /**
   * 智能订阅优化
   */
  optimizeSubscriptionRequest(templateIds, options) {
    const userPrefs = this.userPreferences;
    if (!userPrefs) return templateIds;

    // 根据用户历史行为优化请求
    const sortedTemplates = templateIds
      .map(id => ({
        id,
        template: this.templates[Object.keys(this.templates).find(key => 
          this.templates[key].templateId === id
        )],
        priority: this.getTemplatePriority(id)
      }))
      .sort((a, b) => {
        // 按优先级和用户偏好排序
        const aPriority = this.calculateTemplatePriority(a);
        const bPriority = this.calculateTemplatePriority(b);
        return bPriority - aPriority;
      })
      .slice(0, options.maxRequest || 3) // 限制同时请求的数量
      .map(item => item.id);

    return sortedTemplates;
  }

  /**
   * 计算模板优先级
   */
  calculateTemplatePriority(templateInfo) {
    const baseScore = templateInfo.template?.priority === 'high' ? 3 : 
                     templateInfo.template?.priority === 'medium' ? 2 : 1;
    
    // 根据用户偏好调整分数
    const userPref = this.userPreferences?.categories?.[templateInfo.template?.category] || 1;
    
    return baseScore * userPref;
  }

  /**
   * 发送模板消息（批量优化）
   * @param {Object} messageData - 消息数据
   * @returns {Promise<Object>} 发送结果
   */
  async sendTemplateMessage(messageData) {
    try {
      // 验证消息数据
      this.validateMessageData(messageData);
      
      // 检查用户订阅状态
      const subscriptionStatus = await this.checkSubscriptionStatus(messageData.templateId);
      if (!subscriptionStatus.canSend) {
        return { 
          success: false, 
          error: 'User not subscribed or subscription expired',
          needResubscribe: true
        };
      }

      // 添加到消息队列
      const messageId = this.addToQueue(messageData);
      
      return { 
        success: true, 
        messageId,
        queued: true,
        estimatedSendTime: this.calculateEstimatedSendTime()
      };
      
    } catch (error) {
      console.error('发送模板消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 批量发送消息
   */
  async batchSendMessages(messages) {
    const results = [];
    const chunks = this.chunkArray(messages, this.batchConfig.batchSize);
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(message => this.sendSingleMessage(message))
      );
      
      results.push(...chunkResults);
      
      // 添加间隔，避免频率限制
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await this.delay(this.batchConfig.batchInterval);
      }
    }
    
    return this.aggregateBatchResults(results);
  }

  /**
   * 发送单条消息
   */
  async sendSingleMessage(messageData) {
    try {
      const response = await app.request({
        url: '/api/v1/notifications/send-template',
        method: 'POST',
        data: {
          openid: messageData.openid || app.globalData.userInfo?.openid,
          templateId: messageData.templateId,
          data: messageData.data,
          miniprogram: messageData.miniprogram || {
            appid: app.globalData.appId,
            pagepath: messageData.page || 'pages/index/index'
          }
        }
      });

      if (response.data.code === 200) {
        // 记录发送成功
        this.recordSendSuccess(messageData);
        return { success: true, data: response.data.data };
      } else {
        throw new Error(response.data.message || '发送失败');
      }
    } catch (error) {
      console.error('单条消息发送失败:', error);
      this.recordSendFailure(messageData, error);
      throw error;
    }
  }

  /**
   * 启动批处理器
   */
  startBatchProcessor() {
    setInterval(() => {
      if (this.messageQueue.length > 0) {
        this.processBatch();
      }
    }, this.batchConfig.batchInterval);
  }

  /**
   * 处理批次
   */
  async processBatch() {
    const batch = this.messageQueue.splice(0, this.batchConfig.batchSize);
    
    if (batch.length === 0) return;
    
    try {
      const results = await this.batchSendMessages(batch);
      console.log('批处理完成:', results);
    } catch (error) {
      console.error('批处理失败:', error);
      // 失败的消息重新加入队列（如果重试次数未超限）
      this.handleBatchFailure(batch, error);
    }
  }

  /**
   * 处理批次失败
   */
  handleBatchFailure(batch, error) {
    batch.forEach(message => {
      if (message.retryCount < this.batchConfig.retryLimit) {
        message.retryCount = (message.retryCount || 0) + 1;
        
        // 延迟重试
        setTimeout(() => {
          this.messageQueue.push(message);
        }, this.batchConfig.retryDelay * message.retryCount);
      } else {
        // 超过重试限制，记录失败
        this.recordPermanentFailure(message, error);
      }
    });
  }

  /**
   * 用户偏好管理
   */
  async loadUserPreferences() {
    try {
      const preferences = wx.getStorageSync('notification_preferences');
      if (preferences) {
        this.userPreferences = preferences;
      } else {
        // 创建默认偏好
        this.userPreferences = this.createDefaultPreferences();
        await this.saveUserPreferences();
      }
    } catch (error) {
      console.error('加载用户偏好失败:', error);
      this.userPreferences = this.createDefaultPreferences();
    }
  }

  /**
   * 创建默认偏好
   */
  createDefaultPreferences() {
    return {
      enabled: true,
      categories: {
        task: 1.0,      // 任务相关
        grading: 1.0,   // 批改相关
        reminder: 0.8,  // 提醒类
        report: 0.6,    // 报告类
        system: 1.0     // 系统消息
      },
      timePreferences: {
        morningStart: 9,   // 早上开始时间
        morningEnd: 12,    // 早上结束时间
        afternoonStart: 14, // 下午开始时间
        afternoonEnd: 18,   // 下午结束时间
        eveningStart: 19,   // 晚上开始时间
        eveningEnd: 21      // 晚上结束时间
      },
      frequency: {
        immediate: ['task', 'grading', 'system'],
        daily: ['reminder'],
        weekly: ['report']
      },
      lastUpdated: Date.now()
    };
  }

  /**
   * 保存用户偏好
   */
  async saveUserPreferences() {
    try {
      this.userPreferences.lastUpdated = Date.now();
      wx.setStorageSync('notification_preferences', this.userPreferences);
    } catch (error) {
      console.error('保存用户偏好失败:', error);
    }
  }

  /**
   * 更新用户偏好
   */
  async updateUserPreferences(updates) {
    try {
      this.userPreferences = { ...this.userPreferences, ...updates };
      await this.saveUserPreferences();
      return { success: true };
    } catch (error) {
      console.error('更新用户偏好失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 初始化参与度追踪
   */
  initEngagementTracking() {
    // 加载历史参与度数据
    try {
      const stored = wx.getStorageSync('notification_engagement');
      if (stored) {
        this.engagementData = { ...this.engagementData, ...stored };
      }
    } catch (error) {
      console.error('加载参与度数据失败:', error);
    }
  }

  /**
   * 记录用户参与
   */
  recordUserEngagement(type, templateId, action) {
    const engagement = {
      type,
      templateId,
      action, // 'click', 'open', 'dismiss'
      timestamp: Date.now()
    };

    // 更新统计数据
    this.updateEngagementStats(engagement);
    
    // 保存记录
    this.saveEngagementRecord(engagement);
  }

  /**
   * 更新参与度统计
   */
  updateEngagementStats(engagement) {
    // 这里可以实现更复杂的统计逻辑
    const records = this.getRecentEngagementRecords();
    
    if (records.length > 0) {
      const clicks = records.filter(r => r.action === 'click').length;
      const opens = records.filter(r => r.action === 'open').length;
      const total = records.length;
      
      this.engagementData.clickRate = clicks / total;
      this.engagementData.openRate = opens / total;
      this.engagementData.lastUpdate = Date.now();
      
      // 保存更新的统计数据
      wx.setStorageSync('notification_engagement', this.engagementData);
    }
  }

  /**
   * 获取通知设置面板数据
   */
  getNotificationSettings() {
    return {
      preferences: this.userPreferences,
      templates: Object.keys(this.templates).map(key => ({
        key,
        ...this.templates[key]
      })),
      engagement: this.engagementData,
      queueStatus: {
        pending: this.messageQueue.length,
        lastProcessed: this.lastBatchTime
      }
    };
  }

  /**
   * 智能推荐通知设置
   */
  getRecommendedSettings() {
    const recommendations = [];
    
    // 基于参与度推荐
    if (this.engagementData.openRate < 0.3) {
      recommendations.push({
        type: 'frequency',
        suggestion: 'reduce',
        reason: '打开率较低，建议减少通知频率'
      });
    }
    
    // 基于时间偏好推荐
    const currentHour = new Date().getHours();
    if (currentHour < 9 || currentHour > 21) {
      recommendations.push({
        type: 'timing',
        suggestion: 'adjust_schedule',
        reason: '当前时间不在最佳通知时间段'
      });
    }
    
    return recommendations;
  }

  // ==================== 工具方法 ====================

  validateMessageData(messageData) {
    if (!messageData.templateId) {
      throw new Error('templateId is required');
    }
    if (!messageData.data) {
      throw new Error('message data is required');
    }
  }

  addToQueue(messageData) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.messageQueue.push({
      id: messageId,
      ...messageData,
      createdAt: Date.now(),
      retryCount: 0
    });
    
    return messageId;
  }

  calculateEstimatedSendTime() {
    const queuePosition = this.messageQueue.length;
    const batchTime = Math.ceil(queuePosition / this.batchConfig.batchSize) * this.batchConfig.batchInterval;
    return Date.now() + batchTime;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  recordSendSuccess(messageData) {
    // 记录成功发送的统计
    console.log('消息发送成功:', messageData.id);
  }

  recordSendFailure(messageData, error) {
    // 记录发送失败的统计
    console.error('消息发送失败:', messageData.id, error.message);
  }

  recordPermanentFailure(messageData, error) {
    // 记录永久失败的消息
    console.error('消息永久失败:', messageData.id, error.message);
  }

  getSubscriptionStatus(templateIds) {
    // 获取订阅状态（从缓存或API）
    // 这里可以实现更复杂的状态检查逻辑
    return {};
  }

  checkSubscriptionStatus(templateId) {
    // 检查单个模板的订阅状态
    return { canSend: true };
  }

  aggregateBatchResults(results) {
    const summary = {
      total: results.length,
      success: 0,
      failed: 0,
      errors: []
    };
    
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        summary.success++;
      } else {
        summary.failed++;
        summary.errors.push(result.reason?.message || 'Unknown error');
      }
    });
    
    return summary;
  }

  getRecentEngagementRecords() {
    // 获取最近的参与度记录
    // 这里可以从存储中获取历史记录
    return [];
  }

  saveEngagementRecord(engagement) {
    // 保存参与度记录
    try {
      const records = wx.getStorageSync('engagement_records') || [];
      records.push(engagement);
      
      // 只保留最近1000条记录
      const recentRecords = records.slice(-1000);
      wx.setStorageSync('engagement_records', recentRecords);
    } catch (error) {
      console.error('保存参与度记录失败:', error);
    }
  }

  getTemplatePriority(templateId) {
    const templateKey = Object.keys(this.templates).find(key => 
      this.templates[key].templateId === templateId
    );
    return this.templates[templateKey]?.priority || 'low';
  }
}

// 创建全局实例
const notificationModule = new NotificationModule();

module.exports = notificationModule;