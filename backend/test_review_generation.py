#!/usr/bin/env python3
"""
测试复盘任务生成逻辑
"""

import asyncio
import asyncpg
from datetime import datetime, date, timedelta
import pytz

async def test_review_generation():
    """测试复盘任务生成"""
    try:
        conn = await asyncpg.connect(
            host='localhost',
            port=5432,
            user='zhuzhen',
            password='password123',
            database='zhuzhen_db'
        )
        
        print("=" * 80)
        print("🧪 测试复盘任务生成逻辑")
        print("=" * 80)
        
        # 1. 检查优秀/极佳的提交
        submissions = await conn.fetch("""
            SELECT 
                s.id,
                s.task_id,
                s.student_id,
                s.grade::text,
                s.graded_at,
                EXTRACT(DAY FROM NOW() - s.graded_at)::int as days_since_graded,
                t.title
            FROM submissions s
            JOIN tasks t ON s.task_id = t.id
            WHERE s.graded_at IS NOT NULL
              AND s.grade::text IN ('EXCELLENT', 'GOOD')
            ORDER BY s.graded_at
        """)
        
        print(f"\n📋 找到 {len(submissions)} 个优秀/极佳的提交:\n")
        for sub in submissions:
            print(f"  - 提交ID: {sub['id']}, 任务: {sub['title']}")
            print(f"    评分: {sub['grade']}, 批改时间: {sub['graded_at']}")
            print(f"    距离现在: {sub['days_since_graded']} 天")
        
        # 2. 检查艾宾浩斯间隔
        EBBINGHAUS_INTERVALS = [1, 3, 7, 15, 30]
        china_tz = pytz.timezone('Asia/Shanghai')
        today = datetime.now(china_tz).date()
        
        print(f"\n📅 今天日期: {today}")
        print(f"📅 艾宾浩斯间隔: {EBBINGHAUS_INTERVALS} 天\n")
        
        # 3. 对于每个提交，检查应该创建哪些复盘任务
        for sub in submissions:
            graded_date = sub['graded_at'].date()
            print(f"\n🔍 分析提交 {sub['id']} (批改日期: {graded_date}):")
            
            for review_count, interval_days in enumerate(EBBINGHAUS_INTERVALS):
                scheduled_date = graded_date + timedelta(days=interval_days)
                days_until_review = (scheduled_date - today).days
                
                # 检查是否已有该复盘记录
                existing = await conn.fetchrow("""
                    SELECT id, status::text, scheduled_date
                    FROM ebbinghaus_review_records
                    WHERE submission_id = $1
                      AND user_id = $2
                      AND review_count = $3
                """, sub['id'], sub['student_id'], review_count)
                
                status = "✅ 已存在" if existing else "❌ 缺失"
                if scheduled_date <= today:
                    print(f"  第{review_count+1}次复盘 (间隔{interval_days}天):")
                    print(f"    计划日期: {scheduled_date} ({'已过期' if scheduled_date < today else '今天'})")
                    print(f"    状态: {status}")
                    if existing:
                        print(f"    记录ID: {existing['id']}, 状态: {existing['status']}")
        
        # 4. 检查是否已掌握
        for sub in submissions:
            mastered = await conn.fetchrow("""
                SELECT id FROM ebbinghaus_mastered_tasks
                WHERE submission_id = $1 AND user_id = $2
            """, sub['id'], sub['student_id'])
            
            if mastered:
                print(f"\n⚠️  提交 {sub['id']} 已标记为掌握，不会生成复盘任务")
        
        await conn.close()
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_review_generation())

