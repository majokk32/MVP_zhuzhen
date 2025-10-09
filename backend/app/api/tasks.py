"""
Task management API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi import status as http_status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_, func, case
from typing import Optional, List, Dict
from datetime import datetime
import zipfile
import io
import os
import requests
from urllib.parse import urlparse

from app.database import get_db
from app.models import Task, TaskStatus, TaskType, User, Submission, SubmissionStatus, CheckinType
from app.utils.task_status import calculate_display_status, get_task_priority
from app.services.async_learning_data import trigger_checkin_async
from app.schemas import (
    ResponseBase, TaskCreate, TaskUpdate, TaskInfo, 
    TaskListResponse, TaskCreateWithTags, TaskUpdateWithTags, TaskInfoWithTags
)
from app.auth import get_current_user, get_current_teacher, get_current_premium_user, security

router = APIRouter(prefix="/tasks")


@router.post("/", response_model=ResponseBase)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new task (teacher only)
    """
    # Create new task
    new_task = Task(
        title=task_data.title,
        course=task_data.course,
        desc=task_data.desc,
        total_score=task_data.total_score,
        deadline=task_data.deadline,
        live_start_time=task_data.live_start_time,
        status=TaskStatus(task_data.status) if task_data.status else TaskStatus.ONGOING,
        task_type=task_data.task_type if task_data.task_type else TaskType.LIVE,
        created_by=current_user.id
    )
    
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    
    return ResponseBase(
        data={"id": new_task.id},
        msg="任务创建成功"
    )


