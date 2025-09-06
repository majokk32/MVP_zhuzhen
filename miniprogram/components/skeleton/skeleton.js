// components/skeleton/skeleton.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 是否显示骨架屏
    show: {
      type: Boolean,
      value: false
    },
    // 骨架屏类型
    type: {
      type: String,
      value: 'simple-list' // simple-list, task-list, student-list, grading-list, stats, custom
    },
    // 骨架屏数量
    count: {
      type: Number,
      value: 3
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

  }
})