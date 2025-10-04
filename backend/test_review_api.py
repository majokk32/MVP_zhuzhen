#!/usr/bin/env python3
"""
测试复盘API的简单脚本
"""

import asyncio
import sys
import os

# 添加项目根目录到路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 强制使用PostgreSQL数据库
os.environ['DATABASE_URL'] = 'postgresql+asyncpg://zhuzhen:zhuzhen_password@localhost:5432/zhuzhen_db'

from app.database import get_db
from app.api.ebbinghaus_reviews import get_today_review_tasks
from app.models import User
from sqlalchemy.ext.asyncio import AsyncSession

async def test_review_api():
    """测试复盘API"""
    print("🧪 开始测试复盘API...")
    
    # 获取数据库连接
    db_gen = get_db()
    db: AsyncSession = await db_gen.__anext__()
    
    try:
        # 模拟用户1
        from sqlalchemy import select
        user_result = await db.execute(select(User).where(User.id == 1))
        user = user_result.scalar_one_or_none()
        
        if not user:
            print("❌ 找不到用户ID=1")
            return
            
        print(f"✅ 找到用户: {user.nickname}")
        
        # 创建模拟请求对象
        class MockRequest:
            pass
            
        # 直接调用API函数
        try:
            from app.api.ebbinghaus_reviews import get_today_review_tasks
            from unittest.mock import MagicMock
            
            # 创建模拟的依赖注入
            mock_current_user = user
            mock_db = db
            
            # 调用API函数
            response = await get_today_review_tasks(mock_current_user, mock_db)
            
            print(f"✅ API调用成功")
            print(f"📊 返回数据: {response}")
            print(f"📈 任务数量: {len(response.data) if response.data else 0}")
            
            if response.data:
                for task in response.data:
                    print(f"  - 任务: {task.get('title', 'N/A')} (状态: {task.get('status', 'N/A')})")
            
        except Exception as api_error:
            print(f"❌ API调用失败: {api_error}")
            import traceback
            traceback.print_exc()
            
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(test_review_api())