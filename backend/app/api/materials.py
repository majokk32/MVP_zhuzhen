"""
课后加餐资料相关API接口
处理资料的创建、查看、收藏等功能
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models import (
    User, Material, MaterialCollection, MaterialView, MaterialLike,
    MaterialType, MaterialStatus, UserRole
)
from app.schemas import (
    ResponseBase, MaterialCreate, MaterialUpdate, MaterialResponse,
    MaterialListResponse, MaterialCollectionCreate, MaterialCollectionResponse,
    MaterialStatsResponse
)
from app.auth import get_current_user, get_current_teacher
from app.utils.storage import storage, StorageError
from app.config import settings

router = APIRouter(prefix="/materials")


@router.get("/list", response_model=ResponseBase[MaterialListResponse])
async def get_materials(
    page: int = Query(1, ge=1, description="页码"),
    per_page: int = Query(20, ge=1, le=100, description="每页数量"),
    category: Optional[str] = Query(None, description="分类筛选"),
    material_type: Optional[str] = Query(None, description="类型筛选"),
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    sort_by: str = Query("created_at", description="排序方式: created_at, view_count, like_count, priority"),
    sort_order: str = Query("desc", description="排序顺序: asc, desc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取资料列表
    """
    # 构建查询条件
    conditions = [
        Material.status == MaterialStatus.PUBLISHED,
        Material.is_public == True
    ]
    
    # 权限过滤：试用过期用户只能查看不需要订阅的资料
    if current_user.subscription_type.value == "expired":
        conditions.append(Material.required_subscription == False)
    
    if category:
        conditions.append(Material.category == category)
    
    if material_type:
        conditions.append(Material.material_type == material_type)
    
    if keyword:
        conditions.append(
            or_(
                Material.title.contains(keyword),
                Material.description.contains(keyword),
                Material.content.contains(keyword)
            )
        )
    
    # 排序设置
    sort_column = getattr(Material, sort_by, Material.created_at)
    if sort_order.lower() == "desc":
        sort_column = desc(sort_column)
    
    # 查询总数
    count_result = await db.execute(
        select(func.count(Material.id)).where(and_(*conditions))
    )
    total = count_result.scalar() or 0
    
    # 查询数据
    offset = (page - 1) * per_page
    result = await db.execute(
        select(Material)
        .where(and_(*conditions))
        .order_by(sort_column, desc(Material.priority))
        .limit(per_page)
        .offset(offset)
    )
    materials = result.scalars().all()
    
    # 获取用户的收藏和点赞状态
    material_ids = [m.id for m in materials]
    
    # 查询收藏状态
    collections_result = await db.execute(
        select(MaterialCollection.material_id).where(
            and_(
                MaterialCollection.user_id == current_user.id,
                MaterialCollection.material_id.in_(material_ids)
            )
        )
    )
    collected_ids = set(collections_result.scalars().all())
    
    # 查询点赞状态
    likes_result = await db.execute(
        select(MaterialLike.material_id).where(
            and_(
                MaterialLike.user_id == current_user.id,
                MaterialLike.material_id.in_(material_ids)
            )
        )
    )
    liked_ids = set(likes_result.scalars().all())
    
    # 格式化响应数据
    materials_data = []
    for material in materials:
        material_dict = {
            **material.__dict__,
            "is_collected": material.id in collected_ids,
            "is_liked": material.id in liked_ids
        }
        materials_data.append(MaterialResponse(**material_dict))
    
    return ResponseBase(
        data=MaterialListResponse(
            materials=materials_data,
            total=total,
            page=page,
            per_page=per_page,
            has_next=offset + per_page < total
        )
    )


