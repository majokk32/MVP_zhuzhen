# 🚀 阿里云生产环境部署指南

## 📋 部署前准备

### 1. 服务器要求
- **操作系统**: Ubuntu 20.04+ 或 CentOS 8+
- **内存**: 最少 4GB，推荐 8GB+
- **存储**: 最少 50GB，推荐 100GB+
- **网络**: 公网IP，开放80/443端口

### 2. 阿里云服务准备
- **ECS实例**: 已创建并配置
- **OSS存储桶**: 已创建 (bucket名称: zhuzhen)
- **RDS数据库**: 可选，或使用Docker PostgreSQL
- **域名**: 已解析到服务器IP
- **SSL证书**: 已申请或准备申请

## 🔧 配置步骤

### 步骤1: 更新配置文件

1. **更新OSS凭证** (`env.production`):
```bash
# 替换为您的实际OSS凭证
OSS_ACCESS_KEY=your-actual-oss-access-key
OSS_SECRET_KEY=your-actual-oss-secret-key
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com
OSS_BUCKET=zhuzhen
```

2. **更新数据库密码**:
```bash
# 设置强密码
DB_PASSWORD=your-strong-database-password
REDIS_PASSWORD=your-strong-redis-password
```

3. **更新域名配置**:
```bash
# 在 deploy.sh 中更新
DOMAIN="your-actual-domain.com"
```

### 步骤2: 服务器环境准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 安装其他必要工具
sudo apt install -y curl wget git ufw
```

### 步骤3: SSL证书配置

#### 选项A: Let's Encrypt (免费)
```bash
# 运行SSL设置脚本
chmod +x setup-ssl.sh
./setup-ssl.sh letsencrypt your-domain.com
```

#### 选项B: 阿里云SSL证书
```bash
# 手动配置
./setup-ssl.sh aliyun your-domain.com
# 然后手动上传证书文件到 /data/zhuzhen/ssl/
```

### 步骤4: 部署应用

```bash
# 给部署脚本执行权限
chmod +x deploy.sh

# 运行阿里云部署
./deploy.sh aliyun
```

## 🔍 部署后验证

### 1. 检查服务状态
```bash
# 查看容器状态
docker-compose -f docker-compose.production.yml ps

# 查看日志
docker-compose -f docker-compose.production.yml logs -f
```

### 2. 健康检查
```bash
# API健康检查
curl -f https://your-domain.com/health

# 查看API文档
curl -f https://your-domain.com/docs
```

### 3. OSS连接测试
```bash
# 进入容器测试OSS连接
docker exec -it zhuzhen-backend-prod python -c "
from app.utils.storage_new import enhanced_storage
print('OSS配置状态:', not enhanced_storage.use_local)
"
```

## 📊 监控和维护

### 1. 日志管理
```bash
# 查看应用日志
tail -f /data/zhuzhen/logs/app.log

# 查看Nginx日志
docker logs zhuzhen-nginx-prod
```

### 2. 备份策略
```bash
# 数据库备份
docker exec zhuzhen-postgres-prod pg_dump -U zhuzhen zhuzhen_db > backup_$(date +%Y%m%d).sql

# 文件备份
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz /data/zhuzhen/uploads/
```

### 3. 性能监控
```bash
# 查看资源使用
docker stats

# 查看磁盘使用
df -h /data/zhuzhen/
```

## 🔧 故障排除

### 常见问题

1. **OSS连接失败**
   - 检查OSS凭证是否正确
   - 确认网络连接正常
   - 验证OSS存储桶权限

2. **SSL证书问题**
   - 检查证书文件是否存在
   - 验证证书是否过期
   - 确认域名解析正确

3. **数据库连接问题**
   - 检查数据库容器状态
   - 验证连接字符串
   - 查看数据库日志

### 日志位置
- **应用日志**: `/data/zhuzhen/logs/app.log`
- **Nginx日志**: `docker logs zhuzhen-nginx-prod`
- **数据库日志**: `docker logs zhuzhen-postgres-prod`
- **Redis日志**: `docker logs zhuzhen-redis-prod`

## 🔄 更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新构建和部署
./deploy.sh aliyun
```

## 📞 技术支持

如遇到问题，请检查：
1. 服务器资源使用情况
2. 容器运行状态
3. 网络连接
4. 配置文件正确性
5. 日志文件中的错误信息

---

**部署完成后，您的API将在以下地址可用：**
- 🌐 **API地址**: `https://your-domain.com/api/v1/`
- 📚 **API文档**: `https://your-domain.com/docs`
- 🔍 **健康检查**: `https://your-domain.com/health`
