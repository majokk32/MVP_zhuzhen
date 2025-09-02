# 公考督学助手 - 后端API

一个专为公务员考试培训设计的作业督学系统后端，支持微信小程序端的作业发布、提交、批改等完整流程。

## 📋 项目背景

在公考培训中，老师需要布置作业，学生需要提交作业，老师需要批改并给出反馈。传统的微信群管理方式效率低下，本系统旨在将这个流程数字化、自动化。

### 核心功能
- 📝 **作业管理**：老师创建任务，设置截止时间
- 📤 **作业提交**：学生拍照上传作业（最多3次机会）
- ✅ **作业批改**：老师在线批改，给出评分和评语
- 📊 **数据统计**：查看学生提交情况、批改进度等

## 🛠 技术栈说明

| 技术 | 用途 | 为什么选择它 |
|------|------|-------------|
| **Python 3.11+** | 编程语言 | 简单易学，生态丰富 |
| **FastAPI** | Web框架 | 性能高，自动生成API文档，对新手友好 |
| **SQLAlchemy 2.0** | 数据库ORM | 不用写SQL，用Python代码操作数据库 |
| **SQLite** | 开发数据库 | 无需安装，文件型数据库，开发方便 |
| **PostgreSQL** | 生产数据库 | 性能好，稳定可靠 |
| **Docker** | 容器化 | 一键部署，环境一致性 |

## 🚀 快速开始（小白版）