@router.get("/{material_id}", response_model=ResponseBase[MaterialResponse])
async def get_material_detail(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取资料详情
    """
    # 查询资料
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="资料不存在"
        )
    
    # 权限检查
    if material.status != MaterialStatus.PUBLISHED:
        if current_user.role != UserRole.TEACHER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权访问该资料"
            )
    
    if not material.is_public and current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该资料"
        )
    
    # 订阅权限检查
    if (material.required_subscription and 
        current_user.subscription_type.value == "expired" and
        current_user.role != UserRole.TEACHER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要付费订阅才能查看该资料"
        )
    
    # 记录查看记录
    view_record = MaterialView(
        user_id=current_user.id,
        material_id=material.id
    )
    db.add(view_record)
    
    # 增加查看次数
    material.view_count += 1
    await db.commit()
    
    # 获取用户状态
    collection_result = await db.execute(
        select(MaterialCollection).where(
            and_(
                MaterialCollection.user_id == current_user.id,
                MaterialCollection.material_id == material.id
            )
        )
    )
    is_collected = collection_result.scalar_one_or_none() is not None
    
    like_result = await db.execute(
        select(MaterialLike).where(
            and_(
                MaterialLike.user_id == current_user.id,
                MaterialLike.material_id == material.id
            )
        )
    )
    is_liked = like_result.scalar_one_or_none() is not None
    
    # 格式化响应
    material_dict = {
        **material.__dict__,
        "is_collected": is_collected,
        "is_liked": is_liked
    }
    
    return ResponseBase(data=MaterialResponse(**material_dict))


@router.post("/create", response_model=ResponseBase[MaterialResponse])
async def create_material(
    material_data: MaterialCreate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    创建资料（教师专用）
    """
    # 创建资料
    material = Material(
        **material_data.dict(),
        created_by=current_user.id,
        status=MaterialStatus.DRAFT  # 默认为草稿状态
    )
    
    db.add(material)
    await db.commit()
    await db.refresh(material)
    
    return ResponseBase(
        data=MaterialResponse(**material.__dict__),
        msg="资料创建成功"
    )


@router.put("/{material_id}", response_model=ResponseBase[MaterialResponse])
async def update_material(
    material_id: int,
    material_data: MaterialUpdate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    更新资料（教师专用）
    """
    # 查询资料
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="资料不存在"
        )
    
    # 权限检查：只能修改自己创建的资料
    if material.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权修改该资料"
        )
    
    # 更新数据
    update_data = material_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(material, field, value)
    
    material.updated_at = datetime.utcnow()
    
    # 如果状态改为已发布，设置发布时间
    if material_data.status == MaterialStatus.PUBLISHED and not material.published_at:
        material.published_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(material)
    
    return ResponseBase(
        data=MaterialResponse(**material.__dict__),
        msg="资料更新成功"
    )


@router.delete("/{material_id}", response_model=ResponseBase)
async def delete_material(
    material_id: int,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    删除资料（教师专用）
    """
    # 查询资料
    result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="资料不存在"
        )
    
    # 权限检查
    if material.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权删除该资料"
        )
    
    # 删除资料（级联删除相关记录）
    await db.delete(material)
    await db.commit()
    
    return ResponseBase(msg="资料删除成功")


@router.post("/collect", response_model=ResponseBase)
async def collect_material(
    collection_data: MaterialCollectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    收藏资料
    """
    material_id = collection_data.material_id
    
    # 检查资料是否存在
    material_result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = material_result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="资料不存在"
        )
    
    # 检查是否已收藏
    existing_result = await db.execute(
        select(MaterialCollection).where(
            and_(
                MaterialCollection.user_id == current_user.id,
                MaterialCollection.material_id == material_id
            )
        )
    )
    existing = existing_result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="已经收藏过该资料"
        )
    
    # 创建收藏记录
    collection = MaterialCollection(
        user_id=current_user.id,
        material_id=material_id,
        notes=collection_data.notes
    )
    
    db.add(collection)
    await db.commit()
    
    return ResponseBase(msg="收藏成功")


@router.delete("/collect/{material_id}", response_model=ResponseBase)
async def uncollect_material(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    取消收藏资料
    """
    # 查找收藏记录
    result = await db.execute(
        select(MaterialCollection).where(
            and_(
                MaterialCollection.user_id == current_user.id,
                MaterialCollection.material_id == material_id
            )
        )
    )
    collection = result.scalar_one_or_none()
    
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未收藏该资料"
        )
    
    # 删除收藏记录
    await db.delete(collection)
    await db.commit()
    
    return ResponseBase(msg="取消收藏成功")


