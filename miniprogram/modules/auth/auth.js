/**
 * 认证模块
 * 负责：微信登录、Token管理、用户信息管理
 * @module auth
 */

const app = getApp()

class AuthModule {
  constructor() {
    this.token = wx.getStorageSync('token') || null
    this.userInfo = wx.getStorageSync('userInfo') || null
  }

  /**
   * 检查是否已登录
   * @returns {boolean}
   */
  isLogin() {
    return !!(this.token && this.userInfo)
  }

  /**
   * 检查是否为教师角色
   * @returns {boolean}
   */
  isTeacher() {
    return this.userInfo && this.userInfo.role === 'teacher'
  }

  /**
   * 检查是否为付费用户
   * @returns {boolean}
   */
  isPaidUser() {
    return this.userInfo && (this.userInfo.permission_type === 'paid' || this.userInfo.userType === 'paid')
  }

  /**
   * 检查是否为试用用户
   * @returns {boolean}
   */
  isTrialUser() {
    return this.userInfo && (this.userInfo.permission_type === 'trial' || this.userInfo.userType === 'trial')
  }

  /**
   * 检查用户权限是否过期
   * @returns {boolean}
   */
  isPermissionExpired() {
    if (!this.userInfo || !this.userInfo.permission_expire) {
      return false
    }
    const expireDate = new Date(this.userInfo.permission_expire)
    return expireDate < new Date()
  }

  /**
   * 微信登录（静默登录，不需要用户授权）
   * @returns {Promise<{token: string, user: object}>}
   */
  login() {
    return new Promise((resolve, reject) => {
      // 先调用wx.login获取code
      wx.login({
        success: async (res) => {
          if (!res.code) {
            reject(new Error('获取登录凭证失败'))
            return
          }

          try {
            // 用code换取token和用户信息
            const loginResult = await app.request({
              url: '/users/login',
              method: 'POST',
              data: { code: res.code }
            })

            // 保存登录信息
            this.saveLoginInfo(loginResult)
            resolve(loginResult)
          } catch (error) {
            reject(error)
          }
        },
        fail: (err) => {
          reject(new Error('微信登录失败：' + err.errMsg))
        }
      })
    })
  }

  /**
   * 更新用户信息（头像、昵称）
   * @param {object} profileData - {nickname, avatar}
   * @returns {Promise<object>}
   */
  async updateProfile(profileData) {
    const result = await app.request({
      url: '/users/profile',
      method: 'PUT',
      data: profileData
    })

    // 更新本地存储的用户信息
    if (result) {
      this.userInfo = { ...this.userInfo, ...result }
      wx.setStorageSync('userInfo', this.userInfo)
      app.globalData.userInfo = this.userInfo
    }

    return result
  }

  /**
   * 获取用户信息
   * @returns {object|null}
   */
  getUserInfo() {
    if (!this.userInfo) {
      this.userInfo = wx.getStorageSync('userInfo')
    }
    return this.userInfo
  }

  /**
   * 获取Token
   * @returns {string|null}
   */
  getToken() {
    if (!this.token) {
      this.token = wx.getStorageSync('token')
    }
    return this.token
  }

  /**
   * 保存登录信息
   * @private
   * @param {object} loginData - {token, user}
   */
  saveLoginInfo(loginData) {
    const { token, user } = loginData
    
    // 保存到内存
    this.token = token
    this.userInfo = user
    
    // 保存到本地存储
    wx.setStorageSync('token', token)
    wx.setStorageSync('userInfo', user)
    
    // 更新全局数据
    app.globalData.token = token
    app.globalData.userInfo = user
    app.globalData.isLogin = true
    
    if (user.role === 'teacher') {
      app.globalData.isTeacher = true
    }
  }

  /**
   * 登出
   */
  logout() {
    // 清除内存
    this.token = null
    this.userInfo = null
    
    // 清除本地存储
    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
    
    // 清除全局数据
    app.globalData.token = null
    app.globalData.userInfo = null
    app.globalData.isLogin = false
    app.globalData.isTeacher = false
    
    // 跳转到登录页
    wx.reLaunch({
      url: '/pages/login/login'
    })
  }

  /**
   * 检查登录状态，未登录则跳转登录页
   * @param {object} options - {showModal: boolean} 是否显示提示弹窗
   * @returns {boolean}
   */
  checkLogin(options = {}) {
    if (!this.isLogin()) {
      if (options.showModal) {
        wx.showModal({
          title: '提示',
          content: '请先登录',
          confirmText: '去登录',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/login/login'
              })
            }
          }
        })
      } else {
        wx.navigateTo({
          url: '/pages/login/login'
        })
      }
      return false
    }
    return true
  }

  /**
   * 检查教师权限
   * @param {object} options - {showModal: boolean} 是否显示提示弹窗
   * @returns {boolean}
   */
  checkTeacherRole(options = {}) {
    if (!this.isTeacher()) {
      if (options.showModal !== false) {
        wx.showModal({
          title: '权限不足',
          content: '该功能仅教师可用',
          showCancel: false
        })
      }
      return false
    }
    return true
  }

  /**
   * 检查任务访问权限（试用用户无法访问任务详情）
   * @param {object} options - {showModal: boolean, onUpgrade: function} 配置选项
   * @returns {boolean}
   */
  checkTaskAccess(options = {}) {
    // 教师用户有完全权限
    if (this.isTeacher()) {
      return true
    }

    // 检查是否为试用用户
    if (this.isTrialUser()) {
      if (options.showModal !== false) {
        wx.showModal({
          title: '试用用户无权限',
          content: '试用用户只能浏览课程目录，无法查看任务详情。请联系客服升级为付费学员。',
          confirmText: '联系客服',
          cancelText: '返回',
          success: (res) => {
            if (res.confirm && options.onUpgrade) {
              options.onUpgrade()
            }
          }
        })
      }
      return false
    }

    // 检查权限是否过期
    if (this.isPermissionExpired()) {
      if (options.showModal !== false) {
        wx.showModal({
          title: '权限已过期',
          content: '您的学习权限已过期，请联系客服续费。',
          confirmText: '联系客服',
          cancelText: '返回',
          success: (res) => {
            if (res.confirm && options.onUpgrade) {
              options.onUpgrade()
            }
          }
        })
      }
      return false
    }

    return true
  }

  /**
   * 获取用户权限状态描述
   * @returns {object} {type: string, status: string, expire: string}
   */
  getUserPermissionStatus() {
    if (!this.userInfo) {
      return { type: 'unknown', status: '未知', expire: null }
    }

    if (this.isTeacher()) {
      return { type: 'teacher', status: '教师', expire: null }
    }

    if (this.isPaidUser()) {
      return { 
        type: 'paid', 
        status: '付费学员', 
        expire: this.userInfo.permission_expire,
        isExpired: this.isPermissionExpired()
      }
    }

    if (this.isTrialUser()) {
      return { type: 'trial', status: '试用学员', expire: null }
    }

    return { type: 'unknown', status: '未知', expire: null }
  }
}

// 导出单例
module.exports = new AuthModule()