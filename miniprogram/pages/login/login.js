// pages/login/login.js
const auth = require('../../modules/auth/auth')
const app = getApp()

Page({
  data: {
    loading: false,
    canUseGetUserProfile: false,  // 是否可以使用getUserProfile
    canUseNicknameInput: false,   // 是否可以使用头像昵称填写
    avatarUrl: '/assets/images/default-avatar.png',
    nickname: ''
  },

  onLoad() {
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

    // 如果已登录，直接跳转
    if (auth.isLogin()) {
      this.navigateToHome()
    }
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

  // 跳转到首页
  navigateToHome() {
    // 如果是从其他页面跳转过来的，返回
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      // 否则跳转到首页
      wx.switchTab({
        url: '/pages/index/index'
      })
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