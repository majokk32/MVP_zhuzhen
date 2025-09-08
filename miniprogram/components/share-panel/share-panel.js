// components/share-panel/share-panel.js
const sharingModule = require('../../modules/sharing/sharing');

Component({
  properties: {
    // 是否显示分享面板
    show: {
      type: Boolean,
      value: false
    },
    // 分享内容类型
    shareType: {
      type: String,
      value: 'app' // 'task', 'achievement', 'report', 'ranking', 'app', 'invite'
    },
    // 分享数据
    shareData: {
      type: Object,
      value: {}
    },
    // 分享选项
    shareOptions: {
      type: Object,
      value: {}
    },
    // 面板模式
    mode: {
      type: String,
      value: 'full' // 'full', 'simple', 'floating'
    }
  },

  data: {
    // 分享内容
    shareContent: null,
    
    // 分享渠道
    shareChannels: [
      {
        id: 'wechat',
        name: '微信好友',
        icon: '💬',
        color: '#1AAD19',
        type: 'message',
        available: true
      },
      {
        id: 'moments',
        name: '朋友圈',
        icon: '📷',
        color: '#1AAD19',
        type: 'timeline',
        available: true
      },
      {
        id: 'copy',
        name: '复制链接',
        icon: '🔗',
        color: '#576b95',
        type: 'copy',
        available: true
      },
      {
        id: 'qrcode',
        name: '生成二维码',
        icon: '📱',
        color: '#ed6a0c',
        type: 'qrcode',
        available: true
      }
    ],
    
    // 分享推荐
    shareRecommendations: [],
    
    // 分享统计
    shareStats: {},
    
    // UI状态
    loading: false,
    showQRCode: false,
    qrCodeData: '',
    
    // 自定义分享文案
    customTitle: '',
    showCustomTitle: false
  },

  observers: {
    'show,shareType,shareData': function(show, shareType, shareData) {
      if (show && shareType && shareData) {
        this.prepareShareContent();
      }
    }
  },

  lifetimes: {
    attached() {
      this.initComponent();
    }
  },

  methods: {
    /**
     * 初始化组件
     */
    async initComponent() {
      try {
        // 获取分享统计
        const shareStats = sharingModule.getShareAnalytics();
        this.setData({ shareStats });
        
        console.log('分享面板初始化完成');
      } catch (error) {
        console.error('分享面板初始化失败:', error);
      }
    },

    /**
     * 准备分享内容
     */
    async prepareShareContent() {
      try {
        this.setData({ loading: true });
        
        // 生成分享内容
        const shareContent = sharingModule.generateShareContent(
          this.properties.shareType,
          this.properties.shareData,
          this.properties.shareOptions
        );
        
        // 获取分享推荐
        const userContext = this.buildUserContext();
        const recommendations = sharingModule.getShareRecommendations(userContext);
        
        this.setData({
          shareContent,
          shareRecommendations: recommendations.slice(0, 3), // 只显示前3个推荐
          customTitle: shareContent.title,
          loading: false
        });
        
      } catch (error) {
        console.error('准备分享内容失败:', error);
        this.setData({ loading: false });
      }
    },

    /**
     * 分享到微信好友
     */
    async onShareToWechat() {
      try {
        const shareContent = this.getFinalShareContent();
        
        // 调用微信分享API
        wx.shareAppMessage({
          title: shareContent.title,
          path: shareContent.path,
          imageUrl: shareContent.imageUrl,
          success: (res) => {
            this.onShareSuccess('wechat', shareContent, res);
          },
          fail: (error) => {
            this.onShareFail('wechat', error);
          }
        });
        
      } catch (error) {
        console.error('微信分享失败:', error);
        this.onShareFail('wechat', error);
      }
    },

    /**
     * 分享到朋友圈
     */
    async onShareToMoments() {
      try {
        const shareContent = this.getFinalShareContent();
        
        // 朋友圈分享需要特殊处理
        const timelineContent = {
          ...shareContent,
          shareToTimeline: true
        };
        
        const optimizedContent = sharingModule.generateShareContent(
          this.properties.shareType,
          this.properties.shareData,
          { ...this.properties.shareOptions, shareToTimeline: true }
        );
        
        wx.shareTimeline({
          title: optimizedContent.title,
          query: optimizedContent.query || '',
          imageUrl: optimizedContent.imageUrl,
          success: (res) => {
            this.onShareSuccess('moments', optimizedContent, res);
          },
          fail: (error) => {
            this.onShareFail('moments', error);
          }
        });
        
      } catch (error) {
        console.error('朋友圈分享失败:', error);
        this.onShareFail('moments', error);
      }
    },

    /**
     * 复制分享链接
     */
    async onCopyLink() {
      try {
        const shareContent = this.getFinalShareContent();
        
        // 构建完整链接（这里可能需要根据实际情况调整）
        const fullLink = `https://your-domain.com/miniprogram${shareContent.path}`;
        
        wx.setClipboardData({
          data: fullLink,
          success: () => {
            wx.showToast({
              title: '链接已复制',
              icon: 'success'
            });
            
            this.onShareSuccess('copy', shareContent);
          },
          fail: (error) => {
            this.onShareFail('copy', error);
          }
        });
        
      } catch (error) {
        console.error('复制链接失败:', error);
        this.onShareFail('copy', error);
      }
    },

    /**
     * 生成二维码分享
     */
    async onGenerateQRCode() {
      try {
        this.setData({ loading: true });
        
        const shareContent = this.getFinalShareContent();
        
        // 这里需要调用后端API生成小程序码
        // 示例实现
        const qrCodeData = await this.generateMiniProgramCode(shareContent.path);
        
        this.setData({
          showQRCode: true,
          qrCodeData,
          loading: false
        });
        
        this.onShareSuccess('qrcode', shareContent);
        
      } catch (error) {
        console.error('生成二维码失败:', error);
        this.setData({ loading: false });
        this.onShareFail('qrcode', error);
      }
    },

    /**
     * 使用推荐分享
     */
    onUseRecommendation(e) {
      const { recommendation } = e.currentTarget.dataset;
      
      // 更新分享类型和数据
      this.setData({
        [`shareType`]: recommendation.type
      });
      
      // 重新准备分享内容
      this.prepareShareContent();
      
      wx.showToast({
        title: '已切换到推荐内容',
        icon: 'success'
      });
    },

    /**
     * 编辑自定义标题
     */
    onEditCustomTitle() {
      this.setData({ showCustomTitle: !this.data.showCustomTitle });
    },

    /**
     * 更新自定义标题
     */
    onCustomTitleInput(e) {
      this.setData({
        customTitle: e.detail.value
      });
    },

    /**
     * 预览分享效果
     */
    onPreviewShare() {
      const shareContent = this.getFinalShareContent();
      
      wx.showModal({
        title: '分享预览',
        content: `标题: ${shareContent.title}\n路径: ${shareContent.path}`,
        showCancel: false
      });
    },

    /**
     * 查看分享统计
     */
    onViewShareStats() {
      wx.showModal({
        title: '分享统计',
        content: `总分享次数: ${this.data.shareStats.totalShares || 0}\n点击率: ${this.data.shareStats.clickThroughRate || '0%'}`,
        showCancel: false
      });
    },

    /**
     * 关闭面板
     */
    onClose() {
      this.setData({
        showQRCode: false,
        showCustomTitle: false
      });
      
      this.triggerEvent('close');
    },

    /**
     * 关闭二维码
     */
    onCloseQRCode() {
      this.setData({ showQRCode: false });
    },

    // ==================== 私有方法 ====================

    /**
     * 构建用户上下文
     */
    buildUserContext() {
      const app = getApp();
      return {
        currentPage: this.properties.shareType,
        hasNewAchievement: false, // 可以从props或global state获取
        weeklyProgress: 85, // 示例数据
        rankingImproved: true, // 示例数据
        userInfo: app.globalData.userInfo
      };
    },

    /**
     * 获取最终分享内容
     */
    getFinalShareContent() {
      const shareContent = { ...this.data.shareContent };
      
      // 使用自定义标题
      if (this.data.customTitle && this.data.customTitle !== this.data.shareContent.title) {
        shareContent.title = this.data.customTitle;
      }
      
      return shareContent;
    },

    /**
     * 分享成功处理
     */
    onShareSuccess(channel, shareContent, result = {}) {
      try {
        // 记录分享成功
        sharingModule.onShareSuccess(shareContent, {
          channel,
          ...result
        });
        
        // 显示成功提示
        this.showSuccessToast(channel);
        
        // 触发成功事件
        this.triggerEvent('shareSuccess', {
          channel,
          shareContent,
          result
        });
        
        // 关闭面板（延迟关闭让用户看到成功提示）
        setTimeout(() => {
          this.onClose();
        }, 1500);
        
      } catch (error) {
        console.error('分享成功处理失败:', error);
      }
    },

    /**
     * 分享失败处理
     */
    onShareFail(channel, error) {
      console.error(`${channel} 分享失败:`, error);
      
      // 显示失败提示
      wx.showToast({
        title: '分享失败，请重试',
        icon: 'none'
      });
      
      // 触发失败事件
      this.triggerEvent('shareFail', {
        channel,
        error: error.message || error.errMsg || '分享失败'
      });
    },

    /**
     * 显示成功提示
     */
    showSuccessToast(channel) {
      const messages = {
        wechat: '已分享给微信好友',
        moments: '已分享到朋友圈',
        copy: '链接已复制到剪贴板',
        qrcode: '二维码生成成功'
      };
      
      wx.showToast({
        title: messages[channel] || '分享成功',
        icon: 'success'
      });
    },

    /**
     * 生成小程序码（需要后端支持）
     */
    async generateMiniProgramCode(path) {
      try {
        // 这里需要调用后端API
        // 示例返回base64图片数据
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      } catch (error) {
        console.error('生成小程序码失败:', error);
        throw new Error('生成二维码失败');
      }
    },

    /**
     * 获取渠道可用状态
     */
    getChannelAvailability(channelId) {
      // 检查各个分享渠道的可用性
      switch (channelId) {
        case 'wechat':
        case 'moments':
          return true; // 微信环境下始终可用
        case 'copy':
          return wx.canUse && wx.canUse('setClipboardData');
        case 'qrcode':
          return true; // 需要后端支持
        default:
          return false;
      }
    }
  }
});