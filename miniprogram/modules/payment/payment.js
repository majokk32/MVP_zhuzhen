// modules/payment/payment.js
/**
 * 微信支付集成模块
 * 处理订阅功能的支付流程
 */

const app = getApp();

// 获取埋点系统
function getAnalytics() {
  const appInstance = getApp();
  return appInstance.globalData?.analytics;
}

class PaymentModule {
  constructor() {
    this.subscriptionPlans = {
      monthly: {
        id: 'monthly',
        name: '月度订阅',
        price: 29.9,
        duration: 30,
        features: [
          '无限制访问所有功能',
          '学习数据导出',
          '高级分析报告',
          '优先客服支持',
          '专属学习计划'
        ],
        originalPrice: 39.9,
        discount: '限时优惠'
      },
      quarterly: {
        id: 'quarterly',
        name: '季度订阅',
        price: 79.9,
        duration: 90,
        features: [
          '包含月度订阅所有功能',
          '季度学习报告',
          '个性化指导建议',
          '小班交流群',
          '考试冲刺资料'
        ],
        originalPrice: 119.7,
        discount: '最划算'
      },
      yearly: {
        id: 'yearly',
        name: '年度订阅',
        price: 299.9,
        duration: 365,
        features: [
          '包含季度订阅所有功能',
          '年度学习总结',
          '一对一指导机会',
          'VIP专属客服',
          '线下活动优先权'
        ],
        originalPrice: 479.6,
        discount: '超值优惠'
      }
    };
    
    this.paymentHistory = [];
    this.currentSubscription = null;
  }

  /**
   * 获取订阅计划列表
   */
  getSubscriptionPlans() {
    return Object.values(this.subscriptionPlans);
  }

  /**
   * 获取指定订阅计划
   */
  getSubscriptionPlan(planId) {
    return this.subscriptionPlans[planId];
  }

  /**
   * 检查用户订阅状态
   */
  async checkSubscriptionStatus() {
    try {
      const response = await app.request({
        url: '/payment/subscription/status',
        method: 'GET'
      });

      this.currentSubscription = response;
      return response;
    } catch (error) {
      console.error('检查订阅状态失败:', error);
      return null;
    }
  }

  /**
   * 发起订阅支付
   */
  async initiateSubscriptionPayment(planId, options = {}) {
    try {
      wx.showLoading({ title: '准备支付...' });

      const plan = this.getSubscriptionPlan(planId);
      if (!plan) {
        throw new Error('订阅计划不存在');
      }

      // 埋点：支付开始
      const analytics = getAnalytics();
      if (analytics) {
        analytics.trackPaymentStart({
          orderId: `${Date.now()}_${planId}`,
          planId: planId,
          planName: plan.name,
          amount: plan.price * 100,
          currency: 'CNY',
          paymentMethod: 'wechat_pay'
        });
      }

      // 创建订单
      const orderData = await this.createSubscriptionOrder(plan, options);
      
      // 调起微信支付
      const paymentResult = await this.requestWeChatPayment(orderData);
      
      // 验证支付结果
      const verificationResult = await this.verifyPaymentResult(paymentResult, orderData);
      
      wx.hideLoading();
      
      if (verificationResult.success) {
        // 支付成功处理
        await this.handlePaymentSuccess(verificationResult);
        
        // 埋点：支付成功
        if (analytics) {
          analytics.trackPaymentSuccess({
            orderId: orderData.order_id,
            transactionId: paymentResult.transactionId || 'unknown',
            planId: planId,
            amount: plan.price * 100,
            paymentDuration: Date.now() - Date.now() // 这里应该用开始时间，简化处理
          });
        }
        
        wx.showToast({
          title: '订阅成功！',
          icon: 'success',
          duration: 2000
        });

        return {
          success: true,
          subscription: verificationResult.subscription,
          order: orderData
        };
      } else {
        throw new Error(verificationResult.message || '支付验证失败');
      }

    } catch (error) {
      wx.hideLoading();
      console.error('订阅支付失败:', error);
      
      // 埋点：支付失败
      const analytics = getAnalytics();
      if (analytics) {
        analytics.trackPaymentFailure({
          orderId: `${Date.now()}_${planId}`,
          planId: planId,
          amount: this.getSubscriptionPlan(planId)?.price * 100 || 0
        }, error);
      }
      
      wx.showModal({
        title: '支付失败',
        content: error.message || '支付过程中出现错误，请重试',
        showCancel: false
      });

      return {
        success: false,
        error: error.message || '支付失败'
      };
    }
  }

