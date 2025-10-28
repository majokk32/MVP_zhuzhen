#!/bin/bash

# 公考督学助手后端部署脚本 - 阿里云生产环境
# Usage: ./deploy.sh [dev|prod|aliyun]

set -e

ENV=${1:-dev}
PROJECT_NAME="zhuzhen-backend"
REGISTRY="registry.cn-shanghai.aliyuncs.com/zhuzhen"
DOMAIN="your-domain.com"  # 请替换为您的实际域名

echo "🚀 Starting deployment for environment: $ENV"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
if ! command_exists docker; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Development deployment
if [ "$ENV" = "dev" ]; then
    echo "📦 Building development image..."
    docker-compose build
    
    echo "🔄 Starting development containers..."
    docker-compose up -d
    
    echo "✅ Development deployment complete!"
    echo "📚 API Documentation: http://localhost:8000/docs"
    echo "🔍 View logs: docker-compose logs -f"
    
# Production deployment
elif [ "$ENV" = "prod" ]; then
    echo "📦 Building production image..."
    
    # Build image
    docker build -t $PROJECT_NAME:latest .
    
    # Tag for registry
    docker tag $PROJECT_NAME:latest $REGISTRY/$PROJECT_NAME:latest
    docker tag $PROJECT_NAME:latest $REGISTRY/$PROJECT_NAME:$(date +%Y%m%d-%H%M%S)
    
    echo "📤 Pushing to registry..."
    # Note: You need to login first: docker login registry.cn-shanghai.aliyuncs.com
    # docker push $REGISTRY/$PROJECT_NAME:latest
    
    echo "🔄 Deploying to server..."
    
    # Stop old container
    docker stop $PROJECT_NAME || true
    docker rm $PROJECT_NAME || true
    
    # Run new container
    docker run -d \
        --name $PROJECT_NAME \
        -p 8000:8000 \
        -v /data/zhuzhen/uploads:/app/uploads \
        -v /data/zhuzhen/data:/app/data \
        --env-file .env.production \
        --restart unless-stopped \
        $PROJECT_NAME:latest
    
    echo "✅ Production deployment complete!"

# Aliyun production deployment
elif [ "$ENV" = "aliyun" ]; then
    echo "🌏 Deploying to Aliyun production environment..."
    
    # Check if required files exist
    if [ ! -f "env.production" ]; then
        echo "❌ Production environment file not found. Please create env.production"
        exit 1
    fi
    
    if [ ! -f "docker-compose.production.yml" ]; then
        echo "❌ Production docker-compose file not found"
        exit 1
    fi
    
    # Create necessary directories
    echo "📁 Creating production directories..."
    sudo mkdir -p /data/zhuzhen/{data,logs,uploads,ssl}
    sudo chown -R $USER:$USER /data/zhuzhen
    
    # Setup SSL certificates (if not exists)
    if [ ! -f "/data/zhuzhen/ssl/cert.pem" ]; then
        echo "🔒 Setting up SSL certificates..."
        echo "Please place your SSL certificates in /data/zhuzhen/ssl/"
        echo "Required files: cert.pem, key.pem"
        echo "You can use Let's Encrypt or Aliyun SSL certificates"
    fi
    
    # Update nginx configuration with actual domain
    if [ "$DOMAIN" != "your-domain.com" ]; then
        echo "🌐 Updating nginx configuration for domain: $DOMAIN"
        sed -i "s/your-domain.com/$DOMAIN/g" nginx.conf
    fi
    
    # Build and start production containers
    echo "📦 Building production images..."
    docker-compose -f docker-compose.production.yml build --no-cache
    
    echo "🔄 Starting production containers..."
    docker-compose -f docker-compose.production.yml up -d
    
    # Wait for services to be ready
    echo "⏳ Waiting for services to start..."
    sleep 30
    
    # Check service health
    echo "🔍 Checking service health..."
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ API service is healthy"
    else
        echo "❌ API service health check failed"
        docker-compose -f docker-compose.production.yml logs zhuzhen-api
    fi
    
    # Setup firewall rules
    echo "🔥 Configuring firewall..."
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 22/tcp
    sudo ufw --force enable
    
    echo "✅ Aliyun production deployment complete!"
    echo "🌐 Your API is available at: https://$DOMAIN"
    echo "📚 API Documentation: https://$DOMAIN/docs"
    echo "🔍 View logs: docker-compose -f docker-compose.production.yml logs -f"
    
    # Setup log rotation
    echo "📝 Setting up log rotation..."
    sudo tee /etc/logrotate.d/zhuzhen > /dev/null << EOF
/data/zhuzhen/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        docker-compose -f /srv/zhuzhen/MVP_zhuzhen/backend/docker-compose.production.yml restart zhuzhen-api
    endscript
}
EOF

else
    echo "❌ Unknown environment: $ENV"
    echo "Usage: ./deploy.sh [dev|prod|aliyun]"
    exit 1
fi

echo "🎉 Deployment script completed!"