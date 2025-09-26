// 试用限制提示组件
Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    // 关闭弹窗
    onClose() {
      this.triggerEvent('close');
    },

    // 阻止事件冒泡
    preventDefault() {
      // 空方法，防止点击内容区域关闭弹窗
    }
  }
});