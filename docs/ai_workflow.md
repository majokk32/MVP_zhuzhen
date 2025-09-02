# AI Coding 工作流 - 公考督学助手

## 核心理念
**15-30分钟交付第一版 → 人工审查 → AI迭代 → 1小时内完成**

---

## 一、项目结构设计（模块化 + 文档化）

```
MVP_zhuzhen/
├── backend/                 # 后端项目（已完成）
│   └── [已有结构]
│
├── miniprogram/            # 小程序项目
│   ├── modules/           # 模块化组件（每个<500行）
│   │   ├── auth/         # 认证模块
│   │   │   ├── README.md     # 模块文档
│   │   │   ├── auth.js       # 实现（<200行）
│   │   │   ├── auth.test.js  # 测试
│   │   │   └── types.d.ts    # 接口定义
│   │   │
│   │   ├── task/         # 任务模块
│   │   │   ├── README.md
│   │   │   ├── task.js
│   │   │   ├── task-card.wxml   # 组件模板
│   │   │   ├── task-card.wxss   # 组件样式
│   │   │   └── task.test.js
│   │   │
│   │   ├── submission/   # 提交模块
│   │   ├── grading/      # 批改模块
│   │   └── api/          # API模块
│   │
│   ├── pages/            # 页面（调用模块）
│   │   ├── index/        # 每个页面<300行
│   │   ├── task-detail/
│   │   └── admin/
│   │
│   └── .ai/              # AI专用配置
│       ├── prompts.md    # 提示词模板
│       ├── tasks.md      # 任务清单
│       └── review.md     # 审查标准
│
└── .github/
    └── workflows/        # CI/CD配置
        ├── lint.yml      # 代码检查
        └── test.yml      # 自动测试
```

---

## 二、模块接口规范（清晰分离）

### 2.1 接口定义示例

```typescript
// modules/auth/types.d.ts
interface IAuthModule {
  // 登录
  login(code: string): Promise<LoginResult>
  // 获取当前用户
  getCurrentUser(): User | null
  // 登出
  logout(): void
  // 检查权限
  hasRole(role: 'student' | 'teacher'): boolean
}

interface LoginResult {
  token: string
  user: User
}

interface User {
  id: number
  nickname: string
  avatar: string
  role: 'student' | 'teacher'
}
```

### 2.2 实现示例

```javascript
// modules/auth/auth.js
/**
 * 认证模块
 * 负责：微信登录、Token管理、用户信息
 * 依赖：api模块
 * @module auth
 */

const api = require('../api/api')

class AuthModule {
  constructor() {
    this.user = null
    this.token = wx.getStorageSync('token')
  }

  /**
   * 微信登录
   * @param {string} code - wx.login获取的code
   * @returns {Promise<LoginResult>}
   */
  async login(code) {
    const result = await api.post('/users/login', { code })
    this.token = result.token
    this.user = result.user
    wx.setStorageSync('token', result.token)
    wx.setStorageSync('user', result.user)
    return result
  }

  getCurrentUser() {
    if (!this.user) {
      this.user = wx.getStorageSync('user')
    }
    return this.user
  }

  hasRole(role) {
    return this.user?.role === role
  }

  logout() {
    this.user = null
    this.token = null
    wx.clearStorageSync()
  }
}

module.exports = new AuthModule()
```

---

## 三、任务分解模板（GitHub Issue）

### Issue 模板示例

```markdown
## 任务：实现任务列表页

### 背景
学生需要在首页看到所有任务，按时间倒序排列，显示提交状态。

### 需求明细
1. 显示任务卡片列表
2. 每个卡片显示：标题、状态、日期、得分
3. 下拉刷新功能
4. 点击进入详情页

### 接口依赖
- GET /api/v1/tasks/ 获取任务列表
- 参考：backend/app/api/tasks.py:45-96

### UI参考
- 设计稿：docs/ui_design/components_guide.md:88-104
- 任务卡片四种状态：待提交、待批改、已完成、已结束

### 验收标准
- [ ] 页面正常显示
- [ ] 数据正确加载
- [ ] 下拉刷新工作
- [ ] 点击跳转正常
- [ ] 无控制台错误

### 代码位置
- pages/index/
- modules/task/
```

---

## 四、AI提示词体系（分层管理）

### 4.1 项目层提示词

```markdown
# .ai/prompts.md

## 项目上下文
你正在开发一个公考督学小程序，使用原生微信小程序开发。

## 代码规范
1. 每个文件不超过300行
2. 每个函数不超过30行
3. 使用async/await处理异步
4. 所有API调用通过api模块
5. 错误统一处理

## 命名规范
- 文件：kebab-case
- 函数：camelCase
- 组件：PascalCase
- 常量：UPPER_SNAKE_CASE
```

### 4.2 任务层提示词

```markdown
## 当前任务：实现任务列表页

### 输入
- 任务清单（见上方Issue）
- API文档：backend/README.md
- UI规范：docs/ui_design/components_guide.md

### 输出要求
1. 完整可运行的代码
2. 包含必要注释
3. 错误处理完善
4. 符合项目规范

### 时间要求
15-30分钟内完成第一版
```

---

