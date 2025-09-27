// 创建新任务页
const authModule = require('../../../modules/auth/auth');
const taskModule = require('../../../modules/task/task');

Page({
  data: {
    isSubmitting: false,
    canSubmit: false,
    
    // 表单数据 - 对应后端TaskCreate schema
    formData: {
      title: '',           // 任务标题 (对应course字段)
      desc: '',            // 题目详情
      startDate: '',       // 直播开始日期
      startTime: '',       // 直播开始时间
      deadlineDate: '',    // 截止日期
      typeIndex: 0         // 任务类型索引
    },
    
    // 任务类型选项
    taskTypes: [
      { name: '真题', value: 'exam' },
      { name: '模拟题', value: 'mock' },
      { name: '练习题', value: 'practice' }
    ],
    
    // 表单验证错误
    errors: {}
  },

  onLoad() {
    this.checkPermission();
    this.updateCanSubmit();
  },

  // 检查用户权限
  checkPermission() {
    const userInfo = authModule.getUserInfo();
    
    if (!userInfo || userInfo.role !== 'teacher') {
      wx.showModal({
        title: '权限不足',
        content: '您没有创建任务的权限',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return false;
    }
    return true;
  },

  // 输入框变化
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    
    this.setData({
      [`formData.${field}`]: value,
      [`errors.${field}`]: '' // 清除错误
    });
    
    this.updateCanSubmit();
  },

  // 直播开始日期选择
  onStartDateChange(e) {
    this.setData({
      'formData.startDate': e.detail.value,
      'errors.startDate': ''
    });
    this.updateCanSubmit();
  },

  // 直播开始时间选择
  onStartTimeChange(e) {
    this.setData({
      'formData.startTime': e.detail.value,
      'errors.startTime': ''
    });
    this.updateCanSubmit();
  },

  // 截止日期选择 (自动设置为当天23:59)
  onDeadlineDateChange(e) {
    this.setData({
      'formData.deadlineDate': e.detail.value,
      'errors.deadlineDate': ''
    });
    this.updateCanSubmit();
  },

  // 任务类型选择
  onTypeChange(e) {
    this.setData({
      'formData.typeIndex': parseInt(e.detail.value)
    });
  },

  // 格式化日期时间显示
  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    const date = new Date(dateTimeStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  // 更新提交按钮状态
  updateCanSubmit() {
    const { title, desc, startDate, startTime, deadlineDate } = this.data.formData;
    const canSubmit = title.trim() && 
                     desc.trim() && 
                     startDate && 
                     startTime && 
                     deadlineDate;
    
    this.setData({ canSubmit });
  },

  // 表单验证
  validateForm() {
    const { title, desc, startDate, startTime, deadlineDate } = this.data.formData;
    const errors = {};

    if (!title.trim()) {
      errors.title = '请输入课程名称';
    }

    if (!desc.trim()) {
      errors.desc = '请输入题目详情';
    }

    if (!startDate) {
      errors.startDate = '请选择直播开始日期';
    }

    if (!startTime) {
      errors.startTime = '请选择直播开始时间';
    }

    if (!deadlineDate) {
      errors.deadlineDate = '请选择截止日期';
    }

    this.setData({ errors });
    return Object.keys(errors).length === 0;
  },

  // 提交表单
  async onSubmit() {
    if (!this.validateForm()) {
      wx.showToast({
        title: '请完善表单信息',
        icon: 'none'
      });
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      const { title, desc, startDate, startTime, deadlineDate } = this.data.formData;

      // 合并直播开始日期和时间
      const liveStartTime = `${startDate}T${startTime}:00`;
      
      // 将截止日期设置为当天的23:59:59
      const deadline = `${deadlineDate}T23:59:59`;

      // 构造符合后端TaskCreate schema的数据
      const taskData = {
        title: title.trim(),              // 任务标题
        course: title.trim(),             // 课程名称 (使用相同的标题)
        desc: desc.trim(),                // 题目详情
        total_score: 40,                  // 默认总分40
        deadline: deadline,               // 截止时间 (自动设置为当天23:59:59)
        live_start_time: liveStartTime,   // 直播开始时间
        status: 'ongoing'                 // 默认状态为进行中
      };

      console.log('📤 [DEBUG] 创建任务数据:', taskData);

      const result = await taskModule.createTask(taskData);
      
      // 任务创建成功，result应该直接是data部分
      if (result && result.id) {
        wx.showToast({
          title: '任务创建成功',
          icon: 'success'
        });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error('创建失败：未返回任务ID');
      }
    } catch (error) {
      console.error('❌ [ERROR] 创建任务失败:', error);
      wx.showToast({
        title: error.message || '创建失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  }
});