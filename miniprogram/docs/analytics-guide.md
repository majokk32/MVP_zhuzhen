# 关键业务埋点系统使用指南

本系统提供了全面的用户行为和业务关键指标追踪功能。

## 📊 系统概述

### 核心模块
- **Analytics (`utils/analytics.js`)**: 核心埋点系统，处理事件收集、存储和上报
- **Analytics Helper (`utils/analytics-helper.js`)**: 便捷工具，提供装饰器和业务特定埋点方法
- **Error Handler Integration**: 与错误处理系统集成，自动追踪错误事件

### 主要功能
- ✅ 用户认证和会话追踪
- ✅ 学习行为和任务进度追踪  
- ✅ 支付和订阅事件追踪
- ✅ 功能使用和页面访问追踪
- ✅ 错误和性能指标追踪
- ✅ 用户交互和停留时间追踪

## 🚀 快速开始

### 1. 自动页面追踪

```javascript
// 在页面中使用装饰器自动追踪
const { wrapPage } = require('../../utils/analytics-helper');

Page(wrapPage({
  data: { /* ... */ },
  
  onLoad(options) {
    // 自动追踪页面加载
    // 自动追踪加载时间
  },
  
  onButtonClick() {
    // 自动追踪用户交互
  }
}));
```

### 2. 手动事件追踪

```javascript
const { analytics } = require('../../utils/analytics-helper');

// 追踪自定义事件
analytics.track('custom_event', {
  custom_property: 'value',
  user_action: 'button_click'
});

// 追踪业务事件
analytics.trackTaskSubmission(taskId, taskType, submissionData);
analytics.trackPaymentStart(paymentData);
```

## 📋 核心埋点事件

### 用户认证埋点
```javascript
// 登录事件
analytics.trackLogin('wechat', true); // 成功
analytics.trackLogin('wechat', false, error); // 失败

// 注册事件
analytics.trackRegistration('wechat', 'student');

// 登出事件
analytics.trackLogout('user_action');
```

### 学习行为埋点
```javascript
// 任务相关
analytics.trackTaskSubmission(taskId, taskType, {
  submissionId: '12345',
  wordCount: 800,
  timeSpent: 1800000 // 30分钟
});

analytics.trackTaskCompletion(taskId, taskType, score, feedback);

// 学习进度
analytics.trackLearningProgress({
  totalTasks: 50,
  completedTasks: 35,
  completionRate: 70,
  currentStreak: 7
});

// 打卡签到
analytics.trackCheckin('daily', 7);
```

### 支付订阅埋点
```javascript
// 支付流程
analytics.trackPaymentStart({
  orderId: 'order_123',
  planId: 'monthly',
  amount: 2990,
  paymentMethod: 'wechat_pay'
});

analytics.trackPaymentSuccess({
  orderId: 'order_123',
  transactionId: 'tx_456',
  amount: 2990
});

analytics.trackPaymentFailure(paymentData, error);

// 订阅状态变更
analytics.trackSubscriptionChange({
  subscriptionId: 'sub_123',
  oldStatus: 'trial',
  newStatus: 'active',
  planId: 'monthly'
});
```

### 功能使用埋点
```javascript
// 功能访问
analytics.trackFeatureAccess('leaderboard', 'success');
analytics.trackFeatureAccess('export_data', 'permission_denied');

// 页面访问
analytics.trackPageView('/pages/tasks/tasks', '/pages/index/index', 1500);

// 分享行为
analytics.trackShare({
  shareType: 'task_achievement',
  channel: 'wechat',
  contentType: 'achievement',
  contentId: 'achievement_123'
});
```

## 🔧 便捷工具使用

### 业务操作包装器
```javascript
const { wrapBusinessOperation } = require('../../utils/analytics-helper');

// 包装业务操作，自动追踪成功/失败
const submitTask = wrapBusinessOperation('task_submit', async (taskData) => {
  return await api.submitTask(taskData);
}, { task_type: 'writing' });
```

### 表单和交互追踪
```javascript
const { trackFormSubmit, trackButtonClick } = require('../../utils/analytics-helper');

// 表单提交
trackFormSubmit('login_form', formData, validationErrors);

// 按钮点击
trackButtonClick('submit_task', 'primary', { 
  task_id: '123',
  page_context: 'task_detail' 
});
```