  /**
   * 创建订阅订单
   */
  async createSubscriptionOrder(plan, options = {}) {
    try {
      const orderRequest = {
        plan_id: plan.id,
        plan_name: plan.name,
        amount: plan.price * 100, // 转换为分
        currency: 'CNY',
        description: `${plan.name} - 公考督学助手`,
        auto_renew: options.autoRenew !== false, // 默认自动续费
        coupon_code: options.couponCode,
        payment_method: 'wechat_pay'
      };

      const response = await app.request({
        url: '/payment/subscription/create-order',
        method: 'POST',
        data: orderRequest
      });

      return response;
    } catch (error) {
      console.error('创建订阅订单失败:', error);
      throw new Error('创建订单失败，请重试');
    }
  }

  /**
   * 调起微信支付
   */
  async requestWeChatPayment(orderData) {
    return new Promise((resolve, reject) => {
      const { payment_params } = orderData;
      
      wx.requestPayment({
        timeStamp: payment_params.timeStamp,
        nonceStr: payment_params.nonceStr,
        package: payment_params.package,
        signType: payment_params.signType || 'MD5',
        paySign: payment_params.paySign,
        
        success: (result) => {
          console.log('微信支付成功:', result);
          resolve({
            success: true,
            ...result
          });
        },
        
        fail: (error) => {
          console.error('微信支付失败:', error);
          
          if (error.errMsg && error.errMsg.includes('cancel')) {
            reject(new Error('用户取消支付'));
          } else {
            reject(new Error(error.errMsg || '支付失败'));
          }
        }
      });
    });
  }

  /**
   * 验证支付结果
   */
  async verifyPaymentResult(paymentResult, orderData) {
    try {
      const verificationRequest = {
        order_id: orderData.order_id,
        transaction_id: paymentResult.transactionId,
        payment_result: paymentResult
      };

      const response = await app.request({
        url: '/payment/subscription/verify-payment',
        method: 'POST',
        data: verificationRequest
      });

      return response;
    } catch (error) {
      console.error('支付验证失败:', error);
      throw new Error('支付验证失败，请联系客服');
    }
  }

  /**
   * 处理支付成功
   */
  async handlePaymentSuccess(verificationResult) {
    try {
      // 更新本地订阅状态
      this.currentSubscription = verificationResult.subscription;
      
      // 记录支付历史
      this.paymentHistory.unshift({
        id: verificationResult.payment_id,
        order_id: verificationResult.order_id,
        plan: verificationResult.subscription.plan,
        amount: verificationResult.amount,
        status: 'completed',
        created_at: new Date().toISOString(),
        expires_at: verificationResult.subscription.expires_at
      });

      // 更新全局用户信息
      const app = getApp();
      if (app.globalData.userInfo) {
        app.globalData.userInfo.subscription_status = verificationResult.subscription.status;
        app.globalData.userInfo.subscription_plan = verificationResult.subscription.plan;
        app.globalData.userInfo.subscription_expires_at = verificationResult.subscription.expires_at;
      }

      // 触发订阅成功事件
      this.triggerSubscriptionEvent('subscription_success', {
        subscription: verificationResult.subscription,
        payment: verificationResult
      });

    } catch (error) {
      console.error('支付成功处理失败:', error);
    }
  }

