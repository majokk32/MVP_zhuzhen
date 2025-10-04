"""
艾宾浩斯复盘系统API接口
基于遗忘曲线的任务复盘管理
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func
from datetime import datetime, date, timedelta
from typing import List, Optional
import pytz

from app.database import get_db
from app.models import (
    User, Submission, Task, Grade, 
    EbbinghausReviewRecord, EbbinghausMasteredTask, EbbinghausReviewStatus,
    ScoreType, CheckinType
)
from app.schemas import ResponseBase
from app.auth import get_current_user
from app.services.async_learning_data import trigger_checkin_async

router = APIRouter(prefix="/ebbinghaus", tags=["艾宾浩斯复盘系统"])

# 艾宾浩斯遗忘曲线间隔（天）
EBBINGHAUS_INTERVALS = [1, 3, 7, 15, 30]


@router.get("/submissions/excellent", response_model=ResponseBase)
async def get_excellent_submissions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取所有评分为优秀/极佳的作业提交"""
    try:
        # 查询用户的优秀作业提交
        query = select(Submission).join(Task).where(
            and_(
                Submission.student_id == current_user.id,
                Submission.grade.in_([Grade.GOOD, Grade.EXCELLENT]),
                Submission.graded_at.isnot(None)
            )
        ).order_by(desc(Submission.graded_at))
        
        result = await db.execute(query)
        submissions = result.scalars().all()
        
        # 转换为前端需要的格式
        formatted_submissions = []
        for submission in submissions:
            # 获取任务信息
            task_query = select(Task).where(Task.id == submission.task_id)
            task_result = await db.execute(task_query)
            task = task_result.scalar_one_or_none()
            
            if task:
                formatted_submissions.append({
                    "id": submission.id,
                    "task_id": submission.task_id,
                    "task_title": task.title,
                    "task_subject": task.course,
                    "grade": submission.grade,
                    "score": submission.score,
                    "submitted_at": submission.created_at.isoformat(),
                    "graded_at": submission.graded_at.isoformat() if submission.graded_at else None,
                    "user_id": submission.student_id
                })
        
        return ResponseBase(
            data=formatted_submissions,
            msg=f"获取到{len(formatted_submissions)}条优秀作业记录"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取优秀作业失败: {str(e)}"
        )


