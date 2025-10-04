#!/usr/bin/env python3
"""
简单测试数据库连接和复盘数据
"""

import asyncio
import asyncpg
from datetime import date

async def test_db_connection():
    """测试数据库连接"""
    try:
        # 直接使用asyncpg连接，不通过SQLAlchemy
        conn = await asyncpg.connect(
            host='localhost',
            port=5432,
            user='zhuzhen',
            password='password123',
            database='zhuzhen_db'
        )
        
        print("✅ 数据库连接成功")
        
        # 查询用户数据
        users = await conn.fetch("SELECT id, nickname, role FROM users LIMIT 5")
        print(f"📊 用户数据 ({len(users)}条):")
        for user in users:
            print(f"  - ID: {user['id']}, 昵称: {user['nickname']}, 角色: {user['role']}")
        
        # 查询复盘数据
        today = date.today()
        review_records = await conn.fetch("""
            SELECT 
                err.user_id,
                err.submission_id, 
                err.review_count,
                err.scheduled_date,
                err.status,
                s.grade,
                t.title
            FROM ebbinghaus_review_records err
            JOIN submissions s ON err.submission_id = s.id
            JOIN tasks t ON s.task_id = t.id
            WHERE err.user_id = 1 
                AND err.scheduled_date <= $1 
                AND err.status = 'PENDING'
            ORDER BY err.scheduled_date
        """, today)
        
        print(f"📋 用户1的待复盘任务 ({len(review_records)}条):")
        for record in review_records:
            overdue_days = (today - record['scheduled_date']).days
            status_text = f"过期{overdue_days}天" if overdue_days > 0 else "今日"
            print(f"  - 任务: {record['title']} (第{record['review_count']+1}次复盘, {status_text})")
        
        await conn.close()
        return len(review_records)
        
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        return 0

if __name__ == "__main__":
    asyncio.run(test_db_connection())