  /**
   * 取消订阅自动续费
   */
  async cancelAutoRenewal() {
    try {
      wx.showLoading({ title: '处理中...' });

      const response = await app.request({
        url: '/payment/subscription/cancel-auto-renewal',
        method: 'POST'
      });

      wx.hideLoading();

      if (response.success) {
        // 更新本地状态
        if (this.currentSubscription) {
          this.currentSubscription.auto_renew = false;
        }

        wx.showToast({
          title: '已取消自动续费',
          icon: 'success'
        });

        this.triggerSubscriptionEvent('auto_renewal_cancelled', {
          subscription: this.currentSubscription
        });

        return { success: true };
      } else {
        throw new Error(response.message || '取消失败');
      }

    } catch (error) {
      wx.hideLoading();
      console.error('取消自动续费失败:', error);
      
      wx.showToast({
        title: error.message || '取消失败',
        icon: 'none'
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * 获取支付历史记录
   */
  async getPaymentHistory(limit = 20, offset = 0) {
    try {
      const response = await app.request({
        url: '/payment/history',
        method: 'GET',
        data: { limit, offset }
      });

      return response.payments || [];
    } catch (error) {
      console.error('获取支付历史失败:', error);
      return [];
    }
  }

  /**
   * 检查功能访问权限
   */
  checkFeatureAccess(featureId) {
    if (!this.currentSubscription) {
      return { hasAccess: false, reason: '未订阅' };
    }

    const now = new Date();
    const expiresAt = new Date(this.currentSubscription.expires_at);

    if (now > expiresAt) {
      return { hasAccess: false, reason: '订阅已过期' };
    }

    // 检查特定功能权限
    const featurePermissions = {
      'leaderboard': ['monthly', 'quarterly', 'yearly'],
      'export_data': ['monthly', 'quarterly', 'yearly'],
      'advanced_analytics': ['monthly', 'quarterly', 'yearly'],
      'priority_support': ['quarterly', 'yearly'],
      'personalized_guidance': ['quarterly', 'yearly'],
      'vip_support': ['yearly'],
      'offline_events': ['yearly']
    };

    const requiredPlans = featurePermissions[featureId];
    if (!requiredPlans) {
      return { hasAccess: true }; // 未定义权限的功能默认可访问
    }

    const hasAccess = requiredPlans.includes(this.currentSubscription.plan);
    
    return {
      hasAccess,
      reason: hasAccess ? null : `需要${requiredPlans.join('或')}订阅`,
      subscription: this.currentSubscription
    };
  }

  /**
   * 获取订阅剩余时间
   */
  getSubscriptionRemainingTime() {
    if (!this.currentSubscription) {
      return { days: 0, hours: 0, expired: true };
    }

    const now = new Date();
    const expiresAt = new Date(this.currentSubscription.expires_at);
    const timeDiff = expiresAt - now;

    if (timeDiff <= 0) {
      return { days: 0, hours: 0, expired: true };
    }

    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    return { days, hours, expired: false };
  }

  /**
   * 应用优惠券
   */
  async applyCoupon(couponCode, planId) {
    try {
      const response = await app.request({
        url: '/payment/coupon/apply',
        method: 'POST',
        data: {
          coupon_code: couponCode,
          plan_id: planId
        }
      });

      return response;
    } catch (error) {
      console.error('应用优惠券失败:', error);
      throw new Error(error.message || '优惠券无效');
    }
  }

  /**
   * 触发订阅相关事件
   */
  triggerSubscriptionEvent(eventType, data) {
    try {
      const eventData = {
        type: eventType,
        timestamp: new Date().toISOString(),
        data
      };

      // 发送给页面监听器
      wx.setStorageSync('subscription_event', eventData);
      
      // 触发全局事件
      const app = getApp();
      if (app.onSubscriptionEvent) {
        app.onSubscriptionEvent(eventData);
      }
    } catch (error) {
      console.error('触发订阅事件失败:', error);
    }
  }

  /**
   * 重新激活订阅
   */
  async reactivateSubscription(planId) {
    try {
      wx.showLoading({ title: '激活中...' });

      const response = await app.request({
        url: '/payment/subscription/reactivate',
        method: 'POST',
        data: { plan_id: planId }
      });

      wx.hideLoading();

      if (response.success) {
        this.currentSubscription = response.subscription;
        
        wx.showToast({
          title: '订阅已重新激活',
          icon: 'success'
        });

        this.triggerSubscriptionEvent('subscription_reactivated', {
          subscription: this.currentSubscription
        });

        return { success: true, subscription: this.currentSubscription };
      } else {
        throw new Error(response.message || '重新激活失败');
      }

    } catch (error) {
      wx.hideLoading();
      console.error('重新激活订阅失败:', error);
      return { success: false, error: error.message };
    }
  }
}

// 创建单例实例
const paymentModule = new PaymentModule();

module.exports = paymentModule;