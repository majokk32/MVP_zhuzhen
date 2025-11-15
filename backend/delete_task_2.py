#!/usr/bin/env python3
"""
删除task_id=2的所有相关数据
"""

import asyncio
import asyncpg
from datetime import datetime

async def delete_task_2():
    """删除task_id=2的所有相关数据"""
    try:
        conn = await asyncpg.connect(
            host='localhost',
            port=5432,
            user='zhuzhen',
            password='password123',
            database='zhuzhen_db'
        )
        
        print("=" * 80)
        print("🗑️  删除任务 TestIt1107 (task_id=2) 的所有相关数据")
        print("=" * 80)
        
        task_id = 2
        
        # 1. 检查任务是否存在
        task = await conn.fetchrow("SELECT id, title FROM tasks WHERE id = $1", task_id)
        if not task:
            print(f"❌ 任务 ID {task_id} 不存在")
            await conn.close()
            return
        
        print(f"\n📋 找到任务: {task['title']} (ID: {task['id']})")
        
        # 2. 检查并删除关联数据
        deleted_counts = {}
        
        # 2.1 删除 submissions (需要先删除所有关联数据)
        submissions = await conn.fetch("SELECT id FROM submissions WHERE task_id = $1", task_id)
        submission_ids = [s['id'] for s in submissions]
        if submission_ids:
            # 删除与submissions相关的其他数据（按依赖顺序）
            # user_score_records (通过submission_id)
            count = await conn.execute(
                "DELETE FROM user_score_records WHERE related_submission_id = ANY($1::int[])",
                submission_ids
            )
            deleted_counts['user_score_records_by_submission'] = int(count.split()[-1])
            if deleted_counts['user_score_records_by_submission'] > 0:
                print(f"  ✅ 删除了 {deleted_counts['user_score_records_by_submission']} 条积分记录(通过submission)")
            
            # ebbinghaus_review_records
            count = await conn.execute(
                "DELETE FROM ebbinghaus_review_records WHERE submission_id = ANY($1::int[])",
                submission_ids
            )
            deleted_counts['ebbinghaus_review_records'] = int(count.split()[-1])
            if deleted_counts['ebbinghaus_review_records'] > 0:
                print(f"  ✅ 删除了 {deleted_counts['ebbinghaus_review_records']} 条复盘记录")
            
            # ebbinghaus_mastered_tasks
            count = await conn.execute(
                "DELETE FROM ebbinghaus_mastered_tasks WHERE submission_id = ANY($1::int[])",
                submission_ids
            )
            deleted_counts['ebbinghaus_mastered_tasks'] = int(count.split()[-1])
            if deleted_counts['ebbinghaus_mastered_tasks'] > 0:
                print(f"  ✅ 删除了 {deleted_counts['ebbinghaus_mastered_tasks']} 条掌握任务记录")
            
            # user_checkins (通过submission_id)
            count = await conn.execute(
                "DELETE FROM user_checkins WHERE related_submission_id = ANY($1::int[])",
                submission_ids
            )
            deleted_counts['user_checkins_by_submission'] = int(count.split()[-1])
            if deleted_counts['user_checkins_by_submission'] > 0:
                print(f"  ✅ 删除了 {deleted_counts['user_checkins_by_submission']} 条打卡记录(通过submission)")
            
            # 最后删除submissions
            count = await conn.execute("DELETE FROM submissions WHERE task_id = $1", task_id)
            deleted_counts['submissions'] = int(count.split()[-1])
            print(f"  ✅ 删除了 {deleted_counts['submissions']} 条提交记录")
        
        # 2.2 删除 task_tag_usages
        count = await conn.execute("DELETE FROM task_tag_usages WHERE task_id = $1", task_id)
        deleted_counts['task_tag_usages'] = int(count.split()[-1])
        if deleted_counts['task_tag_usages'] > 0:
            print(f"  ✅ 删除了 {deleted_counts['task_tag_usages']} 条标签使用记录")
        
        # 2.3 删除 user_checkins (通过related_task_id)
        count = await conn.execute("DELETE FROM user_checkins WHERE related_task_id = $1", task_id)
        deleted_counts['user_checkins_by_task'] = int(count.split()[-1])
        if deleted_counts['user_checkins_by_task'] > 0:
            print(f"  ✅ 删除了 {deleted_counts['user_checkins_by_task']} 条打卡记录")
        
        # 2.4 删除 user_score_records (通过related_task_id)
        count = await conn.execute("DELETE FROM user_score_records WHERE related_task_id = $1", task_id)
        deleted_counts['user_score_records'] = int(count.split()[-1])
        if deleted_counts['user_score_records'] > 0:
            print(f"  ✅ 删除了 {deleted_counts['user_score_records']} 条积分记录")
        
        # 2.5 删除 notifications (通过related_task_id)
        count = await conn.execute("DELETE FROM notifications WHERE related_task_id = $1", task_id)
        deleted_counts['notifications'] = int(count.split()[-1])
        if deleted_counts['notifications'] > 0:
            print(f"  ✅ 删除了 {deleted_counts['notifications']} 条通知记录")
        
        # 2.6 删除 ebbinghaus_review_records (直接通过task_id，如果存在)
        try:
            count = await conn.execute("DELETE FROM ebbinghaus_review_records WHERE task_id = $1", task_id)
            deleted_counts['ebbinghaus_review_records_by_task'] = int(count.split()[-1])
            if deleted_counts['ebbinghaus_review_records_by_task'] > 0:
                print(f"  ✅ 删除了 {deleted_counts['ebbinghaus_review_records_by_task']} 条复盘记录")
        except Exception as e:
            print(f"  ⚠️  删除 ebbinghaus_review_records (by task_id) 时出错: {e}")
        
        # 2.7 删除 ebbinghaus_mastered_tasks (直接通过task_id，如果存在)
        try:
            count = await conn.execute("DELETE FROM ebbinghaus_mastered_tasks WHERE task_id = $1", task_id)
            deleted_counts['ebbinghaus_mastered_tasks_by_task'] = int(count.split()[-1])
            if deleted_counts['ebbinghaus_mastered_tasks_by_task'] > 0:
                print(f"  ✅ 删除了 {deleted_counts['ebbinghaus_mastered_tasks_by_task']} 条掌握任务记录")
        except Exception as e:
            print(f"  ⚠️  删除 ebbinghaus_mastered_tasks (by task_id) 时出错: {e}")
        
        # 3. 删除任务本身
        count = await conn.execute("DELETE FROM tasks WHERE id = $1", task_id)
        deleted_counts['tasks'] = int(count.split()[-1])
        print(f"  ✅ 删除了任务记录")
        
        # 4. 删除文件系统中的文件夹
        import os
        import shutil
        upload_dir = "./uploads"
        task_folder = os.path.join(upload_dir, f"task_{task_id}")
        if os.path.exists(task_folder):
            try:
                shutil.rmtree(task_folder)
                print(f"  ✅ 删除了文件文件夹: {task_folder}")
            except Exception as e:
                print(f"  ⚠️  删除文件夹失败: {task_folder}, 错误: {e}")
        
        print("\n" + "=" * 80)
        print("✅ 删除完成！")
        print("=" * 80)
        print("\n删除统计:")
        for table, count in deleted_counts.items():
            if count > 0:
                print(f"  - {table}: {count} 条")
        
        await conn.close()
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(delete_task_2())

