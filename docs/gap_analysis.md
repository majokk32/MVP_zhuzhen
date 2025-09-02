# PRD需求与实现差异分析

## ✅ 已完成功能

### 后端API已实现
1. **用户管理**
   - ✅ 微信登录 (POST /api/v1/users/login)
   - ✅ 个人信息获取/修改 (GET/PUT /api/v1/users/profile)
   - ✅ 教师权限授予 (POST /api/v1/users/grant-teacher)

2. **任务管理**
   - ✅ 创建任务 (POST /api/v1/tasks/)
   - ✅ 任务列表 (GET /api/v1/tasks/)
   - ✅ 任务详情 (GET /api/v1/tasks/{id})
   - ✅ 任务状态切换 (POST /api/v1/tasks/{id}/toggle-status)
   - ✅ 任务更新/删除 (PUT/DELETE /api/v1/tasks/{id})

3. **作业提交**
   - ✅ 图片上传 (POST /api/v1/submissions/upload-image)
   - ✅ 作业提交 (POST /api/v1/submissions/submit)
   - ✅ 3次提交限制
   - ✅ 获取我的提交 (GET /api/v1/submissions/my-submissions)

4. **批改功能**
   - ✅ 批改作业 (POST /api/v1/submissions/grade)
   - ✅ 待批改列表 (GET /api/v1/submissions/pending-grading)
   - ✅ 评价档位（待复盘/优秀/极佳）

5. **管理功能**
   - ✅ 任务进度统计 (GET /api/v1/admin/task-progress)
   - ✅ 学生列表 (GET /api/v1/admin/students)
   - ✅ 学生作业查询 (GET /api/v1/admin/student/{id}/submissions)
   - ⚠️ 批量下载（简单实现）(POST /api/v1/admin/batch-download/{task_id})

## ❌ PRD要求但未实现的功能

### 1. 任务卡片显示逻辑
**PRD要求**：
- 右上角显示：`待提交`/`待批改`/评价档位
- 左下角状态：`正在进行中`/`课后加餐`/`已结束`/`已完成`

**当前状态**：
- 后端返回了submission_status，但需要前端处理显示逻辑
- 需要添加任务类型字段区分"直播课"和"课后加餐"

### 2. 微信服务通知
**PRD要求**：
- 作业批改完成提醒
- 课前2小时作业截止提醒
- 新作业发布提醒（V2.0）

**需要补充**：
- 后端添加通知接口
- 集成微信模板消息API
- 添加定时任务（课前提醒）

### 3. 作业分享功能（Deep Linking）
**PRD要求**：
- 生成分享卡片
- 支持深链接直达作业提交页

**需要补充**：
- 生成分享链接API
- 处理深链接参数

### 4. 批量下载优化
**PRD要求**：
- 打包为ZIP文件
- 文件命名：`[学生昵称]_[题目日期].ext`

**当前状态**：
- 仅返回URL列表，需要实现ZIP打包

### 5. 教研功能界面
**PRD要求**：
- 底部导航栏动态显示"教研"入口（仅教师可见）
- 三个管理模块入口

**需要实现**：
- 前端根据用户角色动态显示tabBar

## 📝 需要补充的后端功能

### 优先级1（立即补充）
1. **任务类型字段**
   ```python
   # models.py 添加
   class TaskType(str, enum.Enum):
       LIVE = "live"  # 直播课
       EXTRA = "extra"  # 课后加餐
   ```

2. **分享链接生成**
   ```python
   # POST /api/v1/tasks/{id}/share
   # 返回：{share_url, share_card_config}
   ```

3. **通知接口**
   ```python
   # POST /api/v1/notifications/grade-complete
   # POST /api/v1/notifications/deadline-reminder
   ```

### 优先级2（后续迭代）
1. ZIP批量下载
2. 定时任务系统
3. 数据埋点接口

## 🎨 前端需要实现的核心功能

### 学生端
1. **登录授权页**
   - 微信授权
   - 自动登录

2. **任务列表页（首页）**
   - 任务卡片（4种状态）
   - 下拉刷新
   - 置顶逻辑（课后加餐）

3. **任务详情页**
   - 三种视图（待提交/待批改/已批改）
   - 图片上传（最多6张）
   - 重新提交（最多3次）

4. **个人中心**
   - 头像昵称
   - 修改昵称

### 教师端
1. **教研入口**（动态tabBar）
2. **任务管理**
3. **批改工作台**
4. **学生管理**

## 🔧 立即行动计划

### Step 1: 补充后端（30分钟）
- [ ] 添加任务类型字段
- [ ] 实现分享链接API
- [ ] 添加通知接口框架

### Step 2: 创建小程序基础（15分钟）
- [ ] 项目结构
- [ ] 配置文件
- [ ] 基础组件

### Step 3: 实现核心流程（2小时）
- [ ] 登录流程
- [ ] 任务列表
- [ ] 作业提交
- [ ] 批改功能

### Step 4: 完善细节（1小时）
- [ ] 状态显示
- [ ] 错误处理
- [ ] 用户体验