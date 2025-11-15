#!/usr/bin/env python3
"""
修复复盘任务：为所有应该复盘但还没有创建复盘记录的提交创建复盘任务
"""

import asyncio
import asyncpg
from datetime import datetime, date, timedelta
import pytz

async def fix_review_tasks():
    """修复所有缺失的复盘任务"""
    try:
        conn = await asyncpg.connect(
            host='localhost',
            port=5432,
            user='zhuzhen',
            password='password123',
            database='zhuzhen_db'
        )
        
        print("=" * 80)
        print("🔧 修复复盘任务")
        print("=" * 80)
        
        EBBINGHAUS_INTERVALS = [1, 3, 7, 15, 30]
        china_tz = pytz.timezone('Asia/Shanghai')
        today = datetime.now(china_tz).date()
        
        # 1. 获取所有优秀/极佳的提交
        submissions = await conn.fetch("""
            SELECT 
                s.id,
                s.task_id,
                s.student_id,
                s.grade::text,
                s.graded_at
            FROM submissions s
            WHERE s.graded_at IS NOT NULL
              AND s.grade::text IN ('EXCELLENT', 'GOOD')
            ORDER BY s.graded_at
        """)
        
        print(f"\n📋 找到 {len(submissions)} 个优秀/极佳的提交\n")
        
        total_created = 0
        
        for sub in submissions:
            graded_date = sub['graded_at'].date()
            print(f"🔍 处理提交 {sub['id']} (批改日期: {graded_date}):")
            
            # 检查是否已掌握
            mastered = await conn.fetchrow("""
                SELECT id FROM ebbinghaus_mastered_tasks
                WHERE submission_id = $1 AND user_id = $2
            """, sub['id'], sub['student_id'])
            
            if mastered:
                print(f"  ⚠️  已标记为掌握，跳过")
                continue
            
            created_count = 0
            
            # 检查每个艾宾浩斯间隔
            for review_count, interval_days in enumerate(EBBINGHAUS_INTERVALS):
                scheduled_date = graded_date + timedelta(days=interval_days)
                
                # 如果到了复盘时间或已过期
                if scheduled_date <= today:
                    # 检查是否已有该复盘记录
                    existing = await conn.fetchrow("""
                        SELECT id FROM ebbinghaus_review_records
                        WHERE submission_id = $1
                          AND user_id = $2
                          AND review_count = $3
                    """, sub['id'], sub['student_id'], review_count)
                    
                    if not existing:
                        # 创建新的复盘记录
                        await conn.execute("""
                            INSERT INTO ebbinghaus_review_records 
                            (submission_id, user_id, review_count, scheduled_date, 
                             original_graded_date, ebbinghaus_interval, status, is_mastered, created_at, updated_at)
                            VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', false, NOW(), NOW())
                        """, sub['id'], sub['student_id'], review_count, scheduled_date, 
                            graded_date, interval_days)
                        
                        created_count += 1
                        total_created += 1
                        status_text = "今天" if scheduled_date == today else f"已过期{abs((today - scheduled_date).days)}天"
                        print(f"  ✅ 创建第{review_count+1}次复盘任务 (间隔{interval_days}天, 计划日期: {scheduled_date}, {status_text})")
            
            if created_count == 0:
                print(f"  ℹ️  所有复盘任务已存在")
        
        print(f"\n" + "=" * 80)
        print(f"✅ 修复完成！共创建 {total_created} 个复盘任务")
        print("=" * 80)
        
        await conn.close()
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(fix_review_tasks())