@router.get("/collections/list", response_model=ResponseBase[List[MaterialCollectionResponse]])
async def get_my_collections(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取我的收藏列表
    """
    offset = (page - 1) * per_page
    
    result = await db.execute(
        select(MaterialCollection)
        .options(selectinload(MaterialCollection.material))
        .where(MaterialCollection.user_id == current_user.id)
        .order_by(desc(MaterialCollection.collected_at))
        .limit(per_page)
        .offset(offset)
    )
    collections = result.scalars().all()
    
    # 格式化响应数据
    collections_data = []
    for collection in collections:
        collection_dict = collection.__dict__.copy()
        if collection.material:
            collection_dict["material"] = MaterialResponse(**collection.material.__dict__)
        collections_data.append(MaterialCollectionResponse(**collection_dict))
    
    return ResponseBase(data=collections_data)


@router.post("/like/{material_id}", response_model=ResponseBase)
async def like_material(
    material_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    点赞资料
    """
    # 检查资料是否存在
    material_result = await db.execute(
        select(Material).where(Material.id == material_id)
    )
    material = material_result.scalar_one_or_none()
    
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="资料不存在"
        )
    
    # 检查是否已点赞
    existing_result = await db.execute(
        select(MaterialLike).where(
            and_(
                MaterialLike.user_id == current_user.id,
                MaterialLike.material_id == material_id
            )
        )
    )
    existing = existing_result.scalar_one_or_none()
    
    if existing:
        # 如果已点赞，则取消点赞
        await db.delete(existing)
        material.like_count = max(0, material.like_count - 1)
        message = "取消点赞成功"
    else:
        # 创建点赞记录
        like = MaterialLike(
            user_id=current_user.id,
            material_id=material_id
        )
        db.add(like)
        material.like_count += 1
        message = "点赞成功"
    
    await db.commit()
    
    return ResponseBase(msg=message)


@router.get("/stats", response_model=ResponseBase[MaterialStatsResponse])
async def get_material_stats(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    获取资料统计信息（教师专用）
    """
    # 总资料数
    total_result = await db.execute(
        select(func.count(Material.id))
    )
    total_materials = total_result.scalar() or 0
    
    # 已发布资料数
    published_result = await db.execute(
        select(func.count(Material.id)).where(Material.status == MaterialStatus.PUBLISHED)
    )
    published_count = published_result.scalar() or 0
    
    # 草稿资料数
    draft_result = await db.execute(
        select(func.count(Material.id)).where(Material.status == MaterialStatus.DRAFT)
    )
    draft_count = draft_result.scalar() or 0
    
    # 总浏览数、下载数、点赞数
    stats_result = await db.execute(
        select(
            func.sum(Material.view_count),
            func.sum(Material.download_count),
            func.sum(Material.like_count)
        )
    )
    stats = stats_result.first()
    total_views = stats[0] or 0
    total_downloads = stats[1] or 0
    total_likes = stats[2] or 0
    
    # 分类统计
    category_result = await db.execute(
        select(
            Material.category,
            func.count(Material.id)
        )
        .where(Material.category.isnot(None))
        .group_by(Material.category)
        .order_by(desc(func.count(Material.id)))
    )
    categories = [
        {"name": row[0], "count": row[1]}
        for row in category_result.all()
    ]
    
    # 热门资料（按浏览量排序）
    popular_result = await db.execute(
        select(Material)
        .where(Material.status == MaterialStatus.PUBLISHED)
        .order_by(desc(Material.view_count))
        .limit(5)
    )
    popular_materials = [
        MaterialResponse(**material.__dict__)
        for material in popular_result.scalars().all()
    ]
    
    return ResponseBase(
        data=MaterialStatsResponse(
            total_materials=total_materials,
            published_count=published_count,
            draft_count=draft_count,
            total_views=total_views,
            total_downloads=total_downloads,
            total_likes=total_likes,
            categories=categories,
            popular_materials=popular_materials
        )
    )