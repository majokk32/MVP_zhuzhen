# 📖 公考督学助手 - 完整测试操作文档

## 概述
本文档提供公考督学助手小程序的完整功能测试指南，包括教师端和学生端的所有功能操作流程。

---

## 1. 👩‍🏫 切换到教师身份

### 方法一：通过数据库直接修改（推荐）
```bash
# 进入后端目录
cd /Users/majokk/ZhuzhenMVP/MVP_zhuzhen/backend

# 连接SQLite数据库
sqlite3 data/app.db

# 查看当前用户
SELECT id, nickname, role FROM users;

# 插入一个新的教师用户，id为6，昵称为imTeacher
INSERT INTO users (id, openid, nickname, role, created_at, updated_at) 
VALUES (6, 'teacher_openid_123456', 'imTeacher', 'TEACHER', datetime('now'), datetime('now'));

# 确认修改成功
SELECT id, nickname, role FROM users;

# 退出数据库
.exit
```

### 方法二：通过后端API修改
```bash
# 使用管理员API授予教师权限（需要你的token）
curl -X POST "http://localhost:8000/api/v1/users/grant-teacher" \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{"user_id": 3}'
```

---

## 2. 🔄 重新进入小程序
- 关闭小程序并重新打开
- 或者在小程序中下拉刷新首页
- 你应该会看到底部有3个Tab：**任务** | **教研** | **我的**

---

## 3. 🎯 教师端功能测试流程

### 3.1 创建任务
1. 点击底部 **"教研"** Tab进入教师管理页面
2. 选择 **"任务管理"**
3. 点击 **"创建任务"** 按钮
4. 填写任务信息：
   ```
   标题：申论写作练习1
   描述：请根据给定材料写一篇800字的申论文章
   截止时间：选择一个未来时间
   任务类型：直播课 或 课后加餐
   总分：100
   ```
5. 点击 **"创建"** 完成

### 3.2 任务状态管理
1. 在任务列表中，**长按任务卡片**
2. 选择 **"切换状态"** - 可以将任务在"进行中"和"已结束"之间切换
3. 选择 **"查看统计"** - 查看提交统计数据

### 3.3 分享任务功能
1. 长按任务卡片
2. 选择 **"分享任务"**
3. 点击右上角分享按钮，发送给微信好友
4. 好友点击后会直接跳转到任务详情页面

---

## 4. 👨‍🎓 学生端功能测试

### 4.1 切回学生身份测试
```bash
# 将用户改回学生
sqlite3 data/app.db "UPDATE users SET role = 'student' WHERE id = 3;"
```

### 4.2 作业提交流程
1. 在任务列表点击任务卡片
2. 进入任务详情页，应该看到 **"待提交"** 状态
3. 点击 **"选择图片"** 上传作业图片（最多9张）
4. 添加文字说明
5. 点击 **"提交作业"** 
6. 可以重新提交（最多3次）

---

## 5. 👩‍🏫 批改作业流程

### 5.1 重新切换到教师身份
```bash
sqlite3 data/app.db "UPDATE users SET role = 'teacher' WHERE id = 3;"
```

### 5.2 批改操作
1. 进入 **"教研"** > **"批改工作台"**
2. 查看 **"待批改列表"**
3. 点击学生提交的作业
4. 查看学生上传的图片和说明
5. 选择评价档位：
   - 🎯 **极佳** - 优秀作品
   - 👍 **优秀** - 良好水平  
   - 📝 **待复盘** - 需要改进
6. 输入分数（1-100分）
7. 添加评语或选择快捷评语
8. 点击 **"提交批改"**

---

## 6. 📊 管理功能测试

### 6.1 学生管理
1. **"教研"** > **"学生管理"**
2. 查看所有注册学生
3. 点击学生可查看其作业历史

### 6.2 任务统计
1. **"教研"** > **"任务管理"**
2. 查看任务进度统计
3. 导出学生作业（批量下载功能）

---

## 7. 🔧 测试环境快捷操作

### 快速创建测试数据
```bash
# 创建多个测试任务
curl -X POST "http://localhost:8000/api/v1/tasks/" \
  -H "Authorization: Bearer 你的token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试任务1",
    "description": "这是一个测试任务",
    "deadline": "2024-12-31T23:59:59",
    "task_type": "live",
    "total_score": 100
  }'
```

### 查看当前用户角色
```bash
curl -H "Authorization: Bearer 你的token" \
  "http://localhost:8000/api/v1/users/profile"
```

---

## 8. 🎮 完整测试场景

### 推荐测试顺序：
1. ✅ 以学生身份登录 → 查看空任务列表
2. ✅ 切换教师身份 → 看到教研Tab
3. ✅ 创建2-3个测试任务
4. ✅ 测试任务状态切换
5. ✅ 测试分享功能
6. ✅ 切回学生身份 → 提交作业
7. ✅ 切换教师身份 → 批改作业
8. ✅ 查看统计和管理功能

---

## 9. 🚀 常用命令速查

```bash
# 查看后端日志
tail -f /Users/majokk/ZhuzhenMVP/MVP_zhuzhen/backend/server.log

# 重启后端
pkill -f uvicorn && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 快速切换用户角色
sqlite3 data/app.db "UPDATE users SET role = 'teacher' WHERE id = 3;"
sqlite3 data/app.db "UPDATE users SET role = 'student' WHERE id = 3;"

# 查看数据库内容
sqlite3 data/app.db "SELECT * FROM users;"
sqlite3 data/app.db "SELECT * FROM tasks;"
sqlite3 data/app.db "SELECT * FROM submissions;"
```

---

## 10. 📋 功能验证清单

### 学生端功能
- [ ] 微信授权登录
- [ ] 查看任务列表
- [ ] 任务筛选（全部/进行中/已结束）
- [ ] 任务详情查看
- [ ] 图片上传提交
- [ ] 文字说明添加
- [ ] 重复提交（最多3次）
- [ ] 查看批改结果
- [ ] 个人信息管理

### 教师端功能
- [ ] 动态TabBar显示
- [ ] 创建任务
- [ ] 任务状态管理
- [ ] 分享功能
- [ ] 待批改列表
- [ ] 作业批改
- [ ] 评价档位选择
- [ ] 学生管理
- [ ] 任务统计查看
- [ ] 批量下载

### 系统功能
- [ ] 深链接分享
- [ ] 文件本地存储
- [ ] 权限验证
- [ ] 错误处理
- [ ] 数据持久化

---

## 11. 🐛 常见问题排查

### 登录失败
- 检查后端服务是否启动
- 查看后端日志确认微信API调用状态
- 确认.env文件配置正确

### 文件上传失败
- 确认OSS配置为空（使用本地存储）
- 检查uploads目录权限
- 查看文件大小是否超限

### TabBar不显示教研
- 确认用户角色已改为teacher
- 重启小程序或下拉刷新
- 检查TabBar管理工具是否正确加载

---

**文档版本**: v1.0  
**创建日期**: 2024-09-05  
**适用版本**: 公考督学助手 MVP v1.0

> 💡 提示：按照本文档的测试顺序进行，可以完整验证所有功能。如遇问题，请查看常见问题排查部分。