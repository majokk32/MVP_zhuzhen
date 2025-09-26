
// components/task-card/task-card.js
const authModule = require('../../modules/auth/auth');
const { formatDateTime, getChinaTime } = require('../../utils/time-formatter');

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
    animation: null,
    // PRD状态显示
    rightStatus: "",
    leftStatus: "",
    cardStyle: "normal",
    // 权限状态
    userPermission: null,
    showPermissionBadge: false,
    // 格式化时间
    formattedTime: ""
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      // 计算PRD状态显示
      this.calculateDisplayStatus()
      // 检查用户权限
      this.checkUserPermission()
      // 格式化时间显示
      this.formatTimeDisplay()
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
      
      // 只触发点击事件，让父组件处理权限检查和导航
      this.triggerEvent('click', { task })
    },

    // 处理升级联系客服
    handleUpgradeContact() {
      wx.showModal({
        title: '联系客服',
        content: '请通过微信群联系客服或拨打客服电话升级为付费学员',
        confirmText: '我知道了',
        showCancel: false
      });
    },

    // 检查用户权限状态 (已禁用权限标签显示)
    checkUserPermission() {
      const userPermission = authModule.getUserPermissionStatus();
      
      this.setData({
        userPermission,
        showPermissionBadge: false // 不显示权限标签
      });
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
    },

    // 计算PRD状态显示
    calculateDisplayStatus() {
      const task = this.properties.task
      if (!task) return

      // 优先使用后端返回的状态显示字段
      if (task.display_right_status && task.display_left_status && task.display_card_style) {
        this.setData({
          rightStatus: task.display_right_status,
          leftStatus: task.display_left_status,
          cardStyle: task.display_card_style
        })
        return
      }

      // 如果后端没有返回状态字段，则使用前端计算逻辑作为兜底
      let rightStatus = ''
      let leftStatus = ''
      let cardStyle = 'normal'

      // 计算右上角状态（PRD要求：待提交/待批改/评价档位）
      if (!task.submission_status || task.submission_status === '未提交') {
        rightStatus = '待提交'
      } else if (task.submission_status === 'submitted') {
        rightStatus = '待批改'
      } else if (task.submission_grade) {
        rightStatus = task.submission_grade // 待复盘/优秀/极佳
      } else {
        rightStatus = '已批改'
      }

      // 计算左下角状态（PRD要求：正在进行中/课后加餐/已结束/已完成）
      const now = getChinaTime()
      const deadline = task.deadline ? new Date(task.deadline) : null

      if (task.task_type === 'extra') {
        leftStatus = '课后加餐'
      } else if (task.status === 'ongoing') {
        if (deadline && now > deadline) {
          leftStatus = '已结束'
        } else {
          leftStatus = '正在进行中'
        }
      } else if (task.status === 'ended') {
        if (task.submission_status === 'graded' && task.submission_grade) {
          leftStatus = '已完成'
          cardStyle = 'completed'
        } else {
          leftStatus = '已结束'
          cardStyle = 'ended'
        }
      } else {
        leftStatus = '正在进行中'
      }

      this.setData({
        rightStatus,
        leftStatus,
        cardStyle
      })
    },

    // 格式化时间显示
    formatTimeDisplay() {
      const task = this.properties.task
      if (!task) return

      // 优先显示截止时间，其次是创建时间
      const timeToFormat = task.deadline || task.created_at
      const formattedTime = formatDateTime(timeToFormat)
      
      this.setData({
        formattedTime
      })
    }
  }
})
