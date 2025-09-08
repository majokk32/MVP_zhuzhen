// components/loading-state/loading-state.js
/**
 * 通用加载状态组件
 * 提供统一的加载、错误、空状态展示
 */
Component({
  properties: {
    // 是否显示加载状态
    loading: {
      type: Boolean,
      value: false
    },
    
    // 是否有错误
    hasError: {
      type: Boolean,
      value: false
    },
    
    // 是否为空状态
    isEmpty: {
      type: Boolean,
      value: false
    },
    
    // 加载文本
    loadingText: {
      type: String,
      value: '加载中...'
    },
    
    // 错误信息
    errorText: {
      type: String,
      value: '加载失败'
    },
    
    // 空状态文本
    emptyText: {
      type: String,
      value: '暂无数据'
    },
    
    // 错误图标
    errorIcon: {
      type: String,
      value: '❌'
    },
    
    // 空状态图标
    emptyIcon: {
      type: String,
      value: '📂'
    },
    
    // 是否显示重试按钮
    showRetry: {
      type: Boolean,
      value: true
    },
    
    // 重试按钮文字
    retryText: {
      type: String,
      value: '重试'
    },
    
    // 加载状态类型：spinner | dots | pulse
    loadingType: {
      type: String,
      value: 'spinner'
    },
    
    // 自定义样式类
    customClass: {
      type: String,
      value: ''
    }
  },

  data: {
    // 点状加载动画
    dotsAnimation: '.'
  },

  lifetimes: {
    attached() {
      this.startDotsAnimation();
    },
    
    detached() {
      this.clearDotsAnimation();
    }
  },

  observers: {
    'loading': function(loading) {
      if (loading) {
        this.startDotsAnimation();
      } else {
        this.clearDotsAnimation();
      }
    }
  },

  methods: {
    /**
     * 开始点状加载动画
     */
    startDotsAnimation() {
      if (this.properties.loadingType !== 'dots') return;
      
      this.dotsTimer = setInterval(() => {
        const currentDots = this.data.dotsAnimation;
        let newDots;
        
        if (currentDots === '.') {
          newDots = '..';
        } else if (currentDots === '..') {
          newDots = '...';
        } else {
          newDots = '.';
        }
        
        this.setData({ dotsAnimation: newDots });
      }, 500);
    },

    /**
     * 清除点状加载动画
     */
    clearDotsAnimation() {
      if (this.dotsTimer) {
        clearInterval(this.dotsTimer);
        this.dotsTimer = null;
      }
    },

    /**
     * 重试按钮点击
     */
    onRetry() {
      this.triggerEvent('retry');
    },

    /**
     * 空状态操作按钮点击
     */
    onEmptyAction() {
      this.triggerEvent('emptyAction');
    }
  }
});