@router.get("/reviews/records", response_model=ResponseBase)
async def get_review_records(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取现有的复盘记录"""
    try:
        query = select(EbbinghausReviewRecord).where(
            EbbinghausReviewRecord.user_id == current_user.id
        ).order_by(desc(EbbinghausReviewRecord.created_at))
        
        result = await db.execute(query)
        records = result.scalars().all()
        
        formatted_records = []
        for record in records:
            formatted_records.append({
                "id": record.id,
                "submission_id": record.submission_id,
                "review_count": record.review_count,
                "scheduled_date": record.scheduled_date.isoformat(),
                "status": record.status,
                "next_review_date": record.next_review_date.isoformat() if record.next_review_date else None,
                "is_mastered": record.is_mastered,
                "ebbinghaus_interval": record.ebbinghaus_interval
            })
        
        return ResponseBase(
            data=formatted_records,
            msg=f"获取到{len(formatted_records)}条复盘记录"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取复盘记录失败: {str(e)}"
        )


@router.get("/reviews/today", response_model=ResponseBase)
async def get_today_review_tasks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取今日需要复盘的任务列表"""
    try:
        today = date.today()
        
        # 查询今日及过期的待复盘任务
        query = select(EbbinghausReviewRecord).join(Submission).join(Task).where(
            and_(
                EbbinghausReviewRecord.user_id == current_user.id,
                EbbinghausReviewRecord.scheduled_date <= today,  # 包含过期任务
                EbbinghausReviewRecord.status == EbbinghausReviewStatus.PENDING
            )
        ).order_by(EbbinghausReviewRecord.scheduled_date)
        
        result = await db.execute(query)
        review_records = result.scalars().all()
        
        # 首先处理过期任务的自动升级逻辑
        await auto_upgrade_overdue_tasks(review_records, today, db)
        
        # 重新查询更新后的记录
        updated_query = select(EbbinghausReviewRecord).join(Submission).join(Task).where(
            and_(
                EbbinghausReviewRecord.user_id == current_user.id,
                EbbinghausReviewRecord.scheduled_date <= today,
                EbbinghausReviewRecord.status == EbbinghausReviewStatus.PENDING
            )
        ).order_by(EbbinghausReviewRecord.scheduled_date)
        
        updated_result = await db.execute(updated_query)
        updated_records = updated_result.scalars().all()
        
        formatted_tasks = []
        for record in updated_records:
            # 获取提交和任务信息
            submission_query = select(Submission).where(Submission.id == record.submission_id)
            submission_result = await db.execute(submission_query)
            submission = submission_result.scalar_one_or_none()
            
            if submission:
                task_query = select(Task).where(Task.id == submission.task_id)
                task_result = await db.execute(task_query)
                task = task_result.scalar_one_or_none()
                
                if task:
                    # 判断是否过期
                    is_overdue = record.scheduled_date < today
                    overdue_days = (today - record.scheduled_date).days if is_overdue else 0
                    
                    formatted_tasks.append({
                        "id": record.submission_id,
                        "submission_id": record.submission_id,
                        "task_id": submission.task_id,
                        "title": task.title,
                        "subject": task.course,
                        "review_count": record.review_count,
                        "status": "overdue" if is_overdue else "pending",
                        "scheduled_date": record.scheduled_date.isoformat(),
                        "original_date": record.original_graded_date.isoformat(),
                        "ebbinghaus_day": record.ebbinghaus_interval,
                        "grade": submission.grade,
                        "days_overdue": overdue_days,
                        "is_today": record.scheduled_date == today
                    })
        
        return ResponseBase(
            data=formatted_tasks,
            msg=f"今日有{len(formatted_tasks)}个任务需要复盘"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取今日复盘任务失败: {str(e)}"
        )


@router.post("/reviews/records", response_model=ResponseBase)
async def create_review_record(
    record_data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建复盘记录"""
    try:
        # 检查是否已存在该提交的复盘记录
        existing_query = select(EbbinghausReviewRecord).where(
            and_(
                EbbinghausReviewRecord.submission_id == record_data["submission_id"],
                EbbinghausReviewRecord.user_id == current_user.id,
                EbbinghausReviewRecord.review_count == record_data["review_count"]
            )
        )
        existing_result = await db.execute(existing_query)
        existing_record = existing_result.scalar_one_or_none()
        
        if existing_record:
            return ResponseBase(
                data={"id": existing_record.id},
                msg="复盘记录已存在"
            )
        
        # 创建新的复盘记录
        new_record = EbbinghausReviewRecord(
            submission_id=record_data["submission_id"],
            user_id=current_user.id,
            review_count=record_data["review_count"],
            scheduled_date=datetime.fromisoformat(record_data["next_review_date"]).date(),
            original_graded_date=datetime.fromisoformat(record_data["created_at"]).date(),
            ebbinghaus_interval=EBBINGHAUS_INTERVALS[record_data["review_count"]],
            status=EbbinghausReviewStatus.PENDING
        )
        
        db.add(new_record)
        await db.commit()
        await db.refresh(new_record)
        
        return ResponseBase(
            data={"id": new_record.id},
            msg="复盘记录创建成功"
        )
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建复盘记录失败: {str(e)}"
        )


@router.put("/reviews/records/{submission_id}", response_model=ResponseBase)
async def update_review_progress(
    submission_id: int,
    update_data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新复盘进度"""
    try:
        # 查找当前的复盘记录
        query = select(EbbinghausReviewRecord).where(
            and_(
                EbbinghausReviewRecord.submission_id == submission_id,
                EbbinghausReviewRecord.user_id == current_user.id,
                EbbinghausReviewRecord.status == EbbinghausReviewStatus.PENDING
            )
        ).order_by(desc(EbbinghausReviewRecord.review_count))
        
        result = await db.execute(query)
        current_record = result.scalar_one_or_none()
        
        if not current_record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="未找到待复盘的记录"
            )
        
        # 更新当前记录状态
        current_record.status = EbbinghausReviewStatus.COMPLETED
        current_record.completed_at = datetime.utcnow()
        
        # V1.0 学习激励系统：复盘完成积分和打卡
        try:
            # 获取作业信息用于积分记录
            submission_query = select(Submission).where(Submission.id == submission_id)
            submission_result = await db.execute(submission_query)
            submission = submission_result.scalar_one_or_none()
            
            if submission:
                # 复盘完成积分 +1分
                from app.services.async_learning_data import AsyncLearningDataService
                learning_service = AsyncLearningDataService(db)
                await learning_service.add_score_record(
                    user_id=current_user.id,
                    score_type=ScoreType.REVIEW_COMPLETE,
                    score_value=1,
                    description="完成复盘操作",
                    related_task_id=submission.task_id,
                    related_submission_id=submission_id
                )
                
                # 复盘打卡（用于学习数据统计）
                await trigger_checkin_async(
                    user_id=current_user.id,
                    checkin_type=CheckinType.REVIEW_COMPLETE,
                    db=db,
                    related_task_id=submission.task_id,
                    related_submission_id=submission_id
                )
        except Exception as e:
            # 积分记录失败不影响主业务流程
            print(f"复盘积分记录失败: {e}")
        
        new_review_count = update_data["review_count"]
        is_mastered = update_data["is_mastered"]
        
        if is_mastered:
            # 标记为已掌握
            current_record.is_mastered = True
            current_record.mastered_at = datetime.utcnow()
            
            # 创建掌握记录
            await create_mastered_task_record(submission_id, current_user.id, db)
            
        else:
            # 创建下次复盘记录
            next_review_date = datetime.fromisoformat(update_data["next_review_date"]).date()
            
            next_record = EbbinghausReviewRecord(
                submission_id=submission_id,
                user_id=current_user.id,
                review_count=new_review_count,
                scheduled_date=next_review_date,
                original_graded_date=current_record.original_graded_date,
                ebbinghaus_interval=EBBINGHAUS_INTERVALS[new_review_count],
                status=EbbinghausReviewStatus.PENDING
            )
            
            db.add(next_record)
            current_record.next_review_date = next_review_date
        
        await db.commit()
        
        return ResponseBase(
            msg="复盘进度更新成功"
        )
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新复盘进度失败: {str(e)}"
        )


