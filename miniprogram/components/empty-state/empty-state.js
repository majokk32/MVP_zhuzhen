// components/empty-state/empty-state.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 是否显示空状态
    show: {
      type: Boolean,
      value: false
    },
    // 图标
    icon: {
      type: String,
      value: '📝'
    },
    // 标题
    title: {
      type: String,
      value: '暂无数据'
    },
    // 描述文字
    description: {
      type: String,
      value: ''
    },
    // 是否显示操作按钮
    showAction: {
      type: Boolean,
      value: false
    },
    // 操作按钮文字
    actionText: {
      type: String,
      value: ''
    },
    // 操作按钮类型
    actionType: {
      type: String,
      value: 'primary' // primary, secondary, outline, text
    }
  },

  /**
   * 组件的初始数据
   */
  data: {

  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 操作按钮点击
    onActionClick() {
      this.triggerEvent('actionClick')
    }
  }
})