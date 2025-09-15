"""
Admin/Teacher management API endpoints
"""

import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from typing import Optional, List
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, Task, Submission, SubmissionStatus, UserRole, TaskStatus, SubscriptionType
from app.schemas import ResponseBase, TaskProgress, StudentStats
from app.auth import get_current_teacher

router = APIRouter(prefix="/admin")


@router.get("/task-progress", response_model=ResponseBase)
async def get_task_progress(
    task_id: Optional[int] = None,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Get task submission progress (teacher only)
    """
    from app.utils.task_status import calculate_display_status
    from datetime import datetime
    
    # Build query
    if task_id:
        task_result = await db.execute(select(Task).where(Task.id == task_id))
        tasks = [task_result.scalar_one_or_none()]
        if not tasks[0]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="任务不存在"
            )
    else:
        task_result = await db.execute(
            select(Task).order_by(desc(Task.created_at))
        )
        tasks = task_result.scalars().all()
    
    progress_list = []
    
    for task in tasks:
        # Get submission statistics
        sub_result = await db.execute(
            select(Submission).where(Submission.task_id == task.id)
        )
        submissions = sub_result.scalars().all()
        
        submitted_count = len(submissions)
        graded_count = len([s for s in submissions if s.status == SubmissionStatus.GRADED])
        pending_count = submitted_count - graded_count
        
        # Get total student count (for now, we'll use submitted as proxy)
        # In a real system, you might have a course enrollment table
        total_students = submitted_count  # This is a simplification
        
        # Calculate display status using the proper logic
        display_status = calculate_display_status(task, None)
        
        # Create progress data with status information
        progress_data = {
            "task_id": task.id,
            "task_title": task.title,
            "task_status": task.status.value,  # Raw database status
            "task_deadline": task.deadline.isoformat() if task.deadline else None,
            "display_status": display_status["left_status"],  # Calculated display status
            "card_style": display_status["card_style"],
            "total_students": total_students,
            "submitted_count": submitted_count,
            "graded_count": graded_count,
            "pending_count": pending_count,
            "is_past_deadline": task.deadline and datetime.utcnow() > task.deadline if task.deadline else False
        }
        
        progress_list.append(progress_data)
    
    return ResponseBase(data=progress_list)


@router.get("/students", response_model=ResponseBase)
async def get_student_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    filter: str = Query("", description="筛选条件: paid, trial, active"),
    keyword: str = Query("", description="搜索关键词"),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Get list of students with statistics and filtering (teacher only)  
    """
    try:
        # 构建基础查询条件
        base_query = select(User).where(User.role == UserRole.STUDENT)
        
        # 应用筛选条件
        if filter == "paid":
            # "付费学员" - PREMIUM subscription
            base_query = base_query.where(User.subscription_type == SubscriptionType.PREMIUM)
        elif filter == "trial": 
            # "试用学员" - TRIAL subscription
            base_query = base_query.where(User.subscription_type == SubscriptionType.TRIAL)
        elif filter == "active":
            # "活跃学员" - 最近有签到或提交的学员
            from datetime import datetime, timedelta
            cutoff_date = datetime.now() - timedelta(days=7)
            base_query = base_query.where(
                func.coalesce(User.last_checkin_date, User.updated_at) >= cutoff_date
            )
        
        # 应用关键词搜索
        if keyword:
            base_query = base_query.where(User.nickname.ilike(f"%{keyword}%"))
        
        # 获取筛选后的总数
        count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
        total = count_result.scalar()
        
        # 分页查询学生
        offset = (page - 1) * page_size
        student_result = await db.execute(
            base_query.offset(offset).limit(page_size)
        )
        students = student_result.scalars().all()
        
        # 处理学生数据
        student_list = []
        for student in students:
            # 使用数据库中的实际数据
            student_data = {
                "id": student.id,
                "nickname": student.nickname,
                "avatar": student.avatar or "https://example.com/default_avatar.jpg",
                "permission_type": "paid" if student.subscription_type == SubscriptionType.PREMIUM else "trial",
                "permission_expire": student.subscription_expires_at.strftime("%Y-%m-%d") if student.subscription_expires_at else None,
                "created_at": student.created_at.isoformat() if student.created_at else None,
                "last_active": student.updated_at.isoformat() if student.updated_at else None,
                "stats": {
                    "total_submissions": student.total_submissions or 0,
                    "completed_tasks": 0,  # 需要计算
                    "average_score": 0     # 需要计算
                }
            }
            student_list.append(student_data)
        
        # 获取统计数据
        all_students_result = await db.execute(
            select(User).where(User.role == UserRole.STUDENT)
        )
        all_students = all_students_result.scalars().all()
        
        total_students = len(all_students)
        paid_students = len([s for s in all_students if s.subscription_type == SubscriptionType.PREMIUM])
        trial_students = len([s for s in all_students if s.subscription_type == SubscriptionType.TRIAL])
        
        return ResponseBase(
            data={
                "students": student_list,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_students": total_students,
                "paid_students": paid_students,
                "trial_students": trial_students
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get students: {str(e)}"
        )


def _pg():
    import os
    return dict(
        host=os.getenv("PGHOST", "postgres"),  # Docker service name
        port=int(os.getenv("PGPORT", "5432")),
        database=os.getenv("PGDATABASE", "zhuzhen_db"),
        user=os.getenv("PGUSER", "zhuzhen"),
        password=os.getenv("PGPASSWORD", "password123"),
    )

@router.get("/students/{student_id}", response_model=ResponseBase)
async def get_student_detail(student_id: int):
    import psycopg2
    import psycopg2.extras
    from datetime import date, datetime
    
    conn = None
    try:
        conn = psycopg2.connect(**_pg())
        cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

        # 1) 只查询真实存在的列
        cur.execute("""
            SELECT
                id,
                nickname,
                avatar,
                role,
                total_submissions,
                total_score,
                subscription_type,
                subscription_expires_at,
                created_at,
                updated_at
            FROM users
            WHERE id = %s
        """, (student_id,))
        u = cur.fetchone()
        if not u:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="学生不存在")

        # 2) 以 submissions 表为准再做一次聚合（更真实）
        cur.execute("""
            SELECT
                COUNT(*)::int          AS cnt,
                COALESCE(SUM(score),0) AS sum_score
            FROM submissions
            WHERE student_id = %s
        """, (student_id,))
        agg = cur.fetchone()
        sub_cnt   = int(agg["cnt"]) if agg and agg["cnt"] is not None else 0
        sum_score = float(agg["sum_score"]) if agg and agg["sum_score"] is not None else 0.0

        # 3) 取最终统计：优先 submissions 聚合，fallback 到 users 里的累计列
        total_submissions = sub_cnt if sub_cnt is not None else int(u["total_submissions"] or 0)
        total_score       = sum_score if sum_score is not None else float(u["total_score"] or 0.0)
        avg_score         = (total_score / total_submissions) if total_submissions > 0 else 0.0

        # 4) 订阅映射
        stype_raw = (u["subscription_type"] or "").upper()
        permission_type = "paid" if stype_raw == "PREMIUM" else "trial"

        exp = u["subscription_expires_at"]
        if isinstance(exp, (datetime, date)):
            permission_expire = exp.strftime("%Y-%m-%d")
        elif isinstance(exp, str) and exp:
            permission_expire = exp[:10]
        else:
            permission_expire = None

        student = {
            "id": int(u["id"]),
            "nickname": u["nickname"] or "未设置昵称",
            "avatar_url": (u["avatar"] or "") or "https://example.com/default_avatar.jpg",
            "permission_type": permission_type,
            "permission_expire": permission_expire,
            "total_submissions": total_submissions,
            "completed_tasks": total_submissions,
            "average_score": avg_score,
            "created_at": u["created_at"].isoformat() if isinstance(u["created_at"], (datetime,)) else str(u["created_at"]),
            "updated_at": u["updated_at"].isoformat() if isinstance(u["updated_at"], (datetime,)) else str(u["updated_at"]),
        }

        return ResponseBase(data=student)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get student detail: {e}"
        )
    finally:
        if conn:
            conn.close()


