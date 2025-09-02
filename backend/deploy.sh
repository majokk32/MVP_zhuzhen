#!/bin/bash

# 公考督学助手后端部署脚本
# Usage: ./deploy.sh [dev|prod]

set -e

ENV=${1:-dev}
PROJECT_NAME="zhuzhen-backend"
REGISTRY="registry.cn-shanghai.aliyuncs.com/zhuzhen"

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
    
    # Setup Nginx (run once)
    echo "📝 Nginx configuration example:"
    cat << 'EOF'
server {
    listen 80;
    server_name api.your-domain.com;
    
    client_max_body_size 20M;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /uploads {
        alias /data/zhuzhen/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

else
    echo "❌ Unknown environment: $ENV"
    echo "Usage: ./deploy.sh [dev|prod]"
    exit 1
fi

echo "🎉 Deployment script completed!"