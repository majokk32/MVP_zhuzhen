// components/upgrade-guide/upgrade-guide.js
/**
 * 用户升级引导组件
 * 提供友好的试用用户升级体验
 */

const { analytics } = require('../../utils/analytics-helper');

Component({
  properties: {
    // 是否显示升级引导
    show: {
      type: Boolean,
      value: false
    },
    // 引导类型：trial_expired, permission_denied, feature_locked
    guideType: {
      type: String,
      value: 'permission_denied'
    },
    // 被阻止的功能名称
    featureName: {
      type: String,
      value: '此功能'
    },
    // 自定义标题
    customTitle: {
      type: String,
      value: ''
    },
    // 自定义内容
    customContent: {
      type: String,
      value: ''
    }
  },

  data: {
    // 升级信息配置
    upgradeInfo: {
      trial_expired: {
        title: '试用期已过期',
        icon: '⏰',
        iconColor: '#fa8c16',
        content: '您的试用期已结束，升级为付费会员即可继续使用所有功能',
        benefits: [
          '无限制提交作业',
          '查看详细批改结果',
          '个人学习数据分析',
          '优先客服支持'
        ]
      },
      permission_denied: {
        title: '需要升级权限',
        icon: '🔒',
        iconColor: '#1989fa',
        content: '试用用户暂无权限使用此功能，升级为付费会员即可解锁',
        benefits: [
          '完整功能无限制使用',
          '专业学习指导',
          '学习进度追踪',
          '个性化学习建议'
        ]
      },
      feature_locked: {
        title: '功能已锁定',
        icon: '✨',
        iconColor: '#52c41a',
        content: '该功能需要付费会员权限才能使用',
        benefits: [
          '解锁所有高级功能',
          '获得专业学习工具',
          '享受优质服务体验',
          '加入付费学员社群'
        ]
      }
    },

    // 联系方式信息
    contactInfo: {
      wechat: 'your_wechat_id',
      phone: '400-123-4567',
      qq: '123456789'
    }
  },

  lifetimes: {
    attached() {
      this.initUpgradeGuide();
    }
  },

  methods: {
    /**
     * 初始化升级引导
     */
    initUpgradeGuide() {
      // 埋点：升级引导显示
      if (this.properties.show) {
        analytics.track('upgrade_guide_show', {
          guide_type: this.properties.guideType,
          feature_name: this.properties.featureName,
          timestamp: Date.now()
        });
      }
    },

    /**
     * 获取当前引导信息
     */
    getCurrentGuideInfo() {
      const { guideType, customTitle, customContent } = this.properties;
      const defaultInfo = this.data.upgradeInfo[guideType] || this.data.upgradeInfo.permission_denied;
      
      return {
        ...defaultInfo,
        title: customTitle || defaultInfo.title,
        content: customContent || defaultInfo.content
      };
    },

    /**
     * 立即升级按钮点击
     */
    onUpgradeNow() {
      const { guideType, featureName } = this.properties;
      
      // 埋点：升级按钮点击
      analytics.track('upgrade_button_click', {
        guide_type: guideType,
        feature_name: featureName,
        action: 'upgrade_now',
        timestamp: Date.now()
      });

      // 跳转到订阅页面
      wx.navigateTo({
        url: '/pages/subscription/subscription?from=upgrade_guide&guideType=' + guideType
      });

      this.hideGuide();
    },

    /**
     * 联系客服按钮点击
     */
    onContactSupport() {
      const { guideType, featureName } = this.properties;
      
      // 埋点：联系客服点击
      analytics.track('upgrade_button_click', {
        guide_type: guideType,
        feature_name: featureName,
        action: 'contact_support',
        timestamp: Date.now()
      });

      this.showContactOptions();
    },

    /**
     * 显示联系方式选项
     */
    showContactOptions() {
      const { contactInfo } = this.data;
      
      wx.showActionSheet({
        itemList: [
          `微信: ${contactInfo.wechat}`,
          `电话: ${contactInfo.phone}`,
          `QQ: ${contactInfo.qq}`
        ],
        success: (res) => {
          const contactMethods = ['wechat', 'phone', 'qq'];
          const selectedMethod = contactMethods[res.tapIndex];
          
          // 埋点：选择联系方式
          analytics.track('contact_method_select', {
            method: selectedMethod,
            timestamp: Date.now()
          });

          this.handleContactMethod(selectedMethod);
        }
      });
    },

    /**
     * 处理联系方式选择
     */
    handleContactMethod(method) {
      const { contactInfo } = this.data;
      
      switch (method) {
        case 'wechat':
          // 复制微信号到剪贴板
          wx.setClipboardData({
            data: contactInfo.wechat,
            success: () => {
              wx.showToast({
                title: '微信号已复制',
                icon: 'success'
              });
            }
          });
          break;
          
        case 'phone':
          // 拨打电话
          wx.makePhoneCall({
            phoneNumber: contactInfo.phone,
            success: () => {
              console.log('拨打电话成功');
            },
            fail: () => {
              // 复制电话号码到剪贴板
              wx.setClipboardData({
                data: contactInfo.phone,
                success: () => {
                  wx.showToast({
                    title: '电话号码已复制',
                    icon: 'success'
                  });
                }
              });
            }
          });
          break;
          
        case 'qq':
          // 复制QQ号到剪贴板
          wx.setClipboardData({
            data: contactInfo.qq,
            success: () => {
              wx.showToast({
                title: 'QQ号已复制',
                icon: 'success'
              });
            }
          });
          break;
      }
    },

    /**
     * 稍后再说按钮点击
     */
    onLater() {
      const { guideType, featureName } = this.properties;
      
      // 埋点：稍后再说点击
      analytics.track('upgrade_button_click', {
        guide_type: guideType,
        feature_name: featureName,
        action: 'later',
        timestamp: Date.now()
      });

      this.hideGuide();
    },

    /**
     * 隐藏升级引导
     */
    hideGuide() {
      this.triggerEvent('close');
    },

    /**
     * 遮罩点击
     */
    onMaskClick() {
      // 点击遮罩不关闭，引导用户做出选择
    },

    /**
     * 阻止冒泡
     */
    preventBubble() {
      // 阻止事件冒泡
    },

    /**
     * 查看更多权益
     */
    onViewMoreBenefits() {
      const { guideType } = this.properties;
      
      // 埋点：查看更多权益
      analytics.track('upgrade_benefits_view', {
        guide_type: guideType,
        timestamp: Date.now()
      });

      // 显示详细权益说明
      wx.showModal({
        title: '付费会员权益',
        content: '• 不限次数提交作业\n• 专业老师详细批改\n• 个人学习数据分析\n• 学习进度可视化\n• 错题本和知识点总结\n• 优先客服响应\n• 会员专属资料\n• 学习交流群',
        confirmText: '立即开通',
        cancelText: '了解更多',
        success: (res) => {
          if (res.confirm) {
            this.onUpgradeNow();
          } else {
            // 跳转到权益详情页（如果有的话）
            wx.navigateTo({
              url: '/pages/membership-benefits/membership-benefits'
            }).catch(() => {
              // 页面不存在时的降级处理
              console.log('权益详情页面不存在');
            });
          }
        }
      });
    },

    /**
     * 获取剩余试用天数（如果适用）
     */
    getRemainingTrialDays() {
      // 这里可以添加计算剩余试用天数的逻辑
      const authModule = require('../../modules/auth/auth');
      const userInfo = authModule.getUserInfo();
      
      if (!userInfo || !userInfo.trial_expire_date) {
        return 0;
      }

      const expireDate = new Date(userInfo.trial_expire_date);
      const now = new Date();
      const diffTime = expireDate - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return Math.max(0, diffDays);
    }
  }
});