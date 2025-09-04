#!/usr/bin/env python3
"""
认证调试工具 - 检查JWT和数据库用户记录
"""

import asyncio
import os
import sqlite3
from pathlib import Path
import json

# 设置环境
os.environ.setdefault('DATABASE_URL', 'sqlite+aiosqlite:///./data/app.db')

from app.database import engine, init_db
from app.models import User
from app.auth import create_access_token, verify_token
from app.config import settings
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from jose import jwt

async def check_database_users():
    """检查数据库中的用户"""
    print("🔍 检查数据库用户记录...")
    
    # 确保data目录存在
    data_dir = Path("./data")
    if not data_dir.exists():
        data_dir.mkdir()
        print("📁 创建data目录")
    
    # 初始化数据库
    await init_db()
    
    async with AsyncSession(engine) as session:
        result = await session.execute(text("""
            SELECT id, openid, nickname, role, created_at 
            FROM users 
            ORDER BY id
        """))
        users = result.fetchall()
        
        if not users:
            print("❌ 数据库中没有用户记录")
            return []
        
        print(f"✅ 找到 {len(users)} 个用户:")
        for user in users:
            print(f"  - ID:{user[0]} | openid:{user[1][-8:]}... | {user[2]} | {user[3]}")
        
        return users

def test_jwt_operations():
    """测试JWT token操作"""
    print("\n🔐 测试JWT操作...")
    
    # 测试token创建和验证
    test_user_id = 1
    
    print(f"SECRET_KEY前20字符: {settings.SECRET_KEY[:20]}...")
    print(f"算法: {settings.ALGORITHM}")
    
    # 创建token (sub必须是字符串)
    token = create_access_token(data={"sub": str(test_user_id)})
    print(f"生成的token前30字符: {token[:30]}...")
    
    # 解码token看内容
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        print(f"Token内容: {payload}")
        
        # 验证token
        verified_payload = verify_token(token)
        print(f"验证结果: {verified_payload}")
        
        return token, payload.get('sub')
    except Exception as e:
        print(f"❌ JWT操作失败: {e}")
        return None, None

async def simulate_login(openid="test_openid_debug"):
    """模拟登录过程"""
    print(f"\n🚪 模拟登录过程 (openid: {openid})...")
    
    async with AsyncSession(engine) as session:
        # 检查用户是否存在
        result = await session.execute(text(f"SELECT id FROM users WHERE openid = '{openid}'"))
        existing = result.fetchone()
        
        if existing:
            user_id = existing[0]
            print(f"✅ 用户已存在，ID: {user_id}")
        else:
            # 创建新用户
            await session.execute(text(f"""
                INSERT INTO users (openid, nickname, role, created_at, updated_at) 
                VALUES ('{openid}', '调试用户', 'student', datetime('now'), datetime('now'))
            """))
            await session.commit()
            
            # 获取新创建的用户ID
            result = await session.execute(text(f"SELECT id FROM users WHERE openid = '{openid}'"))
            user_id = result.fetchone()[0]
            print(f"✅ 创建新用户，ID: {user_id}")
        
        # 生成token (sub必须是字符串)
        token = create_access_token(data={"sub": str(user_id)})
        print(f"✅ 生成token: {token[:30]}...")
        
        # 验证token
        try:
            payload = verify_token(token)
            print(f"✅ Token验证成功: {payload}")
            
            # 检查数据库中是否有这个用户
            result = await session.execute(text(f"SELECT id, nickname FROM users WHERE id = {payload.get('sub')}"))
            user = result.fetchone()
            
            if user:
                print(f"✅ 数据库验证成功: ID:{user[0]} {user[1]}")
                return True
            else:
                print(f"❌ 数据库中没有ID为{payload.get('sub')}的用户")
                return False
                
        except Exception as e:
            print(f"❌ Token验证失败: {e}")
            return False

async def main():
    """主函数"""
    print("=" * 60)
    print("🛠️  公考督学助手 - 认证调试工具")
    print("=" * 60)
    
    try:
        # 1. 检查数据库用户
        users = await check_database_users()
        
        # 2. 测试JWT操作
        token, user_id = test_jwt_operations()
        
        # 3. 模拟完整登录
        success = await simulate_login()
        
        print("\n" + "=" * 60)
        if success:
            print("✅ 认证系统运行正常!")
        else:
            print("❌ 认证系统存在问题!")
            
        print("\n💡 调试建议:")
        if not users:
            print("  - 数据库为空，需要确保微信登录能正确创建用户")
        if not token:
            print("  - JWT配置有问题，检查SECRET_KEY设置")
        
        print(f"  - 数据库文件: {Path('./data/app.db').absolute()}")
        print(f"  - 可以用SQLite浏览器打开数据库文件查看")
        
    except Exception as e:
        print(f"❌ 运行出错: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())