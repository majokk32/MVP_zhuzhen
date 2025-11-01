#!/bin/bash

# 快速设置脚本 - 一键配置阿里云部署环境
# Usage: ./quick-setup.sh [domain] [oss-access-key] [oss-secret-key]

set -e

DOMAIN=${1:-"your-domain.com"}
OSS_ACCESS_KEY=${2:-"your-oss-access-key"}
OSS_SECRET_KEY=${3:-"your-oss-secret-key"}

echo "🚀 开始快速配置阿里云部署环境..."
echo "域名: $DOMAIN"
echo "OSS Access Key: ${OSS_ACCESS_KEY:0:8}..."

# 1. 更新环境配置文件
echo "📝 更新环境配置文件..."
if [ -f "env.production" ]; then
    # 更新OSS凭证
    sed -i "s/your-actual-oss-access-key/$OSS_ACCESS_KEY/g" env.production
    sed -i "s/your-actual-oss-secret-key/$OSS_SECRET_KEY/g" env.production
    
    # 更新域名
    sed -i "s/your-domain.com/$DOMAIN/g" env.production
    
    # 生成随机密码
    DB_PASSWORD=$(openssl rand -base64 32)
    REDIS_PASSWORD=$(openssl rand -base64 32)
    SECRET_KEY=$(openssl rand -base64 64)
    
    sed -i "s/your-db-password/$DB_PASSWORD/g" env.production
    sed -i "s/your-production-secret-key-change-this/$SECRET_KEY/g" env.production
    
    echo "✅ 环境配置文件已更新"
else
    echo "❌ env.production 文件不存在"
    exit 1
fi

# 2. 更新部署脚本中的域名
echo "🌐 更新部署脚本域名配置..."
sed -i "s/your-domain.com/$DOMAIN/g" deploy.sh

# 3. 更新Nginx配置中的域名
echo "🔧 更新Nginx配置..."
sed -i "s/your-domain.com/$DOMAIN/g" nginx.conf

# 4. 创建必要的目录
echo "📁 创建部署目录..."
sudo mkdir -p /data/zhuzhen/{data,logs,uploads,ssl}
sudo chown -R $USER:$USER /data/zhuzhen

# 5. 检查Docker是否安装
echo "🐳 检查Docker环境..."
if ! command -v docker &> /dev/null; then
    echo "📦 安装Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker安装完成，请重新登录以应用用户组更改"
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 安装Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# 6. 设置防火墙
echo "🔥 配置防火墙..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "✅ 快速设置完成！"
echo ""
echo "📋 下一步操作："
echo "1. 配置SSL证书: ./setup-ssl.sh letsencrypt $DOMAIN"
echo "2. 开始部署: ./deploy.sh aliyun"
echo ""
echo "🔑 生成的密码已保存到 env.production 文件中"
echo "📖 详细部署指南请查看: DEPLOYMENT_GUIDE.md"
