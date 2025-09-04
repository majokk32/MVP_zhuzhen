// app.js
// 小程序全局应用实例
App({
  onLaunch() {
    // 初始化云开发（如果使用）
    // wx.cloud.init()
    
    // 获取系统信息
    this.globalData.systemInfo = wx.getSystemInfoSync()
    
    // 检查登录状态
    this.checkSession()
  },

  // 检查登录会话是否有效
  async checkSession() {
    try {
      // 检查session是否过期
      const checkResult = await wx.checkSession()
      
      // session未过期，检查本地是否有token
      const token = wx.getStorageSync('token')
      const userInfo = wx.getStorageSync('userInfo')
      
      if (token && userInfo) {
        // 验证token有效性（可选）
        this.globalData.token = token
        this.globalData.userInfo = userInfo
        this.globalData.isLogin = true
        
        // 根据角色动态设置
        if (userInfo.role === 'teacher') {
          this.globalData.isTeacher = true
        }
      } else {
        // 静默登录
        await this.silentLogin()
      }
    } catch (error) {
      console.log('Session已过期，需要重新登录')
      // 清除本地存储
      wx.removeStorageSync('token')
      wx.removeStorageSync('userInfo')
    }
  },

  // 静默登录（不需要用户授权）
  silentLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (res.code) {
            try {
              // 使用code换取token（静默登录）
              const loginResult = await this.request({
                url: '/users/login',
                method: 'POST',
                data: { code: res.code }
              })
              
              // 保存登录态
              this.saveLoginState(loginResult)
              resolve(loginResult)
            } catch (error) {
              console.error('登录失败', error)
              reject(error)
            }
          } else {
            reject(new Error('获取code失败'))
          }
        },
        fail: reject
      })
    })
  },

  // 保存登录状态
  saveLoginState(loginData) {
    const { token, user } = loginData
    
    // 保存到本地存储
    wx.setStorageSync('token', token)
    wx.setStorageSync('userInfo', user)
    
    // 更新全局数据
    this.globalData.token = token
    this.globalData.userInfo = user
    this.globalData.isLogin = true
    
    // 判断是否为教师
    if (user.role === 'teacher') {
      this.globalData.isTeacher = true
    }
  },

  // 封装网络请求
  request(options) {
    // 显示加载提示
    if (options.showLoading !== false) {
      wx.showLoading({
        title: options.loadingText || '加载中...',
        mask: true
      })
    }
    
    const baseUrl = this.globalData.baseUrl
    const token = this.globalData.token || wx.getStorageSync('token')
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: baseUrl + options.url,
        method: options.method || 'GET',
        data: options.data || {},
        header: {
          'content-type': options.contentType || 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          ...options.header
        },
        success: (res) => {
          wx.hideLoading()
          
          // 处理HTTP状态码
          if (res.statusCode === 200) {
            // 处理业务状态码
            if (res.data.code === 0) {
              resolve(res.data.data)
            } else {
              // 显示错误信息
              if (options.showError !== false) {
                wx.showToast({
                  title: res.data.msg || '请求失败',
                  icon: 'none',
                  duration: 2000
                })
              }
              reject(res.data)
            }
          } else if (res.statusCode === 401) {
            // token失效，重新登录
            wx.removeStorageSync('token')
            wx.removeStorageSync('userInfo')
            this.globalData.isLogin = false
            
            // 跳转到登录页
            wx.reLaunch({
              url: '/pages/login/login'
            })
            reject(new Error('登录已过期'))
          } else {
            wx.showToast({
              title: `服务器错误(${res.statusCode})`,
              icon: 'none'
            })
            reject(new Error(`HTTP ${res.statusCode}`))
          }
        },
        fail: (err) => {
          wx.hideLoading()
          wx.showToast({
            title: '网络连接失败',
            icon: 'none'
          })
          reject(err)
        }
      })
    })
  },

  // 上传文件
  uploadFile(options) {
    return new Promise((resolve, reject) => {
      const baseUrl = this.globalData.baseUrl
      const token = this.globalData.token || wx.getStorageSync('token')
      
      console.log('uploadFile调用 - URL:', baseUrl + options.url)
      console.log('uploadFile调用 - Token存在:', !!token)
      console.log('uploadFile调用 - Token前20字符:', token ? token.substring(0, 20) + '...' : 'null')
      
      wx.uploadFile({
        url: baseUrl + options.url,
        filePath: options.filePath,
        name: options.name || 'file',
        formData: options.formData || {},
        header: {
          'Authorization': token ? `Bearer ${token}` : ''
        },
        success: (res) => {
          const data = JSON.parse(res.data)
          if (data.code === 0) {
            resolve(data.data)
          } else {
            wx.showToast({
              title: data.msg || '上传失败',
              icon: 'none'
            })
            reject(data)
          }
        },
        fail: reject
      })
    })
  },

  // 全局数据
  globalData: {
    userInfo: null,
    token: null,
    isLogin: false,
    isTeacher: false,
    systemInfo: null,
    // API基础地址
    // baseUrl: 'http://120.77.57.53:8000/api/v1',  // 开发环境
    baseUrl: 'http://192.168.1.139:8000/api/v1',
    // baseUrl: 'https://api.zhuzhen.com/api/v1',  // 生产环境
  }
})