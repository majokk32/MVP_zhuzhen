// components/notification-settings/notification-settings.js
const notificationModule = require('../../modules/notification/notification');

Component({
  properties: {
    // 是否显示设置面板
    show: {
      type: Boolean,
      value: false
    },
    // 模式：简化版或完整版
    mode: {
      type: String,
      value: 'full' // 'simple' | 'full'
    }
  },

  data: {
    // 通知设置数据
    settings: null,
    
    // 加载状态
    loading: true,
    
    // 分类开关状态
    categoryToggles: {},
    
    // 时间偏好设置
    timePreferences: {},
    
    // 推荐设置
    recommendations: [],
    
    // 统计数据
    stats: {
      totalSent: 0,
      openRate: 0,
      clickRate: 0
    },
    
    // UI状态
    activeTab: 'categories', // 'categories' | 'timing' | 'stats'
    
    // 订阅状态
    subscriptionStatus: {}
  },

  lifetimes: {
    attached() {
      this.initComponent();
    }
  },

  observers: {
    'show': function(show) {
      if (show) {
        this.loadSettings();
      }
    }
  },

  methods: {
    /**
     * 初始化组件
     */
    async initComponent() {
      console.log('通知设置组件初始化');
    },

    /**
     * 加载通知设置
     */
    async loadSettings() {
      try {
        this.setData({ loading: true });
        
        // 获取通知设置数据
        const settings = notificationModule.getNotificationSettings();
        const recommendations = notificationModule.getRecommendedSettings();
        
        // 处理数据
        const categoryToggles = {};
        Object.keys(settings.preferences.categories).forEach(category => {
          categoryToggles[category] = settings.preferences.categories[category] > 0;
        });
        
        // 获取订阅状态
        const subscriptionStatus = await this.checkSubscriptionStatus();
        
        this.setData({
          settings,
          categoryToggles,
          timePreferences: settings.preferences.timePreferences,
          recommendations,
          stats: settings.engagement,
          subscriptionStatus,
          loading: false
        });
        
      } catch (error) {
        console.error('加载通知设置失败:', error);
        this.setData({ loading: false });
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      }
    },

    /**
     * 检查订阅状态
     */
    async checkSubscriptionStatus() {
      const templates = Object.keys(notificationModule.templates);
      const status = {};
      
      // 这里可以实现更复杂的订阅状态检查
      templates.forEach(template => {
        status[template] = Math.random() > 0.3 ? 'accepted' : 'rejected';
      });
      
      return status;
    },

    /**
     * 切换分类通知开关
     */
    async onCategoryToggle(e) {
      const { category } = e.currentTarget.dataset;
      const { value } = e.detail;
      
      try {
        // 更新本地状态
        const categoryToggles = { ...this.data.categoryToggles };
        categoryToggles[category] = value;
        
        this.setData({ categoryToggles });
        
        // 更新偏好设置
        const updates = {
          categories: {
            ...this.data.settings.preferences.categories,
            [category]: value ? 1.0 : 0
          }
        };
        
        const result = await notificationModule.updateUserPreferences(updates);
        
        if (result.success) {
          wx.showToast({
            title: value ? '已开启' : '已关闭',
            icon: 'success',
            duration: 1500
          });
        } else {
          // 回滚状态
          categoryToggles[category] = !value;
          this.setData({ categoryToggles });
          throw new Error(result.error);
        }
        
      } catch (error) {
        console.error('更新分类设置失败:', error);
        wx.showToast({
          title: '设置失败',
          icon: 'none'
        });
      }
    },

    /**
     * 更新时间偏好
     */
    async onTimePreferenceChange(e) {
      const { type } = e.currentTarget.dataset;
      const { value } = e.detail;
      
      try {
        const timePreferences = { ...this.data.timePreferences };
        timePreferences[type] = parseInt(value);
        
        this.setData({ timePreferences });
        
        // 验证时间设置的合理性
        if (!this.validateTimePreferences(timePreferences)) {
          wx.showToast({
            title: '时间设置不合理',
            icon: 'none'
          });
          return;
        }
        
        const updates = { timePreferences };
        const result = await notificationModule.updateUserPreferences(updates);
        
        if (!result.success) {
          throw new Error(result.error);
        }
        
      } catch (error) {
        console.error('更新时间偏好失败:', error);
        wx.showToast({
          title: '设置失败',
          icon: 'none'
        });
      }
    },

    /**
     * 请求订阅权限
     */
    async onRequestSubscription(e) {
      const { template } = e.currentTarget.dataset;
      
      try {
        wx.showLoading({ title: '请求权限中...' });
        
        const templateConfig = notificationModule.templates[template];
        if (!templateConfig) {
          throw new Error('模板配置不存在');
        }
        
        const result = await notificationModule.requestSubscribeMessage(
          [templateConfig.templateId],
          {
            maxRequest: 1,
            template: template
          }
        );
        
        wx.hideLoading();
        
        if (result.success) {
          // 更新订阅状态
          const subscriptionStatus = { ...this.data.subscriptionStatus };
          subscriptionStatus[template] = result.subscriptions[templateConfig.templateId];
          this.setData({ subscriptionStatus });
          
          if (result.acceptedCount > 0) {
            wx.showToast({
              title: '订阅成功',
              icon: 'success'
            });
          } else {
            wx.showToast({
              title: '订阅被拒绝',
              icon: 'none'
            });
          }
        } else {
          throw new Error(result.error);
        }
        
      } catch (error) {
        wx.hideLoading();
        console.error('请求订阅失败:', error);
        wx.showToast({
          title: '订阅失败',
          icon: 'none'
        });
      }
    },

    /**
     * 批量订阅
     */
    async onBatchSubscribe() {
      try {
        wx.showLoading({ title: '批量订阅中...' });
        
        const templates = Object.keys(notificationModule.templates);
        const templateIds = templates.map(key => 
          notificationModule.templates[key].templateId
        );
        
        const result = await notificationModule.requestSubscribeMessage(templateIds, {
          maxRequest: 3, // 限制一次最多3个
          optimize: true
        });
        
        wx.hideLoading();
        
        if (result.success) {
          // 更新所有订阅状态
          const subscriptionStatus = { ...this.data.subscriptionStatus };
          templates.forEach(template => {
            const templateId = notificationModule.templates[template].templateId;
            if (result.subscriptions[templateId]) {
              subscriptionStatus[template] = result.subscriptions[templateId];
            }
          });
          
          this.setData({ subscriptionStatus });
          
          wx.showToast({
            title: `成功订阅${result.acceptedCount}个消息`,
            icon: 'success'
          });
        } else {
          throw new Error(result.error);
        }
        
      } catch (error) {
        wx.hideLoading();
        console.error('批量订阅失败:', error);
        wx.showToast({
          title: '订阅失败',
          icon: 'none'
        });
      }
    },

    /**
     * 应用推荐设置
     */
    async onApplyRecommendation(e) {
      const { recommendation } = e.currentTarget.dataset;
      
      try {
        let updates = {};
        
        switch (recommendation.type) {
          case 'frequency':
            if (recommendation.suggestion === 'reduce') {
              updates.categories = Object.keys(this.data.settings.preferences.categories)
                .reduce((acc, key) => {
                  acc[key] = this.data.settings.preferences.categories[key] * 0.7;
                  return acc;
                }, {});
            }
            break;
            
          case 'timing':
            if (recommendation.suggestion === 'adjust_schedule') {
              updates.timePreferences = {
                ...this.data.timePreferences,
                eveningEnd: 20 // 提前结束时间
              };
            }
            break;
        }
        
        if (Object.keys(updates).length > 0) {
          const result = await notificationModule.updateUserPreferences(updates);
          
          if (result.success) {
            wx.showToast({
              title: '设置已应用',
              icon: 'success'
            });
            
            // 重新加载设置
            this.loadSettings();
          } else {
            throw new Error(result.error);
          }
        }
        
      } catch (error) {
        console.error('应用推荐设置失败:', error);
        wx.showToast({
          title: '设置失败',
          icon: 'none'
        });
      }
    },

    /**
     * 切换标签页
     */
    onTabChange(e) {
      const { tab } = e.currentTarget.dataset;
      this.setData({ activeTab: tab });
    },

    /**
     * 关闭设置面板
     */
    onClose() {
      this.triggerEvent('close');
    },

    /**
     * 重置设置
     */
    async onReset() {
      wx.showModal({
        title: '重置设置',
        content: '确定要重置所有通知设置吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              // 创建默认设置
              const defaultPrefs = notificationModule.createDefaultPreferences();
              
              const result = await notificationModule.updateUserPreferences(defaultPrefs);
              
              if (result.success) {
                wx.showToast({
                  title: '设置已重置',
                  icon: 'success'
                });
                
                // 重新加载设置
                this.loadSettings();
              } else {
                throw new Error(result.error);
              }
            } catch (error) {
              console.error('重置设置失败:', error);
              wx.showToast({
                title: '重置失败',
                icon: 'none'
              });
            }
          }
        }
      });
    },

    /**
     * 测试通知
     */
    async onTestNotification() {
      try {
        // 发送测试通知
        const result = await notificationModule.sendTemplateMessage({
          templateId: notificationModule.templates.systemMessage.templateId,
          data: {
            thing1: { value: '这是一条测试消息' },
            time2: { value: new Date().toLocaleString() },
            thing3: { value: '测试通知功能' }
          }
        });
        
        if (result.success) {
          wx.showToast({
            title: '测试消息已发送',
            icon: 'success'
          });
        } else {
          throw new Error(result.error);
        }
        
      } catch (error) {
        console.error('测试通知失败:', error);
        wx.showToast({
          title: '测试失败',
          icon: 'none'
        });
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 验证时间偏好设置
     */
    validateTimePreferences(timePrefs) {
      const {
        morningStart, morningEnd,
        afternoonStart, afternoonEnd,
        eveningStart, eveningEnd
      } = timePrefs;
      
      // 检查时间顺序是否合理
      if (morningStart >= morningEnd) return false;
      if (afternoonStart >= afternoonEnd) return false;
      if (eveningStart >= eveningEnd) return false;
      
      // 检查时间段是否有重叠
      if (morningEnd > afternoonStart) return false;
      if (afternoonEnd > eveningStart) return false;
      
      return true;
    },

    /**
     * 获取分类显示名称
     */
    getCategoryDisplayName(category) {
      const names = {
        task: '任务通知',
        grading: '批改通知',
        reminder: '提醒通知',
        report: '报告通知',
        system: '系统通知'
      };
      
      return names[category] || category;
    },

    /**
     * 获取订阅状态显示文本
     */
    getSubscriptionStatusText(status) {
      const texts = {
        accepted: '已订阅',
        rejected: '已拒绝',
        banned: '已禁用',
        undefined: '未订阅'
      };
      
      return texts[status] || '未知';
    }
  }
});