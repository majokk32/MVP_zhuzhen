// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    color: "#666666",
    selectedColor: "#667eea",
    backgroundColor: "#ffffff",
    list: []
  },

  attached() {
    this.updateTabBarData()
  },

  methods: {
    // 更新tabBar数据
    updateTabBarData() {
      const app = getApp()
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
      
      // 基础tabBar配置
      let list = [
        {
          "pagePath": "/pages/index/index",
          "text": "任务",
          "icon": "📝",
          "selectedIcon": "📝"
        },
        {
          "pagePath": "/pages/profile/profile",
          "text": "我的", 
          "icon": "👤",
          "selectedIcon": "👤"
        }
      ]
      
      // 如果是教师角色，添加教研标签
      if (userInfo && (userInfo.isTeacher || userInfo.role === 'teacher')) {
        list.push({
          "pagePath": "/pages/admin/index/index", 
          "text": "教研",
          "icon": "🎓",
          "selectedIcon": "🎓"
        })
      }
      
      this.setData({ list })
      
      // 设置当前选中项
      this.updateSelected()
    },

    // 更新当前选中项
    updateSelected() {
      const pages = getCurrentPages()
      if (pages.length === 0) return
      
      const currentPage = pages[pages.length - 1]
      const currentPath = '/' + currentPage.route
      
      const selected = this.data.list.findIndex(item => item.pagePath === currentPath)
      if (selected !== -1) {
        this.setData({ selected })
      }
    },

    // 切换tabBar
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      
      if (url === getCurrentPages()[getCurrentPages().length - 1].route) {
        return
      }
      
      wx.switchTab({ url })
      this.setData({
        selected: data.index
      })
    }
  }
})