### 业务特定埋点
```javascript
const { taskAnalytics, learningAnalytics, socialAnalytics } = require('../../utils/analytics-helper');

// 任务相关埋点
taskAnalytics.viewTask(taskId, taskType);
taskAnalytics.startTask(taskId, taskType);
taskAnalytics.saveTaskDraft(taskId, taskType, draftData);

// 学习数据埋点
learningAnalytics.updateProgress(progressData);
learningAnalytics.viewReport('weekly', reportData);
learningAnalytics.exportData('csv', 'last_month');

// 社交功能埋点
socialAnalytics.viewLeaderboard('monthly', 'current_month');
socialAnalytics.shareContent('achievement', 'wechat', contentData);
```

## 🎯 自动追踪功能

### 启用自动追踪
```javascript
const { enableAutoTracking } = require('../../utils/analytics-helper');

// 启用自动追踪
enableAutoTracking({
  pageViews: true,        // 页面访问追踪
  userInteractions: true, // 用户交互追踪
  errors: true,          // 错误追踪
  performance: true,     // 性能追踪
  api: true             // API调用追踪
});
```

### 页面和组件装饰器
```javascript
const { wrapPage, wrapComponent } = require('../../utils/analytics-helper');

// 页面装饰器 - 自动追踪生命周期和交互
Page(wrapPage({
  onLoad() { /* 自动追踪页面加载 */ },
  onButtonClick() { /* 自动追踪用户交互 */ }
}));

// 组件装饰器 - 自动追踪组件方法调用
Component(wrapComponent({
  methods: {
    onItemClick() { /* 自动追踪组件交互 */ }
  }
}));
```

## 📊 数据上报和统计

### 手动上报
```javascript
const { analytics, flush } = require('../../utils/analytics-helper');

// 立即上报所有事件
await flush();

// 获取统计信息
const stats = analytics.getStats();
console.log('Session ID:', stats.session_id);
console.log('Event Queue Size:', stats.queue_size);
```

### 用户身份设置
```javascript
const { setUser } = require('../../utils/analytics-helper');

// 设置用户身份（通常在登录后调用）
setUser('user_123', 'student', {
  grade: 'senior',
  subject: 'writing'
});
```

## 🔍 错误和性能追踪

系统自动集成错误处理器，无需手动调用：

```javascript
// 错误自动追踪（通过 error-handler 集成）
// - API 错误
// - UI 错误  
// - 支付错误
// - 网络错误

// 性能自动追踪
// - 页面加载时间
// - API 响应时间
// - 用户操作延迟
```

## 🎛️ 高级配置

### 自定义事件属性
```javascript
// 所有事件自动包含的通用属性：
// - user_id: 用户ID
// - user_role: 用户角色
// - session_id: 会话ID
// - timestamp: 时间戳
// - page_route: 当前页面路由
// - device_info: 设备信息
// - network_type: 网络类型
// - app_version: 应用版本
```

### 批量事件处理
```javascript
// 系统自动批量上报事件：
// - 队列达到50个事件时自动上报
// - 每30秒定期上报
// - 应用隐藏时立即上报
// - 高优先级事件立即上报
```

## 📝 最佳实践

### 1. 合理使用自动追踪
- 对重要页面使用 `wrapPage()` 装饰器
- 对核心组件使用 `wrapComponent()` 装饰器
- 启用适合的自动追踪功能

### 2. 重点关注关键业务指标
- 用户转化漏斗（注册→首次使用→付费）
- 核心功能使用率（任务提交、学习进度）
- 用户留存和活跃度指标

### 3. 错误和性能监控
- 关注高频错误和性能瓶颈
- 监控关键业务流程的成功率
- 追踪用户体验指标

### 4. 数据隐私保护
- 避免追踪敏感个人信息
- 遵循数据保护法规
- 提供用户选择退出机制

## 🔗 相关文档
- [错误处理系统](./error-handling-guide.md)
- [性能优化指南](./performance-guide.md)
- [API 文档](./api-reference.md)