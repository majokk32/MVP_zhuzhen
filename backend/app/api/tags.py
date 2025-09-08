"""
任务标签管理相关API接口
处理三级标签体系的创建、管理和统计
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.database import get_db
from app.models import (
    User, Task, TaskTag, TaskTagUsage, TagLevel, UserRole
)
from app.schemas import (
    ResponseBase, TaskTagCreate, TaskTagUpdate, TaskTagResponse,
    TaskTagHierarchyResponse, TaskTagStatsResponse
)
from app.auth import get_current_user, get_current_teacher

router = APIRouter(prefix="/tags")


@router.get("/hierarchy", response_model=ResponseBase[TaskTagHierarchyResponse])
async def get_tag_hierarchy(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取标签层级结构
    """
    # 获取所有一级标签及其子标签
    result = await db.execute(
        select(TaskTag)
        .options(selectinload(TaskTag.children))
        .where(
            and_(
                TaskTag.level == TagLevel.PRIMARY,
                TaskTag.is_active == True
            )
        )
        .order_by(TaskTag.sort_order, TaskTag.name)
    )
    primary_tags = result.scalars().all()
    
    # 格式化响应数据
    primary_tags_data = []
    for tag in primary_tags:
        tag_dict = {
            **tag.__dict__,
            "children": []
        }
        
        # 添加二级标签
        if tag.children:
            secondary_tags = [child for child in tag.children if child.level == TagLevel.SECONDARY and child.is_active]
            secondary_tags.sort(key=lambda x: (x.sort_order, x.name))
            
            for secondary in secondary_tags:
                secondary_dict = {
                    **secondary.__dict__,
                    "children": []
                }
                
                # 添加三级标签
                tertiary_tags = [child for child in secondary.children if child.level == TagLevel.TERTIARY and child.is_active]
                tertiary_tags.sort(key=lambda x: (x.sort_order, x.name))
                
                secondary_dict["children"] = [TaskTagResponse(**tertiary.__dict__) for tertiary in tertiary_tags]
                tag_dict["children"].append(TaskTagResponse(**secondary_dict))
        
        primary_tags_data.append(TaskTagResponse(**tag_dict))
    
    return ResponseBase(
        data=TaskTagHierarchyResponse(primary_tags=primary_tags_data)
    )


@router.get("/list", response_model=ResponseBase[List[TaskTagResponse]])
async def get_tags(
    level: Optional[str] = Query(None, description="标签级别筛选"),
    parent_id: Optional[int] = Query(None, description="父标签ID"),
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    include_inactive: bool = Query(False, description="是否包含禁用标签"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取标签列表
    """
    conditions = []
    
    if level:
        conditions.append(TaskTag.level == level)
    
    if parent_id is not None:
        conditions.append(TaskTag.parent_id == parent_id)
    
    if keyword:
        conditions.append(
            or_(
                TaskTag.name.contains(keyword),
                TaskTag.display_name.contains(keyword),
                TaskTag.description.contains(keyword)
            )
        )
    
    if not include_inactive:
        conditions.append(TaskTag.is_active == True)
    
    result = await db.execute(
        select(TaskTag)
        .where(and_(*conditions))
        .order_by(TaskTag.sort_order, TaskTag.name)
    )
    tags = result.scalars().all()
    
    tags_data = [TaskTagResponse(**tag.__dict__) for tag in tags]
    
    return ResponseBase(data=tags_data)


@router.post("/create", response_model=ResponseBase[TaskTagResponse])
async def create_tag(
    tag_data: TaskTagCreate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    创建标签（教师专用）
    """
    # 验证父标签
    if tag_data.parent_id:
        parent_result = await db.execute(
            select(TaskTag).where(TaskTag.id == tag_data.parent_id)
        )
        parent_tag = parent_result.scalar_one_or_none()
        
        if not parent_tag:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="父标签不存在"
            )
        
        # 验证层级关系
        if tag_data.level == TagLevel.SECONDARY and parent_tag.level != TagLevel.PRIMARY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="二级标签的父标签必须是一级标签"
            )
        elif tag_data.level == TagLevel.TERTIARY and parent_tag.level != TagLevel.SECONDARY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="三级标签的父标签必须是二级标签"
            )
    
    # 检查标签名称是否重复
    existing_result = await db.execute(
        select(TaskTag).where(
            and_(
                TaskTag.name == tag_data.name,
                TaskTag.level == tag_data.level,
                TaskTag.parent_id == tag_data.parent_id
            )
        )
    )
    existing_tag = existing_result.scalar_one_or_none()
    
    if existing_tag:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="同级别下标签名称不能重复"
        )
    
    # 创建标签
    tag = TaskTag(**tag_data.dict())
    
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    
    return ResponseBase(
        data=TaskTagResponse(**tag.__dict__),
        msg="标签创建成功"
    )


