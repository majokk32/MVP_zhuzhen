# API Endpoints (V1)

所有接口通过 `uniCloud.callFunction({ name, data })` 调用，返回格式统一：
```json
{ "code": 0, "data": {}, "msg": "ok" }
```

---

## auth
- **`loginAnonym()`** → `{ user }`  
  - 开发/调试模式下创建或获取默认用户（student / teacher）  
- **`getProfile()`** → `{ user }`  
  - 根据 `context.clientInfo.uid` 获取用户信息

---

## cf-task
- **`createTask({ title, course, desc, totalScore, deadline })`** → `{ code }`  
  - 教师端创建任务  
- **`listTasks()`** → `{ data: Task[] }`  
  - 获取任务列表（按创建时间倒序）  
- **`getTask({ id })`** → `{ data: Task }`  
  - 获取任务详情  

---

## cf-submit
- **`submitHomework({ taskId, imgs[], text? })`** → `{ code }`  
  - 学生提交作业（图片最多 3 张 + 可选文字）  
- **`listSubmissions({ status?, taskId? })`** → `{ data: Submission[] }`  
  - 获取作业提交（可按状态/任务过滤）  

---

## cf-grade
- **`gradeSubmission({ submissionId, score, comment })`** → `{ code }`  
  - 教师批改提交，打分 + 评语  
- **`taskProgress({ taskId })`** → `{ submitted, graded }`  
  - 获取任务提交/批改进度  

---

### Error Codes
- `401` 未授权  
- `404` 未找到 action  
- `422` 参数错误  
- `500` 服务端错误  
