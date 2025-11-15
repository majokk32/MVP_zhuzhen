#!/usr/bin/env python3
"""
测试新的复盘任务生成逻辑
"""

import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import get_db
from app.services.ebbinghaus_service import ebbinghaus_service
from app.models import User

async def test_new_review_logic():
    """测试新的复盘任务生成逻辑"""
    try:
        db_gen = get_db()
        db = await db_gen.__anext__()
        
        print("=" * 80)
        print("🧪 测试新的复盘任务生成逻辑")
        print("=" * 80)
        
        # 获取用户
        from sqlalchemy import select
        user_result = await db.execute(select(User).where(User.id == 1))
        user = user_result.scalar_one_or_none()
        
        if not user:
            print("❌ 用户不存在")
            await db.close()
            return
        
        print(f"\n👤 测试用户: {user.nickname} (ID: {user.id})\n")
        
        # 生成复盘任务
        created_count = await ebbinghaus_service.generate_daily_review_queue(db)
        
        print(f"\n✅ 生成了 {created_count} 个复盘任务")
        
        # 检查生成的复盘记录
        from app.models import EbbinghausReviewRecord
        reviews_result = await db.execute(
            select(EbbinghausReviewRecord)
            .where(EbbinghausReviewRecord.user_id == user.id)
            .order_by(EbbinghausReviewRecord.review_count)
        )
        reviews = reviews_result.scalars().all()
        
        print(f"\n📋 生成的复盘记录 ({len(reviews)} 条):\n")
        for review in reviews:
            print(f"  - 提交ID: {review.submission_id}, 第{review.review_count}次复盘")
            print(f"    计划日期: {review.scheduled_date}, 间隔: {review.ebbinghaus_interval}天")
            print(f"    状态: {review.status.value}")
        
        await db.close()
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_new_review_logic())