## 五、快速开发流程

### 5.1 任务分配（人工 5分钟）

```markdown
1. 创建Issue，明确需求
2. 指定模块和页面
3. 提供接口文档链接
4. 设定验收标准
```

### 5.2 AI开发（15-30分钟）

```markdown
1. AI读取Issue和相关文档
2. 生成模块代码
3. 生成页面代码
4. 生成测试代码
5. 自检并修复明显问题
```

### 5.3 人工审查（10分钟）

```markdown
1. 代码规范检查
2. 业务逻辑验证
3. 运行测试
4. 标记需要修改的地方
```

### 5.4 AI迭代（15分钟）

```markdown
1. 根据审查意见修改
2. 优化性能
3. 补充边界处理
4. 完善注释文档
```

---

## 六、质量保证机制

### 6.1 自动化检查（CI/CD）

```yaml
# .github/workflows/lint.yml
name: Lint and Format

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: ESLint Check
        run: npx eslint miniprogram/
      - name: Format Check
        run: npx prettier --check miniprogram/
```

### 6.2 模块测试

```javascript
// modules/auth/auth.test.js
const auth = require('./auth')

describe('Auth Module', () => {
  test('login should save token', async () => {
    const result = await auth.login('test_code')
    expect(result.token).toBeDefined()
    expect(wx.getStorageSync('token')).toBe(result.token)
  })
  
  test('hasRole should check user role', () => {
    auth.user = { role: 'teacher' }
    expect(auth.hasRole('teacher')).toBe(true)
    expect(auth.hasRole('student')).toBe(false)
  })
})
```

---

## 七、实际任务示例

### 任务1：实现登录功能（第一个15分钟）

```markdown
## Issue #1: 实现微信登录

### 需求
1. 创建auth模块
2. 实现login方法
3. 创建登录页面
4. 处理授权流程

### AI指令
基于 modules/auth/types.d.ts 接口定义，实现完整的认证模块。
包括：auth.js实现、login页面、错误处理。
参考后端接口：backend/app/api/users.py:login

### 期望输出
- modules/auth/auth.js (150行)
- pages/login/login.js (100行)
- pages/login/login.wxml (50行)
```

### 任务2：实现任务列表（第二个15分钟）

```markdown
## Issue #2: 实现任务列表页

### 需求
1. 创建task模块
2. 实现列表获取
3. 创建任务卡片组件
4. 实现首页

### AI指令
基于已完成的auth模块，实现任务列表功能。
调用 GET /api/v1/tasks/ 接口，展示任务卡片。
参考UI设计：docs/ui_design/components_guide.md

### 期望输出
- modules/task/task.js (200行)
- modules/task/task-card.wxml (80行)
- pages/index/index.js (150行)
```

---

## 八、迭代优化策略

### 8.1 性能优化（第二轮）

```javascript
// 优化前
onLoad() {
  this.loadTasks()
  this.loadUser()
  this.loadStats()
}

// 优化后
onLoad() {
  // 并行加载
  Promise.all([
    this.loadTasks(),
    this.loadUser(),
    this.loadStats()
  ])
}
```

### 8.2 用户体验优化（第三轮）

```javascript
// 添加加载状态
setData({
  loading: true,
  error: null
})

// 添加错误处理
.catch(err => {
  this.setData({
    error: '加载失败，请重试',
    loading: false
  })
})
```

---

## 九、关键成功因素

### 1. 明确的任务边界
- 每个任务只做一件事
- 明确输入输出
- 提供所有依赖

### 2. 标准化的代码结构
- 统一的模块模板
- 统一的错误处理
- 统一的命名规范

### 3. 快速反馈循环
- 15分钟看到结果
- 立即测试验证
- 快速修复问题

### 4. 文档驱动开发
- 先写接口定义
- 再写实现代码
- 同步更新文档

---

## 十、执行计划

### 今日任务（4小时完成MVP）

| 时间 | 任务 | 负责人 | 产出 |
|------|------|--------|------|
| 0:00-0:30 | 登录模块 | AI | auth模块 + 登录页 |
| 0:30-1:00 | 任务列表 | AI | task模块 + 首页 |
| 1:00-1:30 | 任务详情 | AI | 详情页 + 提交功能 |
| 1:30-2:00 | 批改功能 | AI | grade模块 + 批改页 |
| 2:00-2:30 | 教研中心 | AI | admin模块 + 管理页 |
| 2:30-3:00 | 集成测试 | 人工 | 完整流程测试 |
| 3:00-4:00 | 优化部署 | AI+人工 | 性能优化 + 发布 |

### 明日优化

1. 添加动画效果
2. 优化加载性能
3. 完善错误处理
4. 补充单元测试

---

## 🎯 立即行动

**下一步指令：**
```
请基于上述工作流，实现第一个任务：
1. 创建小程序项目结构
2. 实现auth认证模块
3. 创建登录页面
时间：15分钟
```

这个方案的核心是：
- **模块化**：每个功能独立，便于AI理解和生成
- **标准化**：统一的结构和规范，减少沟通成本
- **快速迭代**：15分钟一个循环，快速看到结果
- **文档驱动**：清晰的接口定义，AI和人都能理解