@router.post("/reviews/mastered", response_model=ResponseBase)
async def log_mastered_task(
    mastered_data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """记录已掌握的任务"""
    try:
        await create_mastered_task_record(
            mastered_data["submission_id"], 
            current_user.id, 
            db
        )
        
        return ResponseBase(msg="已掌握任务记录成功")
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"记录已掌握任务失败: {str(e)}"
        )


async def create_mastered_task_record(submission_id: int, user_id: int, db: AsyncSession):
    """创建已掌握任务记录"""
    # 检查是否已存在
    existing_query = select(EbbinghausMasteredTask).where(
        and_(
            EbbinghausMasteredTask.submission_id == submission_id,
            EbbinghausMasteredTask.user_id == user_id
        )
    )
    existing_result = await db.execute(existing_query)
    if existing_result.scalar_one_or_none():
        return  # 已存在，不重复创建
    
    # 获取提交和任务信息
    submission_query = select(Submission).where(Submission.id == submission_id)
    submission_result = await db.execute(submission_query)
    submission = submission_result.scalar_one()
    
    task_query = select(Task).where(Task.id == submission.task_id)
    task_result = await db.execute(task_query)
    task = task_result.scalar_one()
    
    # 计算掌握用时
    original_graded_date = submission.graded_at.date()
    mastered_date = date.today()
    total_days = (mastered_date - original_graded_date).days
    
    # 创建掌握记录
    mastered_record = EbbinghausMasteredTask(
        submission_id=submission_id,
        user_id=user_id,
        task_id=submission.task_id,
        task_title=task.title,
        task_subject=task.course,
        original_grade=submission.grade,
        original_score=submission.score,
        total_reviews_completed=5,
        original_graded_date=original_graded_date,
        mastered_date=mastered_date,
        total_days_to_master=total_days
    )
    
    db.add(mastered_record)
    await db.commit()


