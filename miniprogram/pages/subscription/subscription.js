// pages/subscription/subscription.js
const paymentModule = require('../../modules/payment/payment');

/**
 * 格式化时间为日期字符串
 * @param {number|string|Date} timestamp 时间戳或日期
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

Page({
  data: {
    // 订阅计划
    subscriptionPlans: [],
    selectedPlanId: 'quarterly',
    
    // 当前订阅状态
    currentSubscription: null,
    subscriptionStatus: 'inactive',
    remainingTime: { days: 0, hours: 0, expired: true },
    
    // 优惠券
    couponCode: '',
    couponDiscount: null,
    showCouponInput: false,
    
    // UI状态
    loading: false,
    loadingPayment: false,
    
    // 支付历史
    paymentHistory: [],
    showPaymentHistory: false,
    
    // 特性对比
    showFeatureComparison: false,
    
    // 自动续费设置
    autoRenewEnabled: true
  },

  onLoad(options) {
    this.initSubscriptionPage();
    
    // 如果从其他页面跳转过来指定了计划，设置选中状态
    if (options.planId) {
      this.setData({ selectedPlanId: options.planId });
    }
  },

  onShow() {
    this.refreshSubscriptionStatus();
  },

  /**
   * 初始化订阅页面
   */
  async initSubscriptionPage() {
    try {
      this.setData({ loading: true });
      
      // 加载订阅计划
      const plans = paymentModule.getSubscriptionPlans();
      this.setData({ subscriptionPlans: plans });
      
      // 检查当前订阅状态
      await this.refreshSubscriptionStatus();
      
      // 加载支付历史
      await this.loadPaymentHistory();
      
    } catch (error) {
      console.error('初始化订阅页面失败:', error);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 刷新订阅状态
   */
  async refreshSubscriptionStatus() {
    try {
      const subscription = await paymentModule.checkSubscriptionStatus();
      
      if (subscription) {
        const remainingTime = paymentModule.getSubscriptionRemainingTime();
        
        this.setData({
          currentSubscription: subscription,
          subscriptionStatus: subscription.status,
          remainingTime,
          autoRenewEnabled: subscription.auto_renew
        });
      } else {
        this.setData({
          currentSubscription: null,
          subscriptionStatus: 'inactive',
          remainingTime: { days: 0, hours: 0, expired: true }
        });
      }
    } catch (error) {
      console.error('刷新订阅状态失败:', error);
    }
  },

  /**
   * 加载支付历史
   */
  async loadPaymentHistory() {
    try {
      const history = await paymentModule.getPaymentHistory(10);
      
      // 为每个支付记录添加格式化的时间文本
      const processedHistory = history.map(item => ({
        ...item,
        createdAtText: formatDate(item.created_at)
      }));
      
      this.setData({ paymentHistory: processedHistory });
    } catch (error) {
      console.error('加载支付历史失败:', error);
    }
  },

  /**
   * 选择订阅计划
   */
  selectPlan(e) {
    const { planId } = e.currentTarget.dataset;
    this.setData({ selectedPlanId: planId });
    
    // 清除优惠券信息
    this.setData({
      couponCode: '',
      couponDiscount: null
    });
  },

  /**
   * 发起订阅支付
   */
  async purchaseSubscription() {
    try {
      this.setData({ loadingPayment: true });
      
      const { selectedPlanId, couponCode, autoRenewEnabled } = this.data;
      
      // 发起支付
      const paymentResult = await paymentModule.initiateSubscriptionPayment(selectedPlanId, {
        couponCode: couponCode || undefined,
        autoRenew: autoRenewEnabled
      });
      
      if (paymentResult.success) {
        // 支付成功，刷新页面状态
        await this.refreshSubscriptionStatus();
        
        // 显示成功页面或返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 2000);
      }
      
    } catch (error) {
      console.error('购买订阅失败:', error);
    } finally {
      this.setData({ loadingPayment: false });
    }
  },

  /**
   * 切换优惠券输入
   */
  toggleCouponInput() {
    this.setData({
      showCouponInput: !this.data.showCouponInput,
      couponCode: '',
      couponDiscount: null
    });
  },

  /**
   * 优惠券输入
   */
  onCouponInput(e) {
    this.setData({ couponCode: e.detail.value });
  },

  /**
   * 应用优惠券
   */
  async applyCoupon() {
    try {
      const { couponCode, selectedPlanId } = this.data;
      
      if (!couponCode.trim()) {
        wx.showToast({
          title: '请输入优惠券代码',
          icon: 'none'
        });
        return;
      }
      
      wx.showLoading({ title: '验证中...' });
      
      const couponResult = await paymentModule.applyCoupon(couponCode, selectedPlanId);
      
      wx.hideLoading();
      
      if (couponResult.valid) {
        this.setData({
          couponDiscount: couponResult.discount,
          showCouponInput: false
        });
        
        wx.showToast({
          title: `优惠券生效，减免${couponResult.discount.amount}元`,
          icon: 'success'
        });
      } else {
        wx.showToast({
          title: couponResult.message || '优惠券无效',
          icon: 'none'
        });
      }
      
    } catch (error) {
      wx.hideLoading();
      console.error('应用优惠券失败:', error);
      wx.showToast({
        title: error.message || '优惠券验证失败',
        icon: 'none'
      });
    }
  },

  /**
   * 切换自动续费
   */
  toggleAutoRenew() {
    this.setData({
      autoRenewEnabled: !this.data.autoRenewEnabled
    });
  },

  /**
   * 取消自动续费
   */
  async cancelAutoRenewal() {
    try {
      wx.showModal({
        title: '确认取消',
        content: '确定要取消自动续费吗？取消后订阅到期将不会自动续费。',
        success: async (res) => {
          if (res.confirm) {
            const result = await paymentModule.cancelAutoRenewal();
            if (result.success) {
              this.refreshSubscriptionStatus();
            }
          }
        }
      });
    } catch (error) {
      console.error('取消自动续费失败:', error);
    }
  },

  /**
   * 重新激活订阅
   */
  async reactivateSubscription() {
    try {
      const { selectedPlanId } = this.data;
      const result = await paymentModule.reactivateSubscription(selectedPlanId);
      
      if (result.success) {
        this.refreshSubscriptionStatus();
      }
    } catch (error) {
      console.error('重新激活订阅失败:', error);
    }
  },

  /**
   * 显示/隐藏支付历史
   */
  togglePaymentHistory() {
    this.setData({
      showPaymentHistory: !this.data.showPaymentHistory
    });
  },

  /**
   * 显示/隐藏特性对比
   */
  toggleFeatureComparison() {
    this.setData({
      showFeatureComparison: !this.data.showFeatureComparison
    });
  },

  /**
   * 联系客服
   */
  contactSupport() {
    wx.makePhoneCall({
      phoneNumber: '400-123-4567',
      success: () => {
        console.log('拨打客服电话成功');
      },
      fail: (error) => {
        console.error('拨打客服电话失败:', error);
        wx.showToast({
          title: '无法拨打电话',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 查看支付详情
   */
  viewPaymentDetail(e) {
    const { paymentId } = e.currentTarget.dataset;
    const payment = this.data.paymentHistory.find(p => p.id === paymentId);
    
    if (payment) {
      wx.showModal({
        title: '支付详情',
        content: `订单号: ${payment.order_id}\n计划: ${payment.plan.name}\n金额: ¥${payment.amount/100}\n状态: ${payment.status}\n时间: ${new Date(payment.created_at).toLocaleString()}`,
        showCancel: false
      });
    }
  },

  /**
   * 获取计划的CSS类名
   */
  getPlanClassName(planId) {
    const { selectedPlanId } = this.data;
    let className = 'plan-card';
    
    if (planId === selectedPlanId) {
      className += ' selected';
    }
    
    if (planId === 'quarterly') {
      className += ' recommended';
    }
    
    return className;
  },

  /**
   * 计算折扣后价格
   */
  calculateDiscountedPrice(originalPrice) {
    const { couponDiscount } = this.data;
    
    if (!couponDiscount) {
      return originalPrice;
    }
    
    if (couponDiscount.type === 'percentage') {
      return originalPrice * (1 - couponDiscount.value / 100);
    } else if (couponDiscount.type === 'amount') {
      return Math.max(0, originalPrice - couponDiscount.value);
    }
    
    return originalPrice;
  },

  /**
   * 获取订阅状态文本
   */
  getSubscriptionStatusText() {
    const { subscriptionStatus, remainingTime } = this.data;
    
    if (subscriptionStatus === 'active' && !remainingTime.expired) {
      if (remainingTime.days > 0) {
        return `剩余${remainingTime.days}天${remainingTime.hours}小时`;
      } else {
        return `剩余${remainingTime.hours}小时`;
      }
    } else if (subscriptionStatus === 'expired') {
      return '已过期';
    } else {
      return '未订阅';
    }
  },

  /**
   * 分享页面
   */
  onShareAppMessage() {
    return {
      title: '公考督学助手 - 专业的申论学习工具',
      path: '/pages/subscription/subscription',
      imageUrl: '/assets/images/share-subscription.png'
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '公考督学助手 - 专业的申论学习工具'
    };
  }
});