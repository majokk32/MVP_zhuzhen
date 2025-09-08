// components/error-dialog/error-dialog.js
/**
 * 用户友好的错误对话框组件
 * 提供统一的错误展示和处理界面
 */
Component({
  properties: {
    // 是否显示错误对话框
    show: {
      type: Boolean,
      value: false
    },
    
    // 错误类型
    errorType: {
      type: String,
      value: 'unknown'
    },
    
    // 错误标题
    title: {
      type: String,
      value: '出现了一些问题'
    },
    
    // 错误描述
    message: {
      type: String,
      value: ''
    },
    
    // 错误代码（可选）
    errorCode: {
      type: String,
      value: ''
    },
    
    // 是否显示重试按钮
    showRetry: {
      type: Boolean,
      value: true
    },
    
    // 是否显示反馈按钮
    showFeedback: {
      type: Boolean,
      value: true
    },
    
    // 是否显示详情按钮
    showDetails: {
      type: Boolean,
      value: false
    },
    
    // 错误详情
    details: {
      type: String,
      value: ''
    },
    
    // 自定义建议
    suggestions: {
      type: Array,
      value: []
    }
  },

  data: {
    // 显示详情
    showDetailInfo: false,
    
    // 错误类型配置
    errorConfigs: {
      network: {
        icon: '🌐',
        iconColor: '#ff6b6b',
        title: '网络连接异常',
        defaultMessage: '请检查网络连接后重试',
        suggestions: [
          '检查网络连接是否正常',
          '尝试切换到其他网络',
          '稍后再试'
        ]
      },
      server: {
        icon: '🔧',
        iconColor: '#ffa726',
        title: '服务暂时不可用',
        defaultMessage: '服务器繁忙，请稍后重试',
        suggestions: [
          '请稍后再试',
          '如果问题持续存在，请联系客服'
        ]
      },
      permission: {
        icon: '🔐',
        iconColor: '#42a5f5',
        title: '权限不足',
        defaultMessage: '您没有权限执行此操作',
        suggestions: [
          '检查账户权限设置',
          '联系管理员获取权限',
          '升级为付费用户'
        ]
      },
      payment: {
        icon: '💳',
        iconColor: '#ab47bc',
        title: '支付异常',
        defaultMessage: '支付过程中出现问题',
        suggestions: [
          '检查账户余额是否充足',
          '尝试其他支付方式',
          '联系客服处理'
        ]
      },
      data: {
        icon: '📂',
        iconColor: '#66bb6a',
        title: '数据异常',
        defaultMessage: '数据处理出现问题',
        suggestions: [
          '刷新页面重新加载',
          '清除缓存后重试',
          '检查数据格式是否正确'
        ]
      },
      unknown: {
        icon: '❓',
        iconColor: '#78909c',
        title: '未知错误',
        defaultMessage: '出现了未知的问题',
        suggestions: [
          '重启应用程序',
          '检查系统是否有更新',
          '联系技术支持'
        ]
      }
    }
  },

  methods: {
    /**
     * 获取当前错误配置
     */
    getCurrentErrorConfig() {
      const config = this.data.errorConfigs[this.properties.errorType] || this.data.errorConfigs.unknown;
      return {
        ...config,
        title: this.properties.title || config.title,
        message: this.properties.message || config.defaultMessage,
        suggestions: this.properties.suggestions.length > 0 ? this.properties.suggestions : config.suggestions
      };
    },

    /**
     * 重试操作
     */
    onRetry() {
      this.triggerEvent('retry');
    },

    /**
     * 反馈问题
     */
    onFeedback() {
      this.triggerEvent('feedback');
    },

    /**
     * 切换详情显示
     */
    toggleDetails() {
      this.setData({
        showDetailInfo: !this.data.showDetailInfo
      });
    },

    /**
     * 关闭对话框
     */
    onClose() {
      this.triggerEvent('close');
    },

    /**
     * 复制错误信息
     */
    onCopyError() {
      const config = this.getCurrentErrorConfig();
      const errorInfo = `错误类型: ${config.title}\n错误信息: ${config.message}`;
      
      if (this.properties.errorCode) {
        errorInfo += `\n错误代码: ${this.properties.errorCode}`;
      }
      
      if (this.properties.details) {
        errorInfo += `\n详细信息: ${this.properties.details}`;
      }
      
      wx.setClipboardData({
        data: errorInfo,
        success: () => {
          wx.showToast({
            title: '错误信息已复制',
            icon: 'success'
          });
        }
      });
    },

    /**
     * 联系客服
     */
    onContactSupport() {
      this.triggerEvent('contactSupport');
    },

    /**
     * 获取解决建议
     */
    onGetSuggestions() {
      const config = this.getCurrentErrorConfig();
      const suggestions = config.suggestions.join('\n• ');
      
      wx.showModal({
        title: '解决建议',
        content: '• ' + suggestions,
        confirmText: '我知道了',
        showCancel: false
      });
    },

    /**
     * 阻止冒泡
     */
    preventTap() {
      // 阻止点击事件冒泡到遮罩层
    }
  }
});