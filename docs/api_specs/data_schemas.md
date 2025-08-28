# Data Schemas (V1)

## users
- `_id` string  
- `nickname` string  
- `avatar` string?  
- `role` enum("student","teacher")  
- `createdAt` number (timestamp)  

示例：
```json
{
  "_id": "u1",
  "nickname": "Alice",
  "role": "student",
  "createdAt": 1694000000000
}
```

---

## tasks
- `_id` string  
- `title` string  
- `course` string  
- `desc` string  
- `totalScore` number  
- `deadline` number|null (ms timestamp)  
- `createdBy` string (uid of teacher)  
- `createdAt` number  

示例：
```json
{
  "_id": "t1",
  "title": "周一作业",
  "course": "申论",
  "desc": "写一篇小作文",
  "totalScore": 100,
  "deadline": 1695000000000,
  "createdBy": "u-teacher-1",
  "createdAt": 1694000000000
}
```

---

## submissions
- `_id` string  
- `taskId` string (ref tasks._id)  
- `studentId` string (ref users._id)  
- `imgs` string[] (cloud fileIDs)  
- `text` string  
- `submittedAt` number  
- `status` enum("submitted","graded")  
- `score` number?  
- `comment` string?  
- `gradedBy` string?  
- `gradedAt` number?  

示例：
```json
{
  "_id": "s1",
  "taskId": "t1",
  "studentId": "u1",
  "imgs": ["cloud://xxx/1.jpg"],
  "text": "我的答案",
  "submittedAt": 1694500000000,
  "status": "submitted"
}
```

---

### 建议索引
- `submissions.taskId` (compound with submittedAt)
- `submissions.studentId`
