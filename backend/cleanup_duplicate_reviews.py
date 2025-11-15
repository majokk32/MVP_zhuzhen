#!/usr/bin/env python3
"""
清理重复的复盘记录，只保留每个提交的review_count为0, 1, 2的记录
"""

import asyncio
import asyncpg

async def cleanup_duplicate_reviews():
    """清理重复的复盘记录"""
    try:
        conn = await asyncpg.connect(
            host='localhost',
            port=5432,
            user='zhuzhen',
            password='password123',
            database='zhuzhen_db'
        )
        
        print("=" * 80)
        print("🧹 清理重复的复盘记录")
        print("=" * 80)
        
        # 1. 查看所有复盘记录
        all_records = await conn.fetch("""
            SELECT 
                err.id,
                err.submission_id,
                err.user_id,
                err.review_count,
                err.scheduled_date,
                err.status::text,
                s.graded_at,
                t.title
            FROM ebbinghaus_review_records err
            JOIN submissions s ON err.submission_id = s.id
            JOIN tasks t ON s.task_id = t.id
            ORDER BY err.submission_id, err.review_count, err.scheduled_date
        """)
        
        print(f"\n📋 当前有 {len(all_records)} 条复盘记录:\n")
        for record in all_records:
            print(f"  ID: {record['id']}, 提交: {record['submission_id']}, "
                  f"第{record['review_count']}次, 日期: {record['scheduled_date']}, "
                  f"状态: {record['status']}")
        
        # 2. 找出每个提交的重复记录
        duplicates = await conn.fetch("""
            SELECT 
                submission_id,
                user_id,
                review_count,
                COUNT(*) as count,
                array_agg(id ORDER BY scheduled_date) as ids
            FROM ebbinghaus_review_records
            GROUP BY submission_id, user_id, review_count
            HAVING COUNT(*) > 1
        """)
        
        if not duplicates:
            print("\n✅ 没有发现重复记录")
            await conn.close()
            return
        
        print(f"\n🔍 发现 {len(duplicates)} 组重复记录:\n")
        
        total_deleted = 0
        
        for dup in duplicates:
            ids = dup['ids']
            print(f"  提交 {dup['submission_id']}, 用户 {dup['user_id']}, "
                  f"第{dup['review_count']}次复盘: {len(ids)} 条记录")
            
            # 保留最早的那条（按scheduled_date），删除其他的
            # 先获取每条记录的scheduled_date
            records_info = await conn.fetch("""
                SELECT id, scheduled_date, status::text
                FROM ebbinghaus_review_records
                WHERE id = ANY($1::int[])
                ORDER BY scheduled_date, id
            """, ids)
            
            # 保留第一条，删除其他的
            keep_id = records_info[0]['id']
            delete_ids = [r['id'] for r in records_info[1:]]
            
            if delete_ids:
                await conn.execute("""
                    DELETE FROM ebbinghaus_review_records
                    WHERE id = ANY($1::int[])
                """, delete_ids)
                
                total_deleted += len(delete_ids)
                print(f"    ✅ 保留 ID {keep_id}, 删除 {len(delete_ids)} 条重复记录")
        
        # 3. 确保每个提交只有review_count为0, 1, 2的记录
        # 删除review_count >= 3的记录（因为应该只有0-4，但用户只要0, 1, 2）
        extra_records = await conn.fetch("""
            SELECT id, submission_id, review_count
            FROM ebbinghaus_review_records
            WHERE review_count > 2
        """)
        
        if extra_records:
            print(f"\n🗑️  删除review_count > 2的记录 ({len(extra_records)} 条):")
            for record in extra_records:
                print(f"  - ID: {record['id']}, 提交: {record['submission_id']}, 第{record['review_count']}次")
            
            await conn.execute("""
                DELETE FROM ebbinghaus_review_records
                WHERE review_count > 2
            """)
            total_deleted += len(extra_records)
        
        print(f"\n" + "=" * 80)
        print(f"✅ 清理完成！共删除 {total_deleted} 条重复/多余记录")
        print("=" * 80)
        
        # 4. 显示清理后的结果
        final_records = await conn.fetch("""
            SELECT 
                err.id,
                err.submission_id,
                err.review_count,
                err.scheduled_date,
                err.status::text
            FROM ebbinghaus_review_records err
            ORDER BY err.submission_id, err.review_count
        """)
        
        print(f"\n📋 清理后的复盘记录 ({len(final_records)} 条):\n")
        for record in final_records:
            print(f"  ID: {record['id']}, 提交: {record['submission_id']}, "
                  f"第{record['review_count']}次, 日期: {record['scheduled_date']}, "
                  f"状态: {record['status']}")
        
        await conn.close()
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(cleanup_duplicate_reviews())

