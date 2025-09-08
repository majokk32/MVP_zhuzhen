# 前端业务模块核心约束文档

## 🎯 核心业务模块约束

### auth 认证模块 (modules/auth/)

#### 微信登录流程约束
```javascript
// 标准登录流程
wx.login() → 获取code 
→ 后端验证 → 返回token和用户信息
→ wx.getUserProfile() → 获取头像昵称
→ 本地存储用户信息 → 跳转首页
```

#### 权限验证约束
**核心验证方法**:
- `checkAuth()`: 检查token有效性
- `checkPermission(action)`: 检查具体操作权限
- `refreshToken()`: token过期自动刷新
- `logout()`: 清理本地数据，跳转登录页

#### Token管理约束
```javascript
// Token存储和使用规范
const TOKEN_KEY = 'jwt_token';
const USER_INFO_KEY = 'user_info';

// 自动添加认证头
header: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

### task 任务模块 (modules/task/)

#### 任务状态计算约束
**前端状态显示逻辑**（优先使用后端计算结果）:
1. **待提交**: 无提交记录或submission_count < 3
2. **待批改**: 已提交但status !== 'graded'
3. **已批改**: status === 'graded'，显示具体评价

#### 任务数据缓存约束
```javascript
// 任务列表缓存策略
const CACHE_KEY = 'task_list';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

// 缓存更新触发条件
- 下拉刷新
- 提交作业成功
- 页面onShow且缓存过期
```

#### 任务筛选约束
- **全部**: 显示所有任务
- **进行中**: task.status === 'ongoing'
- **已结束**: task.status === 'ended'  
- **课后加餐**: task.task_type === 'extra'，置顶显示

### submission 提交模块 (modules/submission/)

#### 图片上传约束
**上传流程规范**:
1. **选择图片**: wx.chooseImage，最多6张
2. **图片压缩**: 自动压缩至适合大小，保证清晰度
3. **并发上传**: 使用Promise.all，但限制并发数≤3
4. **进度反馈**: 实时显示每张图片上传进度
5. **失败重试**: 自动重试3次，仍失败显示重试按钮

#### 提交次数约束
```javascript
// 提交次数检查逻辑
const MAX_SUBMISSIONS = 3;

function canSubmit(submission) {
  // 待复盘状态：系统已重置提交次数
  if (submission.grade === '待复盘') {
    return true;
  }
  // 其他状态：检查提交次数
  return submission.submission_count < MAX_SUBMISSIONS;
}
```

#### 提交状态管理
- **提交中**: 禁用提交按钮，显示上传进度
- **提交成功**: 更新本地状态，跳转到待批改视图
- **提交失败**: 恢复按钮状态，显示错误信息和重试选项

### config 配置模块 (modules/config/)

#### API配置约束
```javascript
// API基础配置
const API_BASE_URL = 'https://api.domain.com';
const API_TIMEOUT = 30000; // 30秒超时

// 请求拦截器配置
- 自动添加Authorization头
- 自动处理token过期  
- 统一错误码处理
- 请求/响应日志记录
```

#### 环境配置约束
```javascript
// 多环境配置
const ENV_CONFIG = {
  development: {
    apiUrl: 'http://localhost:8000',
    debug: true
  },
  production: {
    apiUrl: 'https://api.production.com',
    debug: false  
  }
};
```

### speech 语音模块 (modules/speech/)

#### 语音转文字约束
**微信官方API优先使用**:
```javascript
// 使用微信官方录音API
wx.getRecorderManager()
// 集成通义千问API进行语音转文字
// 转写准确率要求≥85%
```

#### 录音控制约束
- **录音时长**: 最长60秒，超时自动停止
- **录音格式**: 使用微信支持的格式（mp3/aac）
- **权限检查**: 录音前检查麦克风权限
- **状态反馈**: 录音中显示音量波形和时长

#### 转写流程约束
```javascript
// 语音转文字流程
录音完成 → 上传音频文件 → 调用转写API 
→ 获取文字结果 → 支持用户编辑 → 保存最终结果
```

## 🔧 模块间通信约束

### 事件总线机制
```javascript
// 全局事件管理
const EventBus = {
  // 订阅事件
  on(event, callback) {},
  // 发布事件  
  emit(event, data) {},
  // 取消订阅
  off(event, callback) {}
};

// 关键业务事件
EVENT_TYPES = {
  USER_LOGIN: 'user_login',
  TASK_UPDATED: 'task_updated', 
  SUBMISSION_SUCCESS: 'submission_success',
  PERMISSION_CHANGED: 'permission_changed'
}
```

### 数据共享约束
```javascript
// 全局数据管理
const GlobalStore = {
  userInfo: null,      // 用户基础信息
  permissions: {},     // 权限信息
  taskList: [],        // 任务列表缓存
  learningData: {}     // 学习数据缓存
};

// 数据更新通知机制
function updateGlobalData(key, data) {
  GlobalStore[key] = data;
  EventBus.emit(`${key}_updated`, data);
}
```

### 模块依赖关系
```javascript
// 模块依赖层次
auth (基础层) 
  ↓
config → task → submission (业务层)
  ↓  
speech (功能层)

// 避免循环依赖，上层模块可调用下层模块
```

## 🎨 用户体验约束

### 错误处理统一规范
```javascript
// 标准错误处理流程
function handleError(error) {
  // 1. 日志记录
  console.error('[Module Error]', error);
  
  // 2. 用户友好提示
  const message = getErrorMessage(error);
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 3000
  });
  
  // 3. 降级处理
  return getErrorFallback(error);
}
```

### 加载状态管理
- **页面级loading**: 整页数据加载时显示
- **组件级loading**: 局部数据更新时显示
- **按钮loading**: 操作执行中禁用并显示loading
- **skeleton**: 列表和卡片的骨架屏占位

### 缓存策略约束
```javascript
// 缓存管理规范
const CacheManager = {
  // 设置缓存（带过期时间）
  set(key, data, duration = 5 * 60 * 1000) {},
  
  // 获取缓存（检查过期）
  get(key) {},
  
  // 清理过期缓存
  cleanup() {},
  
  // 清除所有缓存
  clear() {}
};
```

## ⚠️ 重要约束提醒

### 微信小程序限制
1. **网络请求**: 必须配置域名白名单，使用HTTPS
2. **本地存储**: 同步存储wx.setStorageSync限制10MB
3. **页面栈深度**: 最多10层，超过需要使用redirectTo
4. **包大小限制**: 主包2MB，分包2MB，总包20MB

### 性能优化要求
1. **首屏渲染**: 关键路径优化，首屏时间<2秒
2. **内存使用**: 及时清理未使用的数据和监听器
3. **网络请求**: 合并请求，避免频繁调用
4. **图片处理**: 压缩上传，懒加载显示

### 安全约束
1. **敏感数据**: Token等信息加密存储
2. **接口调用**: 所有API请求添加认证
3. **用户输入**: 表单数据验证和过滤
4. **错误日志**: 不记录敏感信息到日志

### 兼容性处理
1. **API兼容**: 检查微信版本，使用兼容API
2. **机型适配**: 处理不同屏幕尺寸和性能差异
3. **网络环境**: 弱网环境下的降级处理
4. **异常恢复**: 提供用户手动重试和重置选项

## 📋 模块开发检查清单
- [ ] 是否遵循微信官方API优先原则
- [ ] 是否实现完整的错误处理机制
- [ ] 是否添加合适的缓存策略
- [ ] 是否考虑权限控制和安全约束
- [ ] 是否提供良好的用户体验反馈
- [ ] 是否符合性能优化要求
- [ ] 是否考虑兼容性和降级方案