@router.get("/", response_model=ResponseBase)
async def list_tasks(
    status: Optional[str] = Query(None, description="任务状态筛选: ongoing, ended"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    keyword: str = Query("", description="搜索关键词"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all tasks with submission status for current user
    Fixed: status parameter conflict, proper count query, optimized N+1
    """
    try:
        # 1) Build unified filters - consider deadline-based status
        filters = []
        # Use Chinese time (UTC+8) as standard time for the app
        from datetime import timezone, timedelta
        china_tz = timezone(timedelta(hours=8))
        now_china = datetime.now(china_tz)
        # Convert to naive datetime for comparison with database
        now = now_china.replace(tzinfo=None)
        
        if status in ("ongoing", "ended"):
            if status == "ongoing":
                # Ongoing: status is ONGOING and deadline not passed (or no deadline)
                filters.append(
                    and_(
                        Task.status == TaskStatus.ONGOING,
                        case(
                            (Task.deadline.is_(None), True),  # No deadline = ongoing
                            else_=Task.deadline > now  # Has deadline and not passed
                        )
                    )
                )
            else:  # ended
                # Ended: status is ENDED or (status is ONGOING but deadline passed)
                filters.append(
                    case(
                        (Task.status == TaskStatus.ENDED, True),
                        (
                            and_(
                                Task.status == TaskStatus.ONGOING,
                                Task.deadline.is_not(None),
                                Task.deadline <= now
                            ), 
                            True
                        ),
                        else_=False
                    )
                )
        
        if keyword:
            filters.append(Task.title.ilike(f"%{keyword}%"))
        
        # 2) Get all tasks first, then filter in memory for deadline-based status
        # This is necessary because SQL case expressions in WHERE clauses are complex
        all_tasks_query = select(Task)
        if keyword:
            all_tasks_query = all_tasks_query.where(Task.title.ilike(f"%{keyword}%"))
        
        # Filter out draft tasks for students (only teachers can see drafts)
        if current_user.role.value != 'teacher':
            all_tasks_query = all_tasks_query.where(Task.status != TaskStatus.DRAFT)
            
        all_tasks_query = all_tasks_query.order_by(desc(Task.created_at))
        
        all_tasks_result = await db.execute(all_tasks_query)
        all_tasks = all_tasks_result.scalars().all()
        
        # Filter tasks based on deadline-aware status
        filtered_tasks = []
        print(f"[DEBUG] Filtering by status: {status}, Chinese time: {now_china}, naive time: {now}")
        
        if status == "ongoing":
            for task in all_tasks:
                is_ongoing = task.status == TaskStatus.ONGOING and (task.deadline is None or task.deadline > now)
                print(f"[DEBUG] Task {task.id} ({task.title}): status={task.status}, deadline={task.deadline}, is_ongoing={is_ongoing}")
                if is_ongoing:
                    filtered_tasks.append(task)
        elif status == "ended":
            for task in all_tasks:
                is_ended = (task.status == TaskStatus.ENDED or 
                          (task.status == TaskStatus.ONGOING and task.deadline and task.deadline <= now))
                print(f"[DEBUG] Task {task.id} ({task.title}): status={task.status}, deadline={task.deadline}, is_ended={is_ended}")
                if is_ended:
                    filtered_tasks.append(task)
        else:
            filtered_tasks = all_tasks
            
        print(f"[DEBUG] Filtered {len(filtered_tasks)} tasks from {len(all_tasks)} total tasks")
        
        # Apply pagination to filtered results
        total = len(filtered_tasks)
        offset = (page - 1) * page_size
        tasks = filtered_tasks[offset:offset + page_size]
    
        # 5) Get submissions in batch to avoid N+1
        submissions_by_task: Dict[int, object] = {}
        if tasks:
            task_ids = [t.id for t in tasks]
            sub_result = await db.execute(
                select(Submission).where(
                    and_(
                        Submission.task_id.in_(task_ids),
                        Submission.student_id == current_user.id
                    )
                )
            )
            for sub in sub_result.scalars():
                submissions_by_task[sub.task_id] = sub
        
        # 6) Process tasks
        task_list = []
        for task in tasks:
            task_info = TaskInfo.from_orm(task)
            submission = submissions_by_task.get(task.id)
            
            if submission:
                task_info.submission_status = submission.status.value
                task_info.submission_grade = submission.grade.value if submission.grade else None
                task_info.submission_score = submission.score
            else:
                task_info.submission_status = "未提交"
            
            # 使用新的状态计算工具
            display_status = calculate_display_status(task, submission)
            
            # 将状态信息添加到任务信息中
            task_data = task_info.dict()
            task_data.update({
                "display_right_status": display_status["right_status"],
                "display_left_status": display_status["left_status"],
                "display_card_style": display_status["card_style"],
                "sort_priority": get_task_priority(task, submission)
            })
            
            task_list.append(task_data)
    
        # 根据优先级和创建时间排序
        task_list.sort(key=lambda x: (x["sort_priority"], -x.get("created_at", 0) if isinstance(x.get("created_at"), (int, float)) else 0))
        
        return ResponseBase(
            data={
                "tasks": task_list,
                "total": total,
                "page": page,
                "page_size": page_size
            }
        )
    except Exception as e:
        print(f"Tasks list error: {e}")
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get tasks: {str(e)}"
        )


@router.get("/{task_id}", response_model=ResponseBase)
async def get_task(
    task_id: int,
    current_user: User = Depends(get_current_premium_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get task details
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Students cannot access draft tasks (only teachers and task creators can)
    if task.status == TaskStatus.DRAFT and current_user.role.value != 'teacher' and task.created_by != current_user.id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    task_info = TaskInfo.from_orm(task)
    
    # Get submission status for current user
    sub_result = await db.execute(
        select(Submission).where(
            and_(
                Submission.task_id == task_id,
                Submission.student_id == current_user.id
            )
        ).order_by(Submission.created_at.desc())
    )
    submission = sub_result.scalars().first()
    
    if submission:
        task_info.submission_status = submission.status.value
        task_info.submission_grade = submission.grade.value if submission.grade else None
        task_info.submission_score = submission.score
    else:
        task_info.submission_status = "未提交"
    
    # V1.0 学习数据统计：记录任务查看打卡
    try:
        await trigger_checkin_async(
            user_id=current_user.id,
            checkin_type=CheckinType.TASK_VIEW,
            db=db,
            related_task_id=task_id
        )
    except Exception as e:
        # 学习数据记录失败不应影响主业务流程
        print(f"任务查看打卡记录失败: {e}")
    
    return ResponseBase(data=task_info.dict())


@router.put("/{task_id}", response_model=ResponseBase)
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Update task (teacher only)
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Check ownership
    if task.created_by != current_user.id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="只能修改自己创建的任务"
        )
    
    # Update fields
    update_data = task_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    
    await db.commit()
    await db.refresh(task)
    
    return ResponseBase(msg="任务更新成功")


@router.delete("/{task_id}", response_model=ResponseBase)
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete task (teacher only)
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Check ownership
    if task.created_by != current_user.id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="只能删除自己创建的任务"
        )
    
    # Check if there are submissions
    sub_result = await db.execute(
        select(Submission).where(Submission.task_id == task_id)
    )
    if sub_result.scalar_one_or_none():
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="已有学生提交作业，无法删除任务"
        )
    
    await db.delete(task)
    await db.commit()
    
    return ResponseBase(msg="任务删除成功")


@router.post("/{task_id}/toggle-status", response_model=ResponseBase)
async def toggle_task_status(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Toggle task status between ongoing and ended (teacher only)
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Toggle status
    task.status = TaskStatus.ENDED if task.status == TaskStatus.ONGOING else TaskStatus.ONGOING
    await db.commit()
    
    return ResponseBase(
        data={"new_status": task.status.value},
        msg=f"任务状态已更新为: {task.status.value}"
    )


@router.post("/{task_id}/share", response_model=ResponseBase)
async def generate_share_link(
    task_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate share link for task (teacher only)
    生成任务分享链接，支持微信分享和深链接
    """
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # Generate share data
    share_data = {
        "path": f"/pages/task-detail/task-detail?id={task_id}&share=1",
        "title": task.title,
        "imageUrl": "/assets/images/share-default.png",  # 默认分享图
        "task_id": task_id,
        "share_code": f"TASK{task_id}",  # 分享码，用于统计
    }
    
    return ResponseBase(
        data=share_data,
        msg="分享链接生成成功"
    )
# 在现有tasks.py末尾添加增强版任务概况API
@router.get("/summary", response_model=ResponseBase) 
async def get_task_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get task summary for current user
    获取用户任务概况统计
    """
    from sqlalchemy import func
    
    # Get all tasks
    tasks_result = await db.execute(select(Task))
    all_tasks = tasks_result.scalars().all()
    
    # Get user submissions
    submissions_result = await db.execute(
        select(Submission).where(Submission.student_id == current_user.id)
    )
    submissions = submissions_result.scalars().all()
    
    # Create submission lookup
    submission_by_task = {s.task_id: s for s in submissions}
    
    # Calculate statistics
    stats = {
        "total_tasks": len(all_tasks),
        "submitted": 0,
        "graded": 0,
        "pending_submission": 0,
        "pending_grading": 0,
        "average_score": 0,
        "grade_distribution": {"review": 0, "good": 0, "excellent": 0}
    }
    
    graded_scores = []
    
    for task in all_tasks:
        submission = submission_by_task.get(task.id)
        
        if not submission:
            stats["pending_submission"] += 1
        elif submission.status == SubmissionStatus.SUBMITTED:
            stats["submitted"] += 1
            stats["pending_grading"] += 1
        else:  # GRADED
            stats["graded"] += 1
            if submission.score:
                graded_scores.append(submission.score)
            if submission.grade:
                stats["grade_distribution"][submission.grade.value] = \
                    stats["grade_distribution"].get(submission.grade.value, 0) + 1
    
    # Calculate average score
    if graded_scores:
        stats["average_score"] = round(sum(graded_scores) / len(graded_scores), 1)
    
    return ResponseBase(
        data=stats,
        msg="获取任务统计成功"
    )


async def get_current_user_from_token_or_header(
    token: Optional[str] = Query(None, description="URL token for browser downloads"),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current user from URL token or Authorization header"""
    from app.auth import verify_token
    from fastapi import Request
    
    # 优先使用URL中的token
    auth_token = token
    
    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authentication token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 验证token
    payload = verify_token(auth_token)
    user_id = payload.get("sub")
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 获取用户信息
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


@router.get("/{task_id}/download-latest-submissions")
async def download_latest_submissions(
    task_id: int,
    token: Optional[str] = Query(None, description="URL token for browser downloads"),
    current_user: User = Depends(get_current_user_from_token_or_header),
    db: AsyncSession = Depends(get_db)
):
    """
    下载指定任务下所有学生的最新提交图片（打包成zip文件）
    仅老师可用，对于每个学生只下载最新的提交
    """
    # 检查用户权限
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="仅限老师访问")
    # 验证task是否存在
    task_result = await db.execute(select(Task).where(Task.id == task_id))
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 查询每个学生的最新提交
    # 使用子查询找到每个学生的最大created_at，然后匹配对应的submission
    latest_submissions_subquery = select(
        Submission.student_id,
        func.max(Submission.created_at).label('latest_created_at')
    ).where(Submission.task_id == task_id).group_by(Submission.student_id).subquery()
    
    latest_submissions_query = select(Submission).join(
        latest_submissions_subquery,
        and_(
            Submission.student_id == latest_submissions_subquery.c.student_id,
            Submission.created_at == latest_submissions_subquery.c.latest_created_at,
            Submission.task_id == task_id
        )
    ).order_by(Submission.student_id)
    
    submissions_result = await db.execute(latest_submissions_query)
    submissions = submissions_result.scalars().all()
    
    if not submissions:
        raise HTTPException(status_code=404, detail="该任务下没有任何提交")
    
    # 创建ZIP文件内容
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for submission in submissions:
            # 获取学生信息
            student_result = await db.execute(select(User).where(User.id == submission.student_id))
            student = student_result.scalar_one_or_none()
            student_name = student.nickname if student else f"用户{submission.student_id}"
            
            # 创建学生文件夹
            folder_name = f"{student_name}_{submission.student_id}"
            
            # 处理图片列表
            images = submission.images if submission.images else []
            
            for i, image_url in enumerate(images):
                try:
                    # 处理相对路径URL
                    if image_url.startswith('/'):
                        # 相对路径，转换为本地文件路径
                        local_file_path = f".{image_url}"
                        if os.path.exists(local_file_path):
                            with open(local_file_path, 'rb') as f:
                                image_content = f.read()
                        else:
                            raise FileNotFoundError(f"Local file not found: {local_file_path}")
                    else:
                        # 绝对URL，通过HTTP下载
                        response = requests.get(image_url, timeout=30)
                        response.raise_for_status()
                        image_content = response.content
                    
                    # 获取文件扩展名
                    parsed_url = urlparse(image_url)
                    path = parsed_url.path
                    file_ext = os.path.splitext(path)[1] or '.jpg'
                    
                    # 生成文件名
                    filename = f"image_{i+1}{file_ext}"
                    full_path = f"{folder_name}/{filename}"
                    
                    # 添加到ZIP
                    zip_file.writestr(full_path, image_content)
                    
                except Exception as e:
                    # 如果某张图片下载失败，创建错误文件说明
                    error_msg = f"图片下载失败: {str(e)}\n原始URL: {image_url}"
                    error_filename = f"{folder_name}/error_image_{i+1}.txt"
                    zip_file.writestr(error_filename, error_msg)
    
    zip_buffer.seek(0)
    
    # 生成文件名（使用ASCII安全字符）
    safe_task_title = "".join(c for c in task.title if c.isalnum() or c in (' ', '-', '_')).rstrip()
    if not safe_task_title:
        safe_task_title = f"Task_{task.id}"
    
    filename = f"{safe_task_title}_submissions_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    
    # 确保文件名是ASCII编码安全的
    safe_filename = filename.encode('ascii', 'ignore').decode('ascii')
    
    return StreamingResponse(
        io.BytesIO(zip_buffer.read()),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={safe_filename}"}
    )

