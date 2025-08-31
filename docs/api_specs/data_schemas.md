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
- `grade` enum("待复盘","优秀","极佳")?  
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
  },
  {
    "_id": "s2",
    "taskId": "t1",
    "studentId": "u2",
    "imgs": ["cloud://xxx/2.jpg"],
    "text": "我的答案",
    "submittedAt": 1694500000000,
    "status": "graded",
    "grade": "优秀",
    "comment": "结构清晰，论述有力",
    "gradedBy": "u-teacher-1",
    "gradedAt": 1694600000000
}
```

---

### 建议索引
- `submissions.taskId` (compound with submittedAt)
- `submissions.studentId`
