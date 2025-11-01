#!/bin/bash

# Update .env file with OSS credentials
echo "🔧 Updating .env file with OSS credentials..."

# Backup original .env
cp .env .env.backup

# Update OSS credentials (请替换为实际的密钥)
sed -i 's/OSS_ACCESS_KEY=your-oss-access-key/OSS_ACCESS_KEY=YOUR_ACTUAL_ACCESS_KEY/' .env
sed -i 's/OSS_SECRET_KEY=your-oss-secret-key/OSS_SECRET_KEY=YOUR_ACTUAL_SECRET_KEY/' .env
sed -i 's/OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com/OSS_ENDPOINT=oss-cn-shenzhen.aliyuncs.com/' .env
sed -i 's/OSS_BUCKET=zhuzhen/OSS_BUCKET=mvp-backend-files/' .env

# Update environment to production
sed -i 's/ENVIRONMENT=development/ENVIRONMENT=production/' .env

# Update CORS origins
sed -i 's|CORS_ORIGINS=\["http://localhost:3000", "https://your-domain.com"\]|CORS_ORIGINS=["http://120.77.57.53:8000", "https://120.77.57.53", "http://localhost:3000"]|' .env

echo "✅ .env file updated with OSS credentials"
echo "📋 Updated values:"
echo "  - OSS_ACCESS_KEY: YOUR_ACTUAL_ACCESS_KEY"
echo "  - OSS_SECRET_KEY: YOUR_ACTUAL_SECRET_KEY"
echo "  - OSS_ENDPOINT: oss-cn-shenzhen.aliyuncs.com"
echo "  - OSS_BUCKET: mvp-backend-files"
echo "  - ENVIRONMENT: production"

