#!/bin/bash

# SSL证书设置脚本 - 支持Let's Encrypt和阿里云SSL
# Usage: ./setup-ssl.sh [letsencrypt|aliyun] [domain]

set -e

SSL_TYPE=${1:-letsencrypt}
DOMAIN=${2:-your-domain.com}
EMAIL="your-email@example.com"  # Let's Encrypt需要邮箱

echo "🔒 Setting up SSL certificates for domain: $DOMAIN"

# Create SSL directory
sudo mkdir -p /data/zhuzhen/ssl
sudo chown -R $USER:$USER /data/zhuzhen/ssl

if [ "$SSL_TYPE" = "letsencrypt" ]; then
    echo "📜 Setting up Let's Encrypt SSL certificate..."
    
    # Install certbot if not exists
    if ! command -v certbot &> /dev/null; then
        echo "📦 Installing certbot..."
        sudo apt update
        sudo apt install -y certbot python3-certbot-nginx
    fi
    
    # Stop nginx temporarily
    sudo systemctl stop nginx || true
    
    # Get certificate
    echo "🔐 Obtaining SSL certificate from Let's Encrypt..."
    sudo certbot certonly --standalone \
        --email $EMAIL \
        --agree-tos \
        --no-eff-email \
        -d $DOMAIN \
        -d www.$DOMAIN
    
    # Copy certificates to our directory
    sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /data/zhuzhen/ssl/cert.pem
    sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /data/zhuzhen/ssl/key.pem
    sudo chown $USER:$USER /data/zhuzhen/ssl/*.pem
    
    # Setup auto-renewal
    echo "🔄 Setting up auto-renewal..."
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'docker-compose -f /srv/zhuzhen/MVP_zhuzhen/backend/docker-compose.production.yml restart nginx'") | crontab -
    
    echo "✅ Let's Encrypt SSL certificate setup complete!"

elif [ "$SSL_TYPE" = "aliyun" ]; then
    echo "☁️ Setting up Aliyun SSL certificate..."
    
    echo "📋 Please follow these steps:"
    echo "1. 登录阿里云控制台"
    echo "2. 进入SSL证书管理"
    echo "3. 申请免费SSL证书或上传已有证书"
    echo "4. 下载证书文件"
    echo "5. 将证书文件放置到以下位置:"
    echo "   - /data/zhuzhen/ssl/cert.pem (证书文件)"
    echo "   - /data/zhuzhen/ssl/key.pem (私钥文件)"
    echo ""
    echo "或者使用阿里云CLI工具自动获取证书..."
    
    # Check if aliyun CLI is installed
    if command -v aliyun &> /dev/null; then
        echo "🔧 Aliyun CLI detected. You can use it to manage certificates."
        echo "Example: aliyun cas DescribeUserCertificateList"
    else
        echo "💡 Install Aliyun CLI for easier certificate management:"
        echo "   wget https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz"
        echo "   tar -xzf aliyun-cli-linux-latest-amd64.tgz"
        echo "   sudo mv aliyun /usr/local/bin/"
    fi

else
    echo "❌ Unknown SSL type: $SSL_TYPE"
    echo "Usage: ./setup-ssl.sh [letsencrypt|aliyun] [domain]"
    exit 1
fi

echo "🎉 SSL setup script completed!"
echo "📝 Next steps:"
echo "1. Verify certificates are in place: ls -la /data/zhuzhen/ssl/"
echo "2. Update nginx.conf with your domain name"
echo "3. Run deployment: ./deploy.sh aliyun"