### 前置要求
- 安装 Python 3.11 或更高版本（[下载地址](https://www.python.org/downloads/)）
- 安装 Git（[下载地址](https://git-scm.com/downloads)）
- （可选）安装 Docker Desktop（[下载地址](https://www.docker.com/products/docker-desktop)）

### 第一步：获取代码

```bash
# 进入项目目录
cd D:\projects-2025\MVP_zhuzhen\backend

# 如果是从GitHub克隆
# git clone https://github.com/your-username/zhuzhen-backend.git
# cd zhuzhen-backend
```

### 第二步：设置Python虚拟环境

虚拟环境是Python的独立运行空间，避免不同项目的依赖冲突。

```bash
# 创建虚拟环境（只需运行一次）
python -m venv venv

# 激活虚拟环境
# Windows系统：
venv\Scripts\activate
# Mac/Linux系统：
source venv/bin/activate

# 激活成功后，命令行前面会出现 (venv) 标记
```

### 第三步：安装依赖包

```bash
# 安装项目所需的所有Python包
pip install -r requirements.txt

# 这个过程可能需要几分钟，会自动下载安装以下包：
# - fastapi: Web框架
# - uvicorn: Web服务器
# - sqlalchemy: 数据库工具
# - 等等...
```

### 第四步：配置环境变量

```bash
# 复制环境变量模板文件
copy .env.example .env  # Windows
# cp .env.example .env  # Mac/Linux

# 用记事本或任何文本编辑器打开 .env 文件
# 根据注释说明填写配置信息
```

**.env 文件详细说明：**

```bash
# JWT密钥，用于生成登录令牌，生产环境必须修改！
SECRET_KEY=your-secret-key-change-in-production

# 数据库连接地址
# 开发环境使用SQLite（文件数据库）
DATABASE_URL=sqlite+aiosqlite:///./data/app.db
# 生产环境使用PostgreSQL（需要单独安装）
# DATABASE_URL=postgresql+asyncpg://用户名:密码@服务器地址/数据库名

# 微信小程序配置（从微信公众平台获取）
WX_APPID=你的小程序AppID
WX_SECRET=你的小程序Secret

# 阿里云OSS配置（用于存储上传的图片）
# 如果没有OSS，系统会自动使用本地存储
OSS_ACCESS_KEY=你的AccessKey
OSS_SECRET_KEY=你的SecretKey
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
OSS_BUCKET=你的Bucket名称
```

### 第五步：启动服务器

```bash
# 方式1：开发模式（代码修改后自动重启）
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 方式2：普通启动
python -m app.main

# 启动成功后会看到：
# INFO:     Uvicorn running on http://0.0.0.0:8000
# INFO:     Application startup complete.
```

### 第六步：测试API

打开浏览器，访问以下地址：
- **API文档**：http://localhost:8000/docs （可以直接测试接口）
- **健康检查**：http://localhost:8000/health
- **项目信息**：http://localhost:8000/

## 📁 项目结构详解

```
backend/
├── app/                    # 应用主目录
│   ├── api/               # API接口目录（处理HTTP请求）
│   │   ├── users.py       # 用户相关接口（登录、个人信息）
│   │   ├── tasks.py       # 任务相关接口（创建、查询任务）
│   │   ├── submissions.py # 作业提交接口（上传、批改）
│   │   └── admin.py       # 管理员接口（数据统计）
│   │
│   ├── utils/             # 工具函数目录
│   │   ├── storage.py     # 文件存储工具（上传到OSS或本地）
│   │   └── wechat.py      # 微信相关工具（处理微信登录）
│   │
│   ├── main.py           # 程序入口文件
│   ├── config.py         # 配置管理（读取.env文件）
│   ├── database.py       # 数据库连接配置
│   ├── models.py         # 数据模型（定义数据表结构）
│   ├── schemas.py        # 数据验证模型（验证请求数据）
│   └── auth.py           # 认证相关（JWT令牌、权限检查）
│
├── data/                 # 数据库文件存放目录
│   └── app.db           # SQLite数据库文件（自动生成）
│
├── uploads/              # 本地上传文件存放目录
├── tests/                # 测试代码目录
├── .env                  # 环境变量配置（不要提交到Git）
├── .env.example          # 环境变量示例
├── requirements.txt      # Python依赖列表
├── Dockerfile           # Docker镜像配置
├── docker-compose.yml   # Docker编排配置
└── README.md            # 项目说明文档（你正在读的）
```

## 🔌 API接口使用说明

### 1. 用户登录流程

```python
# 小程序端调用示例
# 1. 小程序调用 wx.login() 获取 code
# 2. 将 code 发送到后端

POST /api/v1/users/login
Content-Type: application/json

{
    "code": "微信登录获取的code"
}

# 返回示例
{
    "code": 0,
    "msg": "ok",
    "data": {
        "token": "eyJ0eXAiOiJKV1...",  # JWT令牌，后续请求需要携带
        "user": {
            "id": 1,
            "nickname": "张三",
            "role": "student"  # 角色：student(学生) 或 teacher(老师)
        }
    }
}
```

### 2. 携带令牌访问接口

```python
# 所有需要登录的接口都要在请求头中携带token
GET /api/v1/tasks/
Authorization: Bearer eyJ0eXAiOiJKV1...

# 如果token无效或过期，会返回401错误
```

### 3. 任务管理（老师功能）

```python
# 创建任务（仅老师可用）
POST /api/v1/tasks/
Authorization: Bearer {teacher_token}
Content-Type: application/json

{
    "title": "2025国考申论第一题",
    "course": "申论强化班",
    "desc": "请根据材料，分析...",  # 题目详情
    "total_score": 40,              # 总分
    "deadline": "2025-01-15T23:59:59"  # 截止时间（可选）
}
```

### 4. 作业提交（学生功能）

```python
# 步骤1：先上传图片
POST /api/v1/submissions/upload-image
Authorization: Bearer {student_token}
Content-Type: multipart/form-data

file: [选择的图片文件]

# 返回图片URL
{
    "code": 0,
    "data": {
        "url": "https://oss.aliyuncs.com/xxx.jpg",
        "filename": "作业.jpg",
        "size": 1024000
    }
}

# 步骤2：提交作业
POST /api/v1/submissions/submit
Authorization: Bearer {student_token}
Content-Type: application/json

{
    "task_id": 1,
    "images": [
        "https://oss.aliyuncs.com/xxx1.jpg",
        "https://oss.aliyuncs.com/xxx2.jpg"
    ],
    "text": "补充说明（可选）"
}
```

### 5. 作业批改（老师功能）

```python
# 获取待批改列表
GET /api/v1/submissions/pending-grading
Authorization: Bearer {teacher_token}

# 批改作业
POST /api/v1/submissions/grade
Authorization: Bearer {teacher_token}
Content-Type: application/json

{
    "submission_id": 1,
    "score": 35,           # 得分
    "grade": "优秀",       # 评级：待复盘/优秀/极佳
    "comment": "文章结构清晰，论证有力..."  # 评语
}
```

## 🐳 使用Docker部署（推荐）

Docker可以让你不用关心Python版本、依赖安装等问题，一键启动。

### 开发环境

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 生产环境部署

```bash
# 1. 构建镜像
docker build -t zhuzhen-backend .

# 2. 运行容器
docker run -d \
  --name zhuzhen-api \
  -p 8000:8000 \
  -v /data/uploads:/app/uploads \
  --env-file .env.production \
  zhuzhen-backend
```

## 🔧 常见问题解答

### Q1: 为什么启动失败？

**可能原因：**
1. Python版本太低 → 升级到3.11+
2. 依赖没装好 → 重新运行 `pip install -r requirements.txt`
3. 端口被占用 → 改用其他端口 `--port 8001`
4. 环境变量配置错误 → 检查.env文件

### Q2: 数据库在哪里？

- 开发环境：`data/app.db` 文件就是数据库
- 可以用 [SQLite Browser](https://sqlitebrowser.org/) 查看数据

### Q3: 怎么添加老师账号？

```python
# 方法1：手动修改数据库，将用户的role改为"teacher"

# 方法2：调用API（需要已有老师账号）
POST /api/v1/users/grant-teacher
{
    "user_id": 2  # 要升级为老师的用户ID
}
```

### Q4: 上传的图片存在哪里？

- 如果配置了阿里云OSS：存在OSS上
- 如果没配置OSS：存在 `uploads/` 目录下

### Q5: 如何调试接口？

1. 访问 http://localhost:8000/docs
2. 点击任意接口的 "Try it out"
3. 填写参数
4. 点击 "Execute" 执行

### Q6: 生产环境需要注意什么？

1. **必须修改** `.env` 中的 `SECRET_KEY`
2. 使用PostgreSQL替代SQLite
3. 配置HTTPS（通过Nginx）
4. 定期备份数据库
5. 设置日志收集

## 📝 开发建议

### 对于初学者

1. **先跑通再理解**：按照快速开始一步步来，先让项目跑起来
2. **用好API文档**：`/docs` 页面可以直接测试，不用写代码
3. **从简单开始**：先理解用户登录，再看其他功能
4. **多看日志**：出错时看控制台输出，通常有明确提示

### 代码修改指南

```python
# 添加新接口的步骤：
# 1. 在 app/api/ 目录下对应文件添加函数
# 2. 在 app/schemas.py 添加数据模型
# 3. 重启服务器，在 /docs 测试

# 示例：添加一个获取统计数据的接口
@router.get("/stats")
async def get_stats(
    current_user: User = Depends(get_current_user),  # 需要登录
    db: AsyncSession = Depends(get_db)  # 获取数据库连接
):
    # 你的业务逻辑
    return {"total": 100}
```

## 🤝 获取帮助

- **查看日志**：大部分问题看日志就能解决
- **API文档**：http://localhost:8000/docs
- **调试工具**：使用Postman或Insomnia测试API
- **数据库工具**：SQLite Browser查看数据

## 📄 许可证

本项目为私有项目，未经授权不得使用。

---

**提示**：如果你是第一次接触后端开发，建议：
1. 先把项目跑起来
2. 在 `/docs` 页面玩一玩接口
3. 看懂一个简单的接口实现（如 `GET /health`）
4. 逐步理解更复杂的功能

祝你开发顺利！🚀