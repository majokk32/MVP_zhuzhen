// pages/login/login.js
console.log('[login] 文件开始加载 📄');

const auth = require('../../modules/auth/auth')
console.log('[login] auth模块加载成功 ✅');

const app = getApp()
console.log('[login] app实例获取成功 ✅');

Page({
  data: {
    loading: false,
    canUseGetUserProfile: false,  // 是否可以使用getUserProfile
    canUseNicknameInput: false,   // 是否可以使用头像昵称填写
    showPhoneLogin: false,        // 是否显示手机号登录
    avatarUrl: '/assets/images/default-avatar.png',
    nickname: ''
  },
  
  // 计时器管理
  navigationTimer: null,

  // 安全的导航调度器
  scheduleNavigation(delay = 1500) {
    console.log('📅 [DEBUG] scheduleNavigation 被调用, delay:', delay);
    
    // 清除之前的计时器
    if (this.navigationTimer) {
      console.log('📅 [DEBUG] 清除之前的导航计时器');
      clearTimeout(this.navigationTimer);
      this.navigationTimer = null;
    }
    
    // 设置新的计时器
    this.navigationTimer = setTimeout(() => {
      console.log('📅 [DEBUG] 导航计时器触发，开始执行页面跳转');
      this.navigationTimer = null;
      this.navigateToHome();
    }, delay);
  },

  onLoad() {
    console.log('[login] onLoad - 登录页面已加载 ✅');
    // 检查API可用性
    if (wx.getUserProfile) {
      this.setData({
        canUseGetUserProfile: true
      })
    }
    
    // 检查是否支持头像昵称填写能力（基础库 2.21.2）
    if (wx.canIUse('input.type.nickname')) {
      this.setData({
        canUseNicknameInput: true
      })
    }

    // 检查是否支持手机号授权（基础库 2.21.0）
    if (wx.canIUse('button.open-type.getPhoneNumber')) {
      this.setData({
        showPhoneLogin: true
      })
    }

    // 如果已登录，直接跳转
    if (auth.isLogin()) {
      console.log('🔐 [DEBUG] 检测到用户已登录，准备跳转');
      // 稍微延迟，让页面完全加载完成再跳转
      this.scheduleNavigation(500); 
    }
  },

  onShow() {
    console.log('[login] onShow - 登录页面显示 ✅');
  },

  onUnload() {
    console.log('[login] onUnload - 登录页面卸载');
    // 清理计时器
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
      this.navigationTimer = null;
    }
  },

  // 一键登录（静默登录）
  async handleQuickLogin() {
    console.log('🔐 [DEBUG] handleQuickLogin 被调用, 当前loading状态:', this.data.loading);
    
    if (this.data.loading) {
      console.log('🔐 [DEBUG] 登录正在进行中，忽略重复点击');
      return;
    }
    
    this.setData({ loading: true })
    console.log('🔐 [DEBUG] 设置loading为true，开始登录流程');
    
    try {
      // 执行登录
      console.log('🔐 [DEBUG] 调用 auth.login()');
      await auth.login()
      console.log('🔐 [DEBUG] auth.login() 成功完成');
      
      console.log('🔐 [DEBUG] 显示登录成功提示');
      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })
      
      // 跳转到首页
      console.log('🔐 [DEBUG] 1.5秒后将跳转到首页');
      this.scheduleNavigation(1500);
    } catch (error) {
      console.error('🔐 [ERROR] 登录失败:', error)
      wx.showToast({
        title: error.message || '登录失败',
        icon: 'none'
      })
    } finally {
      console.log('🔐 [DEBUG] 设置loading为false');
      this.setData({ loading: false })
    }
  },

  // 选择头像（新方式）
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({
      avatarUrl
    })
  },

  // 输入昵称（新方式）
  onNicknameInput(e) {
    this.setData({
      nickname: e.detail.value
    })
  },

  // 完善资料并登录
  async handleCompleteProfile() {
    if (this.data.loading) return
    
    if (!this.data.nickname) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      })
      return
    }
    
    this.setData({ loading: true })
    
    try {
      // 先执行登录
      if (!auth.isLogin()) {
        await auth.login()
        
        // 确保token已同步到app全局状态
        const app = getApp()
        app.globalData.token = auth.getToken()
        app.globalData.userInfo = auth.getUserInfo()
        app.globalData.isLogin = true
      }
      
      // 上传头像（如果选择了自定义头像）
      let avatarUrl = this.data.avatarUrl
      if (avatarUrl && avatarUrl !== '/assets/images/default-avatar.png') {
        // 如果是临时文件，需要上传到服务器
        if (avatarUrl.startsWith('http://tmp/') || avatarUrl.startsWith('wxfile://')) {
          console.log('准备上传头像，当前token:', auth.getToken()?.substring(0, 20) + '...')
          
          const uploadResult = await app.uploadFile({
            url: '/submissions/upload-image',
            filePath: avatarUrl,
            name: 'file'
          })
          avatarUrl = uploadResult.url
        }
      }
      
      // 更新用户信息
      await auth.updateProfile({
        nickname: this.data.nickname,
        avatar: avatarUrl
      })
      
      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })
      
      setTimeout(() => {
        this.navigateToHome()
      }, 1500)
    } catch (error) {
      console.error('登录失败', error)
      wx.showToast({
        title: error.message || '登录失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 手机号授权登录
  async handlePhoneLogin(e) {
    if (this.data.loading) return
    
    // 检查用户是否同意授权
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({
        title: '需要授权手机号才能登录',
        icon: 'none'
      })
      return
    }
    
    this.setData({ loading: true })
    
    try {
      // 获取微信登录凭证
      const loginRes = await wx.login()
      if (!loginRes.code) {
        throw new Error('获取登录凭证失败')
      }
      
      // 调用后端接口，使用code和加密数据进行登录
      const app = getApp()
      const result = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/users/phone-login`,
          method: 'POST',
          data: {
            code: loginRes.code,
            encryptedData: e.detail.encryptedData,
            iv: e.detail.iv
          },
          header: {
            'Content-Type': 'application/json'
          },
          success: (res) => {
            if (res.statusCode === 200) {
              resolve(res.data)
            } else {
              reject(new Error(`请求失败: ${res.statusCode}`))
            }
          },
          fail: reject
        })
      })
      
      if (result.code === 0) {
        // 保存登录状态
        const { token, user } = result.data
        wx.setStorageSync('token', token)
        wx.setStorageSync('userInfo', user)
        
        // 更新全局状态
        app.globalData.token = token
        app.globalData.userInfo = user
        app.globalData.isLogin = true
        
        if (user.role === 'teacher') {
          app.globalData.isTeacher = true
        }
        
        // 更新tabBar
        if (app.updateTabBar) {
          app.updateTabBar()
        }
        
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })
        
        setTimeout(() => {
          this.navigateToHome()
        }, 1500)
      } else {
        throw new Error(result.msg || '手机号登录失败')
      }
    } catch (error) {
      console.error('手机号登录失败:', error)
      wx.showToast({
        title: error.message || '手机号登录失败',
        icon: 'error'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 跳转到首页
  navigateToHome() {
    console.log('🏠 [DEBUG] navigateToHome 被调用');
    
    const app = getApp();
    
    // 检查是否有深链接参数需要处理
    const launchQuery = app.globalData.launchQuery;
    const hasValidDeepLink = launchQuery && 
      typeof launchQuery === 'object' && 
      Object.keys(launchQuery).length > 0;
    
    console.log('🏠 [DEBUG] 深链接检查 - launchQuery:', launchQuery, 'hasValidDeepLink:', hasValidDeepLink);
    
    if (hasValidDeepLink) {
      console.log('🏠 [DEBUG] 处理深链接跳转:', launchQuery);
      // 处理深链接跳转
      if (typeof app.handleDeepLink === 'function') {
        app.handleDeepLink();
        return;
      } else {
        console.log('🏠 [DEBUG] app.handleDeepLink 方法不存在，继续常规跳转');
      }
    }
    
    // 简化策略：登录成功后始终跳转到首页
    // 这样避免了复杂的页面栈判断和潜在的返回循环问题
    const pages = getCurrentPages();
    console.log('🏠 [DEBUG] 当前页面栈长度:', pages.length);
    
    // 输出页面栈信息用于调试
    if (pages.length > 0) {
      const pageRoutes = pages.map(page => page.route);
      console.log('🏠 [DEBUG] 页面栈路由:', pageRoutes);
    }
    
    console.log('🏠 [DEBUG] 使用简化策略：直接跳转到首页');
    this.forceNavigateToHome();
  },

  // 强制跳转到首页
  forceNavigateToHome() {
    console.log('🏠 [DEBUG] 强制跳转到首页');
    wx.switchTab({
      url: '/pages/index/index',
      success: () => {
        console.log('🏠 [DEBUG] switchTab 成功');
      },
      fail: (err) => {
        console.error('🏠 [ERROR] switchTab 失败:', err);
        // 最后的备选方案：使用 reLaunch
        console.log('🏠 [DEBUG] 使用 reLaunch 作为备选方案');
        wx.reLaunch({
          url: '/pages/index/index',
          success: () => {
            console.log('🏠 [DEBUG] reLaunch 成功');
          },
          fail: (err) => {
            console.error('🏠 [ERROR] reLaunch 也失败了:', err);
          }
        });
      }
    });
  },

  // 跳过登录（仅开发调试用）
  handleSkip() {
    if (__wxConfig.envVersion === 'develop') {
      wx.switchTab({
        url: '/pages/index/index'
      })
    }
  }
})