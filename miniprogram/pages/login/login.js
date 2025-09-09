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
      this.navigateToHome()
    }
  },

  onShow() {
    console.log('[login] onShow - 登录页面显示 ✅');
  },

  // 一键登录（静默登录）
  async handleQuickLogin() {
    if (this.data.loading) return
    
    this.setData({ loading: true })
    
    try {
      // 执行登录
      await auth.login()
      
      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })
      
      // 跳转到首页
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
    const app = getApp();
    
    // 检查是否有深链接参数需要处理
    if (app.globalData.launchQuery) {
      // 处理深链接跳转
      app.handleDeepLink();
      return;
    }
    
    // 如果是从其他页面跳转过来的，返回
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      // 否则跳转到首页
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
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