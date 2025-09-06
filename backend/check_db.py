#!/usr/bin/env python3
"""
数据库检查和管理工具
用于查看数据库状态、表结构和数据内容
"""

import asyncio
import os
import sqlite3
from pathlib import Path

# 设置环境变量
os.environ.setdefault('DATABASE_URL', 'sqlite+aiosqlite:///./data/app.db')

from app.database import engine, init_db
from app.models import User, Task, Submission
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def check_database():
    """检查数据库状态"""
    print("🔍 检查数据库状态...")
    
    # 检查data目录
    data_dir = Path("./data")
    if not data_dir.exists():
        print("📁 创建data目录...")
        data_dir.mkdir(exist_ok=True)
    
    # 检查数据库文件
    db_file = Path("./data/app.db")
    if db_file.exists():
        print(f"✅ 数据库文件存在: {db_file.absolute()}")
        print(f"📊 文件大小: {db_file.stat().st_size} bytes")
    else:
        print("❌ 数据库文件不存在，将创建新的数据库")
    
    # 初始化数据库
    print("\n🔧 初始化数据库表...")
    await init_db()
    print("✅ 数据库表初始化完成")


async def show_tables():
    """显示所有表"""
    print("\n📋 数据库表结构:")
    async with engine.begin() as conn:
        result = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table';"))
        tables = result.fetchall()
        for table in tables:
            print(f"  - {table[0]}")


async def show_users():
    """显示用户数据"""
    print("\n👥 用户数据:")
    async with AsyncSession(engine) as session:
        result = await session.execute(text("SELECT id, nickname, role, openid, created_at FROM users"))
        users = result.fetchall()
        
        if not users:
            print("  📭 暂无用户数据")
            return
            
        print(f"  共 {len(users)} 个用户:")
        for user in users:
            print(f"  - ID:{user[0]} | {user[1]} | {user[2]} | openid:...{user[3][-6:]} | {user[4]}")


async def show_tasks():
    """显示任务数据"""
    print("\n📝 任务数据:")
    async with AsyncSession(engine) as session:
        result = await session.execute(text("SELECT id, title, course, status, created_at FROM tasks"))
        tasks = result.fetchall()
        
        if not tasks:
            print("  📭 暂无任务数据")
            return
            
        print(f"  共 {len(tasks)} 个任务:")
        for task in tasks:
            print(f"  - ID:{task[0]} | {task[1]} | {task[2]} | {task[3]} | {task[4]}")


async def show_submissions():
    """显示提交数据"""
    print("\n📤 提交数据:")
    async with AsyncSession(engine) as session:
        result = await session.execute(text("""
            SELECT s.id, s.task_id, u.nickname, s.status, s.score, s.created_at 
            FROM submissions s 
            LEFT JOIN users u ON s.student_id = u.id
        """))
        submissions = result.fetchall()
        
        if not submissions:
            print("  📭 暂无提交数据")
            return
            
        print(f"  共 {len(submissions)} 个提交:")
        for sub in submissions:
            print(f"  - ID:{sub[0]} | 任务:{sub[1]} | {sub[2]} | {sub[3]} | 分数:{sub[4]} | {sub[5]}")


async def create_test_user():
    """创建测试用户"""
    print("\n🔧 创建测试用户...")
    
    async with AsyncSession(engine) as session:
        # 检查是否已有测试用户
        result = await session.execute(text("SELECT id FROM users WHERE openid = 'test_openid_12345'"))
        existing = result.fetchone()
        
        if existing:
            print("  ⚠️  测试用户已存在")
            return
        
        # 创建测试用户
        await session.execute(text("""
            INSERT INTO users (openid, nickname, role, created_at, updated_at) 
            VALUES ('test_openid_12345', '测试学生', 'student', datetime('now'), datetime('now'))
        """))
        
        # 创建测试教师
        await session.execute(text("""
            INSERT INTO users (openid, nickname, role, created_at, updated_at) 
            VALUES ('test_teacher_67890', '测试老师', 'teacher', datetime('now'), datetime('now'))
        """))
        
        await session.commit()
        print("  ✅ 测试用户创建成功")


async def main():
    """主函数"""
    print("=" * 50)
    print("📊 公考督学助手 - 数据库检查工具")
    print("=" * 50)
    
    try:
        await check_database()
        await show_tables()
        await show_users()
        await show_tasks()
        await show_submissions()
        
        # 如果没有用户，创建测试用户
        print("\n" + "=" * 50)
        choice = input("是否创建测试用户? (y/N): ").lower()
        if choice in ['y', 'yes']:
            await create_test_user()
            await show_users()  # 再次显示用户
        
        print("\n✅ 数据库检查完成!")
        print(f"💾 数据库文件位置: {Path('./data/app.db').absolute()}")
        
    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())