@router.post("/reviews/generate-daily-queue", response_model=ResponseBase)
async def generate_daily_review_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """手动生成今日复盘队列（测试用）"""
    try:
        china_tz = pytz.timezone('Asia/Shanghai')
        today = datetime.now(china_tz).date()
        
        # 获取所有优秀/极佳的提交
        submissions_query = select(Submission).join(Task).where(
            and_(
                Submission.student_id == current_user.id,
                Submission.grade.in_([Grade.GOOD, Grade.EXCELLENT]),
                Submission.graded_at.isnot(None)
            )
        )
        
        result = await db.execute(submissions_query)
        excellent_submissions = result.scalars().all()
        
        new_reviews_created = 0
        
        for submission in excellent_submissions:
            graded_date = submission.graded_at.date()
            
            # 检查每个艾宾浩斯间隔
            for review_count, interval_days in enumerate(EBBINGHAUS_INTERVALS):
                scheduled_date = graded_date + timedelta(days=interval_days)
                
                # 如果到了复盘时间
                if scheduled_date <= today:
                    # 检查是否已有该复盘记录
                    existing_query = select(EbbinghausReviewRecord).where(
                        and_(
                            EbbinghausReviewRecord.submission_id == submission.id,
                            EbbinghausReviewRecord.user_id == current_user.id,
                            EbbinghausReviewRecord.review_count == review_count
                        )
                    )
                    existing_result = await db.execute(existing_query)
                    existing_record = existing_result.scalar_one_or_none()
                    
                    # 检查是否已掌握
                    mastered_query = select(EbbinghausMasteredTask).where(
                        and_(
                            EbbinghausMasteredTask.submission_id == submission.id,
                            EbbinghausMasteredTask.user_id == current_user.id
                        )
                    )
                    mastered_result = await db.execute(mastered_query)
                    is_mastered = mastered_result.scalar_one_or_none() is not None
                    
                    if not existing_record and not is_mastered:
                        # 创建新的复盘记录
                        new_record = EbbinghausReviewRecord(
                            submission_id=submission.id,
                            user_id=current_user.id,
                            review_count=review_count,
                            scheduled_date=scheduled_date,
                            original_graded_date=graded_date,
                            ebbinghaus_interval=interval_days,
                            status=EbbinghausReviewStatus.PENDING
                        )
                        
                        db.add(new_record)
                        new_reviews_created += 1
        
        await db.commit()
        
        return ResponseBase(
            data={"new_reviews_created": new_reviews_created},
            msg=f"成功生成{new_reviews_created}个复盘任务"
        )
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"生成复盘队列失败: {str(e)}"
        )


async def auto_upgrade_overdue_tasks(review_records: List[EbbinghausReviewRecord], today: date, db: AsyncSession):
    """
    自动升级过期任务到下一个复盘级别
    如果过期时间超过了下一个复盘间隔，就自动跳到下一级
    """
    for record in review_records:
        # 计算过期天数
        overdue_days = (today - record.scheduled_date).days
        
        if overdue_days > 0 and record.review_count < len(EBBINGHAUS_INTERVALS) - 1:
            # 检查是否需要升级到下一个复盘级别
            next_review_count = record.review_count + 1
            if next_review_count < len(EBBINGHAUS_INTERVALS):
                next_interval = EBBINGHAUS_INTERVALS[next_review_count]
                
                # 如果过期天数超过了到下一级别的时间差，就自动升级
                interval_diff = next_interval - EBBINGHAUS_INTERVALS[record.review_count]
                
                if overdue_days >= interval_diff:
                    # 自动升级：将当前记录标记为已完成，创建新的高级别记录
                    record.status = EbbinghausReviewStatus.COMPLETED
                    record.completed_at = datetime.utcnow()
                    
                    # 计算新的计划日期（基于原始评分日期）
                    new_scheduled_date = record.original_graded_date + timedelta(days=next_interval)
                    
                    # 如果新计划日期还是过期的，设置为今天
                    if new_scheduled_date < today:
                        new_scheduled_date = today
                    
                    # 创建新的复盘记录
                    new_record = EbbinghausReviewRecord(
                        submission_id=record.submission_id,
                        user_id=record.user_id,
                        review_count=next_review_count,
                        scheduled_date=new_scheduled_date,
                        original_graded_date=record.original_graded_date,
                        ebbinghaus_interval=next_interval,
                        status=EbbinghausReviewStatus.PENDING
                    )
                    
                    db.add(new_record)
                    
                    # 记录升级日志
                    print(f"自动升级过期任务: 用户{record.user_id}, 提交{record.submission_id}, "
                          f"从第{record.review_count + 1}次升级到第{next_review_count + 1}次复盘")
    
    await db.commit()