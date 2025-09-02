// components/task-card/task-card.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 任务数据
    task: {
      type: Object,
      value: {}
    },
    // 索引
    index: {
      type: Number,
      value: 0
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 动画数据
    animation: null
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      // 创建渐入动画
      const animation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease-out',
        delay: this.properties.index * 50 // 错开动画
      })
      
      animation.translateY(0).opacity(1).step()
      
      this.setData({
        animation: animation.export()
      })
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击卡片
    onTapCard() {
      const task = this.properties.task
      
      // 触发点击事件
      this.triggerEvent('click', { task })
      
      // 跳转到任务详情页
      wx.navigateTo({
        url: `/pages/task-detail/task-detail?id=${task.id}`
      })
    },

    // 长按卡片（可选功能）
    onLongPressCard() {
      const task = this.properties.task
      
      // 如果是教师，显示操作菜单
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && userInfo.role === 'teacher') {
        wx.showActionSheet({
          itemList: ['分享任务', '切换状态', '查看统计'],
          success: (res) => {
            if (res.tapIndex === 0) {
              // 分享任务
              this.shareTask()
            } else if (res.tapIndex === 1) {
              // 切换状态
              this.triggerEvent('toggleStatus', { task })
            } else if (res.tapIndex === 2) {
              // 查看统计
              this.triggerEvent('viewStats', { task })
            }
          }
        })
      }
    },

    // 分享任务
    shareTask() {
      const task = this.properties.task
      
      // 触发分享事件
      this.triggerEvent('share', { task })
    }
  }
})