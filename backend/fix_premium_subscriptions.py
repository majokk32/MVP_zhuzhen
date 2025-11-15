#!/usr/bin/env python3
"""
修复数据库中付费用户的订阅状态
将所有PREMIUM类型用户的subscription_expires_at设置为NULL（永久有效）
"""

import asyncio
import asyncpg
from datetime import datetime

async def fix_premium_subscriptions():
    """修复付费用户的订阅状态"""
    try:
        # 尝试从环境变量或使用默认密码
        import os
        password = os.getenv('DB_PASSWORD', 'password123')
        
        conn = await asyncpg.connect(
            host='localhost',
            port=5432,
            user='zhuzhen',
            password=password,
            database='zhuzhen_db'
        )
        
        print("=" * 80)
        print("🔧 修复付费用户订阅状态")
        print("=" * 80)
        
        # 查询所有PREMIUM类型的用户
        premium_users = await conn.fetch("""
            SELECT id, nickname, role, subscription_type, subscription_expires_at
            FROM users 
            WHERE subscription_type = 'PREMIUM'
            ORDER BY id
        """)
        
        if not premium_users:
            print("✅ 没有找到PREMIUM类型的用户")
            await conn.close()
            return
        
        print(f"\n📊 找到 {len(premium_users)} 个付费用户:\n")
        
        # 检查哪些用户有过期时间需要修复
        users_to_fix = []
        for user in premium_users:
            if user['subscription_expires_at'] is not None:
                users_to_fix.append(user)
                expires_str = user['subscription_expires_at'].strftime('%Y-%m-%d %H:%M:%S')
                print(f"  - ID: {user['id']}, 昵称: {user['nickname']}, 角色: {user['role']}")
                print(f"    当前过期时间: {expires_str} ❌ (需要修复为永久有效)")
            else:
                print(f"  - ID: {user['id']}, 昵称: {user['nickname']}, 角色: {user['role']}")
                print(f"    过期时间: NULL ✅ (已经是永久有效)")
        
        if not users_to_fix:
            print("\n✅ 所有付费用户都已经是永久有效，无需修复")
            await conn.close()
            return
        
        print(f"\n🔧 准备修复 {len(users_to_fix)} 个用户的订阅状态...")
        
        # 更新这些用户的过期时间为NULL
        for user in users_to_fix:
            await conn.execute("""
                UPDATE users 
                SET subscription_expires_at = NULL,
                    updated_at = $1
                WHERE id = $2
            """, datetime.utcnow(), user['id'])
            print(f"  ✅ 已修复用户 ID {user['id']} ({user['nickname']})")
        
        print(f"\n✅ 成功修复 {len(users_to_fix)} 个付费用户的订阅状态！")
        print("   所有付费用户现在都是永久有效的。")
        
        await conn.close()
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(fix_premium_subscriptions())