@router.get("/student/{student_id}/submissions", response_model=ResponseBase)
async def get_student_submissions(
    student_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all submissions for a specific student (teacher only)
    """
    # Check if student exists
    student_result = await db.execute(select(User).where(User.id == student_id))
    student = student_result.scalar_one_or_none()
    
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="学生不存在"
        )
    
    # Get all submissions
    sub_result = await db.execute(
        select(Submission)
        .where(Submission.student_id == student_id)
        .order_by(desc(Submission.created_at))
    )
    submissions = sub_result.scalars().all()
    
    # Format response
    submission_list = []
    for sub in submissions:
        # Get task info
        task_result = await db.execute(select(Task).where(Task.id == sub.task_id))
        task = task_result.scalar_one_or_none()
        
        sub_data = {
            "id": sub.id,
            "task_id": sub.task_id,
            "task_title": task.title if task else "Unknown",
            "submission_count": sub.submission_count,
            "status": sub.status.value,
            "score": sub.score,
            "grade": sub.grade.value if sub.grade else None,
            "feedback": sub.feedback,
            "created_at": sub.created_at.isoformat(),
            "graded_at": sub.graded_at.isoformat() if sub.graded_at else None
        }
        submission_list.append(sub_data)
    
    return ResponseBase(
        data={
            "student": {
                "id": student.id,
                "nickname": student.nickname,
                "avatar": student.avatar
            },
            "submissions": submission_list
        }
    )


@router.post("/batch-download/{task_id}", response_model=ResponseBase)
async def request_batch_download(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Request batch download of submissions for a task (teacher only)
    Note: In MVP, this returns URLs directly. In production, use background task
    """
    # Check task exists
    task_result = await db.execute(select(Task).where(Task.id == task_id))
    task = task_result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Get all submissions for this task
    sub_result = await db.execute(
        select(Submission).where(Submission.task_id == task_id)
    )
    submissions = sub_result.scalars().all()
    
    # Collect all image URLs with student info
    download_list = []
    
    for sub in submissions:
        # Get student info
        student_result = await db.execute(select(User).where(User.id == sub.student_id))
        student = student_result.scalar_one_or_none()
        
        images = sub.images if sub.images else []
        
        for idx, img_url in enumerate(images):
            download_list.append({
                "url": img_url,
                "filename": f"{student.nickname if student else 'unknown'}_{task.title}_{idx+1}.jpg"
            })
    
    # In production, this would trigger a background task to zip files
    # For MVP, we return the list directly
    return ResponseBase(
        data={
            "download_list": download_list,
            "message": "请使用下载工具批量下载这些文件"
        }
    )


@router.get("/stats", response_model=ResponseBase)
async def get_admin_stats(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取管理员统计数据
    """
    try:
        # 统计所有任务总数（方案B：教师可以看到所有任务）
        total_tasks_result = await db.execute(
            select(func.count(Task.id))
        )
        total_tasks = total_tasks_result.scalar() or 0
        
        # 统计待批改的作业数（所有任务的提交）
        pending_grade_result = await db.execute(
            select(func.count(Submission.id))
            .where(Submission.status == SubmissionStatus.SUBMITTED)
        )
        pending_grade = pending_grade_result.scalar() or 0
        
        # 统计学生总数（所有学生用户）
        total_students_result = await db.execute(
            select(func.count(User.id))
            .where(User.role == UserRole.STUDENT)
        )
        total_students = total_students_result.scalar() or 0
        
        # 统计最近7天创建的任务数（所有任务）
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_tasks_result = await db.execute(
            select(func.count(Task.id))
            .where(Task.created_at >= week_ago)
        )
        recent_tasks = recent_tasks_result.scalar() or 0
        
        # 统计活跃学生数（最近7天有提交作业的学生，所有任务）
        active_students_result = await db.execute(
            select(func.count(func.distinct(Submission.student_id)))
            .where(Submission.created_at >= week_ago)
        )
        active_students = active_students_result.scalar() or 0
        
        return ResponseBase(
            data={
                "total_tasks": total_tasks,
                "pending_grade": pending_grade,
                "total_students": total_students,
                "recent_tasks": recent_tasks,
                "active_students": active_students
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get admin stats: {str(e)}"
        )


@router.get("/grading/stats", response_model=ResponseBase)
async def get_grading_stats(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取批改统计数据
    """
    try:
        today = datetime.utcnow().date()
        
        # 统计待批改作业数
        total_pending_result = await db.execute(
            select(func.count(Submission.id))
            .where(Submission.status == SubmissionStatus.SUBMITTED)
        )
        total_pending = total_pending_result.scalar() or 0
        
        # 统计今日已批改数量
        today_reviewed_result = await db.execute(
            select(func.count(Submission.id))
            .where(
                Submission.status == SubmissionStatus.GRADED,
                func.date(Submission.graded_at) == today
            )
        )
        today_reviewed = today_reviewed_result.scalar() or 0
        
        # 统计紧急任务数（临近截止时间的待批改作业）
        urgent_deadline = datetime.utcnow() + timedelta(days=1)
        urgent_count_result = await db.execute(
            select(func.count(Submission.id))
            .join(Task, Task.id == Submission.task_id)
            .where(
                Submission.status == SubmissionStatus.SUBMITTED,
                Task.deadline <= urgent_deadline
            )
        )
        urgent_count = urgent_count_result.scalar() or 0
        
        return ResponseBase(
            data={
                "total_pending": total_pending,
                "today_reviewed": today_reviewed,
                "urgent_count": urgent_count
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get grading stats: {str(e)}"
        )


@router.get("/grading/tasks", response_model=ResponseBase)
async def get_grading_tasks(
    filter: str = Query("all", description="筛选条件: all, pending, urgent"),
    page: int = Query(1, ge=1, description="页码"),  
    page_size: int = Query(10, ge=1, le=50, description="每页数量"),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取批改任务列表 - 从数据库获取真实数据
    """
    try:
        # Debug: 检查数据库中的任务和提交总数
        all_tasks_result = await db.execute(select(func.count(Task.id)))
        all_tasks_count = all_tasks_result.scalar() or 0
        all_submissions_result = await db.execute(select(func.count(Submission.id)))
        all_submissions_count = all_submissions_result.scalar() or 0
        print(f"[DEBUG] Total tasks in DB: {all_tasks_count}, total submissions: {all_submissions_count}")
        
        # 获取所有有提交记录的任务
        tasks_with_submissions = await db.execute(
            select(Task)
            .join(Submission, Task.id == Submission.task_id)
            .where(Task.status.in_([TaskStatus.ONGOING, TaskStatus.ENDED]))
            .group_by(Task.id)
            .order_by(desc(Task.created_at))
        )
        tasks = tasks_with_submissions.scalars().all()
        print(f"[DEBUG] Found {len(tasks)} tasks with submissions")
        
        result_tasks = []
        
        for task in tasks:
            # 获取该任务的提交统计 - 使用简单的分别查询避免SQLAlchemy语法问题
            total_submitted_result = await db.execute(
                select(func.count(Submission.id))
                .where(Submission.task_id == task.id)
            )
            total_submitted = int(total_submitted_result.scalar() or 0)
            
            pending_result = await db.execute(
                select(func.count(Submission.id))
                .where(Submission.task_id == task.id, Submission.status == 'SUBMITTED')
            )
            pending = int(pending_result.scalar() or 0)
            
            reviewed_result = await db.execute(
                select(func.count(Submission.id))
                .where(Submission.task_id == task.id, Submission.status == 'GRADED')
            )
            reviewed = int(reviewed_result.scalar() or 0)
            
            # 判断是否紧急（临近截止时间且有待批改）
            from datetime import datetime, timedelta
            is_urgent = (
                task.deadline and 
                task.deadline <= datetime.utcnow() + timedelta(hours=24) and
                pending > 0
            )
            
            # 根据筛选条件过滤
            if filter == "urgent" and not is_urgent:
                continue
            elif filter == "ongoing" and task.status != TaskStatus.ONGOING:
                continue  
            elif filter == "completed" and (task.status != TaskStatus.ENDED or pending > 0):
                continue
                
            task_data = {
                "id": task.id,
                "title": task.title,
                "status": task.status.value.lower(),
                "course_date": task.created_at.isoformat() if task.created_at else None,
                "deadline": task.deadline.isoformat() if task.deadline else None,
                "task_type": "homework",
                "stats": {
                    "submitted": total_submitted,
                    "pending": pending,
                    "reviewed": reviewed,
                    "total_students": total_submitted  # 假设每个学生只提交一次
                },
                "is_urgent": is_urgent
            }
            
            result_tasks.append(task_data)
        
        # 分页
        start = (page - 1) * page_size
        end = start + page_size
        paginated_tasks = result_tasks[start:end]
        has_more = end < len(result_tasks)
        
        return ResponseBase(
            data={
                "tasks": paginated_tasks,
                "has_more": has_more,
                "total": len(result_tasks)
            }
        )
        
    except Exception as e:
        print(f"[ERROR] 获取批改任务失败: {e}")
        # 如果数据库查询失败，返回空结果而不是错误
        return ResponseBase(
            data={
                "tasks": [],
                "has_more": False,
                "total": 0
            }
        )


@router.get("/grading/tasks-fixed", response_model=ResponseBase)
async def get_grading_tasks_fixed(
    filter: str = Query("all", description="筛选条件: all, pending, urgent"),
    page: int = Query(1, ge=1, description="页码"),  
    page_size: int = Query(10, ge=1, le=50, description="每页数量")
):
    """
    测试版本：返回固定的学生提交数据
    """
    return ResponseBase(
        data={
            "tasks": [
                {
                    "submission_id": 1,
                    "task_id": 1,
                    "task_title": "测试任务",
                    "student_name": "学生甲",
                    "student_avatar": "avatar.jpg",
                    "submission_count": 1,
                    "images": ["image1.jpg", "image2.jpg"],
                    "text": "学生提交的文字内容",
                    "created_at": "2025-09-13T10:00:00",
                    "deadline": "2025-09-15T18:00:00",
                    "is_urgent": False
                }
            ],
            "has_more": False,
            "total": 1
        }
    )


@router.get("/tasks/{task_id}", response_model=ResponseBase)
async def get_task_detail(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取单个任务详情 (教师专用)
    """
    try:
        # 获取任务信息
        task_result = await db.execute(select(Task).where(Task.id == task_id))
        task = task_result.scalar_one_or_none()
        
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="任务不存在"
            )
        
        # 获取创建者信息
        creator_result = await db.execute(select(User).where(User.id == task.created_by))
        creator = creator_result.scalar_one_or_none()
        
        task_data = {
            "id": task.id,
            "title": task.title,
            "course": task.course,
            "description": task.desc,  # 映射desc到description
            "total_score": task.total_score,
            "deadline": task.deadline.isoformat() if task.deadline else None,
            "status": task.status.value,
            "task_type": task.task_type.value if task.task_type else "live",
            "created_at": task.created_at.isoformat(),
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
            "creator_name": creator.nickname if creator else "未知用户"
        }
        
        return ResponseBase(data=task_data)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task detail: {str(e)}"
        )


@router.get("/tasks/{task_id}/statistics", response_model=ResponseBase)
async def get_task_statistics(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取任务统计数据 (教师专用)
    """
    try:
        # 验证任务存在
        task_result = await db.execute(select(Task).where(Task.id == task_id))
        task = task_result.scalar_one_or_none()
        
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="任务不存在"
            )
        
        # 获取所有相关提交
        submissions_result = await db.execute(
            select(Submission).where(Submission.task_id == task_id)
        )
        submissions = submissions_result.scalars().all()
        
        # 计算统计数据
        total_submissions = len(submissions)
        submitted_count = len([s for s in submissions if s.status in [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED]])
        graded_count = len([s for s in submissions if s.status == SubmissionStatus.GRADED])
        pending_count = submitted_count - graded_count
        
        # 获取学生总数（简化版本，实际应该基于课程注册）
        total_students_result = await db.execute(
            select(func.count(User.id)).where(User.role == UserRole.STUDENT)
        )
        total_students = total_students_result.scalar() or total_submissions
        
        completion_rate = (submitted_count / total_students * 100) if total_students > 0 else 0
        
        statistics = {
            "total_students": total_students,
            "submitted_count": submitted_count,
            "graded_count": graded_count,
            "pending_count": pending_count,
            "completion_rate": round(completion_rate, 2)
        }
        
        return ResponseBase(data=statistics)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task statistics: {str(e)}"
        )


@router.get("/tasks/{task_id}/submissions", response_model=ResponseBase)
async def get_task_submissions(
    task_id: int,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    filter: Optional[str] = Query(None, description="筛选条件: submitted, graded, pending"),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取任务提交列表 (教师专用)
    """
    try:
        # 验证任务存在
        task_result = await db.execute(select(Task).where(Task.id == task_id))
        task = task_result.scalar_one_or_none()
        
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="任务不存在"
            )
        
        # 构建查询条件
        query = select(Submission).where(Submission.task_id == task_id)
        
        if filter == "submitted":
            query = query.where(Submission.status == SubmissionStatus.SUBMITTED)
        elif filter == "graded":
            query = query.where(Submission.status == SubmissionStatus.GRADED)
        elif filter == "pending":
            query = query.where(Submission.status == SubmissionStatus.SUBMITTED)
        
        # 分页查询
        offset = (page - 1) * page_size
        submissions_result = await db.execute(
            query.order_by(desc(Submission.created_at)).offset(offset).limit(page_size + 1)
        )
        submissions_list = list(submissions_result.scalars().all())
        
        # 检查是否有更多数据
        has_more = len(submissions_list) > page_size
        if has_more:
            submissions_list = submissions_list[:-1]
        
        # 格式化提交数据
        formatted_submissions = []
        for submission in submissions_list:
            # 获取学生信息
            student_result = await db.execute(select(User).where(User.id == submission.student_id))
            student = student_result.scalar_one_or_none()
            
            submission_data = {
                "id": submission.id,
                "student_id": submission.student_id,
                "submission_count": submission.submission_count,
                "status": submission.status.value,
                "score": submission.score,
                "grade": submission.grade.value if submission.grade else None,
                "feedback": submission.feedback,
                "images": submission.images or [],
                "text": submission.text,
                "submitted_at": submission.created_at.isoformat(),
                "graded_at": submission.graded_at.isoformat() if submission.graded_at else None,
                "student_info": {
                    "id": student.id if student else None,
                    "nickname": student.nickname if student else "未知用户",
                    "avatar_url": student.avatar if student else None
                },
                "teacher_evaluation": submission.feedback  # 兼容前端字段名
            }
            formatted_submissions.append(submission_data)
        
        return ResponseBase(
            data={
                "submissions": formatted_submissions,
                "has_more": has_more,
                "total": len(formatted_submissions)
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task submissions: {str(e)}"
        )


@router.get("/tasks", response_model=ResponseBase)
async def list_admin_tasks(
    status: Optional[str] = Query(None, description="任务状态筛选: ongoing, ended"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    keyword: str = Query("", description="搜索关键词"),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    List all tasks for admin/teacher with proper filtering and statistics
    """
    try:
        # Build base query - teachers can see all tasks
        base_query = select(Task).order_by(desc(Task.created_at))
        
        # Apply status filtering
        if status and status in ['ongoing', 'ended']:
            if status == 'ongoing':
                base_query = base_query.where(Task.status == TaskStatus.ONGOING)
            elif status == 'ended':
                base_query = base_query.where(Task.status == TaskStatus.ENDED)
        
        # Apply keyword search
        if keyword:
            base_query = base_query.where(Task.title.ilike(f"%{keyword}%"))
        
        # Get total count for pagination
        count_query = select(func.count(Task.id))
        if status and status in ['ongoing', 'ended']:
            if status == 'ongoing':
                count_query = count_query.where(Task.status == TaskStatus.ONGOING)
            elif status == 'ended':
                count_query = count_query.where(Task.status == TaskStatus.ENDED)
        if keyword:
            count_query = count_query.where(Task.title.ilike(f"%{keyword}%"))
        
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0
        
        # Execute paginated query
        offset = (page - 1) * page_size
        result = await db.execute(base_query.offset(offset).limit(page_size))
        tasks = result.scalars().all()
        
        # Process tasks with statistics
        task_list = []
        for task in tasks:
            # Get submission statistics for this task
            submissions_result = await db.execute(
                select(Submission).where(Submission.task_id == task.id)
            )
            submissions = submissions_result.scalars().all()
            
            # Calculate statistics
            total_submissions = len(submissions)
            submitted = len([s for s in submissions if s.status == SubmissionStatus.SUBMITTED])
            reviewed = len([s for s in submissions if s.status == SubmissionStatus.GRADED])
            
            # Get total students (simplified - using submitted count for now)
            total_students = max(total_submissions, 1)  # Avoid division by zero
            
            # Create task data
            task_data = {
                "id": task.id,
                "title": task.title,
                "course": task.course,
                "desc": task.desc,
                "total_score": task.total_score,
                "deadline": task.deadline.isoformat() if task.deadline else None,
                "status": task.status.value,  # ongoing or ended
                "task_type": task.task_type.value if task.task_type else "live",
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "updated_at": task.updated_at.isoformat() if task.updated_at else None,
                "course_date": None,  # Add if you have this field in your model
                "stats": {
                    "submitted": submitted,
                    "reviewed": reviewed, 
                    "total_students": total_students
                }
            }
            
            task_list.append(task_data)
        
        return ResponseBase(
            data={
                "tasks": task_list,
                "total": total,
                "page": page,
                "page_size": page_size
            }
        )
        
    except Exception as e:
        print(f"Admin tasks list error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get admin tasks: {str(e)}"
        )


from pydantic import BaseModel

class InputStatsRequest(BaseModel):
    textCount: int
    voiceCount: int = 0
    mixedCount: int = 0
    reportTime: Optional[int] = None

@router.post("/statistics/input-methods", response_model=ResponseBase)
async def record_input_statistics(
    request: InputStatsRequest,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Record input method statistics for grading (teacher only)
    """
    try:
        # 记录输入统计（目前简单记录到日志，后续可以存储到数据库）
        timestamp = datetime.fromtimestamp(request.reportTime / 1000) if request.reportTime else datetime.now()
        
        print(f"[INPUT_STATS] Teacher {current_user.id} - Text: {request.textCount}, Voice: {request.voiceCount}, Mixed: {request.mixedCount} at {timestamp}")
        
        # TODO: 后续可以添加数据库存储逻辑
        # input_stats = InputStatistics(
        #     user_id=current_user.id,
        #     text_count=text_count,
        #     voice_count=voice_count,
        #     mixed_count=mixed_count,
        #     recorded_at=timestamp
        # )
        # db.add(input_stats)
        # await db.commit()
        
        return ResponseBase(
            code=0,
            msg="输入统计记录成功",
            data={"recorded": True}
        )
        
    except Exception as e:
        print(f"Input statistics error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record input statistics: {str(e)}"
        )