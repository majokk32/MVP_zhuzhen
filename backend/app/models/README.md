# 数据模型核心约束文档

## 🎯 核心数据模型语义

### User 模型约束
```python
class User(Base):
    # 基础身份信息
    openid: str      # 微信唯一标识，必须唯一索引
    unionid: str     # 微信统一标识，可选但建议设置
    nickname: str    # 用户昵称，可在小程序内修改
    role: UserRole   # 角色：student(学生)/teacher(教师)
    
    # V1.0 学习数据统计字段
    current_streak: int    # 当前连续学习天数，中断清零
    best_streak: int       # 历史最佳连续天数，只增不减
    total_score: int       # 累计总积分，永不清零
    monthly_score: int     # 月度积分，每月1日重置
    quarterly_score: int   # 季度积分，国考季(10-12月)使用
    last_checkin_date: Date # 最后打卡日期，用于连续天数计算
    total_submissions: int  # 累计提交次数，付费用户统计
    
    # 订阅权限控制
    subscription_type: SubscriptionType  # TRIAL(试用)/PREMIUM(付费)/EXPIRED(过期)
    subscription_expires_at: DateTime   # 订阅到期时间
    trial_started_at: DateTime          # 试用开始时间
```

### Task 模型约束
```python
class Task(Base):
    title: str           # 任务标题，显示在卡片左上角
    course: str          # 课程信息，任务归属课程
    desc: Text           # 题目详情，完整的任务要求描述
    deadline: DateTime   # 截止时间，用于课前提醒
    status: TaskStatus   # 任务状态：ongoing(进行中)/ended(已结束)
    task_type: TaskType  # 任务类型：live(直播课)/extra(课后加餐)/normal(普通)
    
    # 重要：课后加餐任务(task_type=extra)在学生端自动置顶显示
    created_by: int      # 创建者ID，关联User表
    created_at: DateTime # 创建时间，用于排序
```

### Submission 模型约束  
```python
class Submission(Base):
    task_id: int             # 关联任务ID
    student_id: int          # 提交学生ID，必须是付费用户
    images: JSON             # 作业图片URLs列表，最多6张
    submission_count: int    # 提交次数，最大值3，待复盘时重置
    
    # 批改相关
    score: Float             # 得分，可选
    grade: Grade             # 评价：待复盘/优秀/极佳
    feedback: Text           # 评语，支持长文本
    graded_by: int           # 批改教师ID
    graded_at: DateTime      # 批改时间
    
    status: SubmissionStatus # 状态：submitted(已提交)/graded(已批改)
```

### 权限控制枚举
```python
class SubscriptionType(str, enum.Enum):
    TRIAL = "trial"      # 试用用户：7天试用期，只能浏览无法提交
    PREMIUM = "premium"  # 付费用户：完整功能使用权限
    EXPIRED = "expired"  # 过期用户：类似试用用户，但曾经是付费用户

class Grade(str, enum.Enum):
    PENDING = "待复盘"   # 需要重新学习，自动刷新提交次数
    GOOD = "优秀"        # 质量良好
    EXCELLENT = "极佳"   # 接近满分水平
```

## 🔧 数据关系约束

### 核心业务关系
1. **User ↔ Task**: 一对多关系，教师可创建多个任务
2. **User ↔ Submission**: 一对多关系，学生可提交多份作业
3. **Task ↔ Submission**: 一对多关系，一个任务对应多个学生提交

### V1.0 学习数据关系
1. **User ↔ UserCheckin**: 一对多关系，记录每日打卡
2. **User ↔ UserScoreRecord**: 一对多关系，记录积分变化历史
3. **User ↔ ReviewSettings**: 一对一关系，个人复盘设置

### 技术预留关系 (V2.0)
1. **User ↔ UserAchievements**: 成就徽章系统，已预留字段
2. **Task ↔ TaskMaterials**: 课后加餐资料系统

## 📊 索引和性能约束

### 必需索引
```sql
-- 用户快速查询
CREATE INDEX idx_users_openid ON users(openid);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_subscription ON users(subscription_type);

-- 任务查询优化
CREATE INDEX idx_tasks_status_type ON tasks(status, task_type);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);

-- 提交记录优化
CREATE INDEX idx_submissions_student_task ON submissions(student_id, task_id);
CREATE INDEX idx_submissions_status ON submissions(status);
```

### 数据完整性约束
1. **外键约束**: 确保数据引用完整性
2. **唯一约束**: openid全局唯一
3. **非空约束**: 核心字段不能为空
4. **枚举约束**: 状态字段只能使用预定义值

## ⚠️ 重要提醒

### 数据统计原则
1. **付费用户统计**: 只有premium用户的数据计入教学统计
2. **试用用户隔离**: trial用户数据独立存储，不影响业务统计  
3. **数据一致性**: 学习数据字段必须与统计算法保持一致

### 性能考虑
1. **批量更新**: 连续天数等统计数据批量计算更新
2. **缓存策略**: 频繁查询的统计数据使用缓存
3. **分页查询**: 大数据量查询必须分页处理

### 版本兼容
1. **向前兼容**: 新增字段设置默认值，不影响现有数据
2. **迁移脚本**: 数据结构变更提供完整迁移方案
3. **技术预留**: V2.0功能字段已预留，避免频繁迁移