@router.put("/{tag_id}", response_model=ResponseBase[TaskTagResponse])
async def update_tag(
    tag_id: int,
    tag_data: TaskTagUpdate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    更新标签（教师专用）
    """
    # 查询标签
    result = await db.execute(
        select(TaskTag).where(TaskTag.id == tag_id)
    )
    tag = result.scalar_one_or_none()
    
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在"
        )
    
    # 检查名称重复（如果修改了名称）
    if tag_data.name and tag_data.name != tag.name:
        existing_result = await db.execute(
            select(TaskTag).where(
                and_(
                    TaskTag.name == tag_data.name,
                    TaskTag.level == tag.level,
                    TaskTag.parent_id == tag.parent_id,
                    TaskTag.id != tag_id
                )
            )
        )
        existing_tag = existing_result.scalar_one_or_none()
        
        if existing_tag:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="同级别下标签名称不能重复"
            )
    
    # 更新数据
    update_data = tag_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tag, field, value)
    
    await db.commit()
    await db.refresh(tag)
    
    return ResponseBase(
        data=TaskTagResponse(**tag.__dict__),
        msg="标签更新成功"
    )


@router.delete("/{tag_id}", response_model=ResponseBase)
async def delete_tag(
    tag_id: int,
    force: bool = Query(False, description="是否强制删除（即使有子标签或被使用）"),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    删除标签（教师专用）
    """
    # 查询标签
    result = await db.execute(
        select(TaskTag).where(TaskTag.id == tag_id)
    )
    tag = result.scalar_one_or_none()
    
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在"
        )
    
    if not force:
        # 检查是否有子标签
        children_result = await db.execute(
            select(func.count(TaskTag.id)).where(TaskTag.parent_id == tag_id)
        )
        children_count = children_result.scalar() or 0
        
        if children_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"该标签有{children_count}个子标签，无法删除。请先删除子标签或使用强制删除"
            )
        
        # 检查是否被任务使用
        usage_result = await db.execute(
            select(func.count(TaskTagUsage.id)).where(TaskTagUsage.tag_id == tag_id)
        )
        usage_count = usage_result.scalar() or 0
        
        if usage_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"该标签被{usage_count}个任务使用，无法删除。请使用强制删除"
            )
    
    # 删除标签（级联删除子标签和使用记录）
    await db.delete(tag)
    await db.commit()
    
    return ResponseBase(msg="标签删除成功")


@router.get("/stats", response_model=ResponseBase[TaskTagStatsResponse])
async def get_tag_stats(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取标签统计信息（教师专用）
    """
    # 总标签数
    total_result = await db.execute(
        select(func.count(TaskTag.id))
    )
    total_tags = total_result.scalar() or 0
    
    # 各级别标签数量
    level_stats_result = await db.execute(
        select(
            TaskTag.level,
            func.count(TaskTag.id)
        )
        .group_by(TaskTag.level)
    )
    level_stats = {level: count for level, count in level_stats_result.all()}
    
    # 最常用的标签（按使用次数排序）
    most_used_result = await db.execute(
        select(TaskTag)
        .where(TaskTag.usage_count > 0)
        .order_by(desc(TaskTag.usage_count))
        .limit(10)
    )
    most_used_tags = [
        TaskTagResponse(**tag.__dict__)
        for tag in most_used_result.scalars().all()
    ]
    
    return ResponseBase(
        data=TaskTagStatsResponse(
            total_tags=total_tags,
            primary_count=level_stats.get(TagLevel.PRIMARY, 0),
            secondary_count=level_stats.get(TagLevel.SECONDARY, 0),
            tertiary_count=level_stats.get(TagLevel.TERTIARY, 0),
            most_used_tags=most_used_tags
        )
    )


@router.post("/batch-create", response_model=ResponseBase)
async def batch_create_tags(
    tags_data: List[TaskTagCreate],
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    批量创建标签（教师专用）
    """
    created_tags = []
    errors = []
    
    for i, tag_data in enumerate(tags_data):
        try:
            # 验证父标签
            if tag_data.parent_id:
                parent_result = await db.execute(
                    select(TaskTag).where(TaskTag.id == tag_data.parent_id)
                )
                parent_tag = parent_result.scalar_one_or_none()
                
                if not parent_tag:
                    errors.append(f"第{i+1}个标签：父标签不存在")
                    continue
            
            # 检查重复
            existing_result = await db.execute(
                select(TaskTag).where(
                    and_(
                        TaskTag.name == tag_data.name,
                        TaskTag.level == tag_data.level,
                        TaskTag.parent_id == tag_data.parent_id
                    )
                )
            )
            existing_tag = existing_result.scalar_one_or_none()
            
            if existing_tag:
                errors.append(f"第{i+1}个标签：名称已存在")
                continue
            
            # 创建标签
            tag = TaskTag(**tag_data.dict())
            db.add(tag)
            created_tags.append(tag)
            
        except Exception as e:
            errors.append(f"第{i+1}个标签：{str(e)}")
    
    if created_tags:
        await db.commit()
        for tag in created_tags:
            await db.refresh(tag)
    
    result_msg = f"成功创建{len(created_tags)}个标签"
    if errors:
        result_msg += f"，{len(errors)}个失败"
    
    return ResponseBase(
        data={
            "created_count": len(created_tags),
            "error_count": len(errors),
            "errors": errors
        },
        msg=result_msg
    )