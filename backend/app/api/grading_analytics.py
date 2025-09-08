"""
教师批改效率分析API接口
提供批改统计、效率分析、工作量预测等功能
"""

from datetime import datetime, date
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.auth import get_current_user, get_current_teacher
from app.models import User, UserRole
from app.services.grading_analytics import get_grading_analytics_service
from app.services.report_export import get_report_export_service
from app.schemas import BaseResponse


router = APIRouter(prefix="/grading-analytics", tags=["批改效率分析"])


# ================================
# 响应模型定义
# ================================

class GradingOverviewResponse(BaseModel):
    """批改效率总览响应"""
    teacher_id: int
    period_days: int
    period_start: str
    period_end: str
    basic_stats: Dict
    efficiency_stats: Dict
    quality_stats: Dict
    time_distribution: Dict
    trend_analysis: Dict
    generated_at: str


class GradeDistributionResponse(BaseModel):
    """成绩分布分析响应"""
    total_submissions: int
    period_days: int
    grade_distribution: Dict
    score_distribution: Dict
    insights: List[Dict]
    generated_at: str


class WorkloadPredictionResponse(BaseModel):
    """工作量预测响应"""
    current_pending: int
    predicted_new: int
    total_predicted: int
    recommended_daily_target: int
    historical_pattern: List[Dict]


# ================================
# API接口实现
# ================================

@router.get("/overview")
async def get_grading_overview(
    days: int = Query(default=30, ge=7, le=90, description="分析天数，默认30天"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
) -> BaseResponse[GradingOverviewResponse]:
    """
    获取教师批改效率总览
    包含批改统计、效率指标、质量分布、时间分析等
    """
    try:
        service = get_grading_analytics_service(db)
        overview_data = service.get_teacher_grading_overview(current_user.id, days)
        
        return BaseResponse(
            code=0,
            msg="获取成功",
            data=GradingOverviewResponse(**overview_data)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取批改总览失败: {str(e)}"
        )


@router.get("/grade-distribution")
async def get_grade_distribution(
    days: int = Query(default=30, ge=7, le=90, description="分析天数"),
    task_id: Optional[int] = Query(default=None, description="具体任务ID，可选"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
) -> BaseResponse[GradeDistributionResponse]:
    """
    获取学生成绩分布分析
    可按具体任务过滤分析结果
    """
    try:
        service = get_grading_analytics_service(db)
        distribution_data = service.get_student_grade_distribution(
            teacher_id=current_user.id,
            task_id=task_id,
            days=days
        )
        
        return BaseResponse(
            code=0,
            msg="获取成功", 
            data=GradeDistributionResponse(**distribution_data)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取成绩分布失败: {str(e)}"
        )


@router.get("/workload-prediction")
async def get_workload_prediction(
    days: int = Query(default=7, ge=1, le=14, description="预测天数"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
) -> BaseResponse[WorkloadPredictionResponse]:
    """
    获取批改工作量预测
    基于历史数据预测未来工作量
    """
    try:
        service = get_grading_analytics_service(db)
        prediction_data = service.predict_grading_workload(current_user.id, days)
        
        return BaseResponse(
            code=0,
            msg="获取成功",
            data=WorkloadPredictionResponse(**prediction_data)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取工作量预测失败: {str(e)}"
        )


@router.get("/efficiency-report")
async def get_efficiency_report(
    start_date: Optional[str] = Query(default=None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(default=None, description="结束日期 YYYY-MM-DD"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    生成综合效率报告
    包含指定时间段的详细分析
    """
    try:
        # 日期解析和验证
        if start_date and end_date:
            try:
                start = datetime.strptime(start_date, "%Y-%m-%d")
                end = datetime.strptime(end_date, "%Y-%m-%d")
                days = (end - start).days
                
                if days <= 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="结束日期必须晚于开始日期"
                    )
                
                if days > 365:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="分析期间不能超过365天"
                    )
                    
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="日期格式错误，请使用 YYYY-MM-DD 格式"
                )
        else:
            # 默认最近30天
            days = 30
        
        service = get_grading_analytics_service(db)
        
        # 获取综合数据
        overview = service.get_teacher_grading_overview(current_user.id, days)
        grade_distribution = service.get_student_grade_distribution(current_user.id, None, days)
        workload_prediction = service.predict_grading_workload(current_user.id, 7)
        
        # 生成效率评级和建议
        efficiency_rating = overview["efficiency_stats"]["efficiency_rating"]
        recommendations = generate_efficiency_recommendations(overview, grade_distribution)
        
        report = {
            "report_period": f"{days}天",
            "teacher_id": current_user.id,
            "teacher_name": current_user.nickname,
            "overview": overview,
            "grade_distribution": grade_distribution,
            "workload_prediction": workload_prediction,
            "efficiency_rating": efficiency_rating,
            "recommendations": recommendations,
            "generated_at": datetime.now().isoformat()
        }
        
        return BaseResponse(
            code=0,
            msg="生成报告成功",
            data=report
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"生成效率报告失败: {str(e)}"
        )


@router.get("/dashboard-summary")
async def get_dashboard_summary(
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
) -> BaseResponse[Dict]:
    """
    获取教师仪表板摘要
    为教师主页提供核心指标概览
    """
    try:
        service = get_grading_analytics_service(db)
        
        # 获取最近7天的数据（快速概览）
        overview = service.get_teacher_grading_overview(current_user.id, 7)
        
        # 提取关键指标
        summary = {
            "today_graded": overview["basic_stats"]["today_graded"],
            "week_total": overview["basic_stats"]["total_graded"],
            "pending_count": overview["basic_stats"]["pending_count"],
            "avg_response_hours": overview["efficiency_stats"]["avg_response_time_hours"],
            "efficiency_rating": overview["efficiency_stats"]["efficiency_rating"],
            "trend": overview["trend_analysis"]["trend"],
            "change_rate": overview["trend_analysis"]["change_rate"],
            
            # 简化的时间分布（只显示最活跃时段）
            "peak_hour": overview["time_distribution"]["peak_hours"][0]["hour"] if overview["time_distribution"]["peak_hours"] else "无数据",
            
            # 质量概览
            "high_quality_rate": overview["quality_stats"]["quality_metrics"]["high_quality_rate"],
            
            "last_updated": datetime.now().isoformat()
        }
        
        return BaseResponse(
            code=0,
            msg="获取成功",
            data=summary
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取仪表板摘要失败: {str(e)}"
        )


# ================================
# 辅助函数
# ================================

def generate_efficiency_recommendations(overview: Dict, grade_dist: Dict) -> List[Dict]:
    """根据分析结果生成效率改进建议"""
    recommendations = []
    
    # 响应时间建议
    avg_response = overview["efficiency_stats"]["avg_response_time_hours"]
    if avg_response > 48:
        recommendations.append({
            "type": "efficiency",
            "priority": "high",
            "title": "提高响应速度",
            "message": f"平均响应时间{avg_response:.1f}小时，建议控制在48小时内",
            "action": "设置批改时间提醒，优化批改流程"
        })
    
    # 工作时间分布建议
    time_dist = overview["time_distribution"]["period_distribution"]
    if time_dist["night"] > time_dist["morning"] + time_dist["afternoon"]:
        recommendations.append({
            "type": "time_management",
            "priority": "medium", 
            "title": "优化工作时间",
            "message": "夜间批改较多，建议调整到白天时段",
            "action": "制定合理的工作时间表，保持工作生活平衡"
        })
    
    # 质量分布建议
    high_quality_rate = overview["quality_stats"]["quality_metrics"]["high_quality_rate"]
    if high_quality_rate < 50:
        recommendations.append({
            "type": "quality",
            "priority": "high",
            "title": "关注教学质量",
            "message": f"高质量作业比例{high_quality_rate:.1f}%，可考虑调整教学策略",
            "action": "分析学生常见问题，加强针对性指导"
        })
    
    # 工作量建议
    daily_avg = overview["basic_stats"]["avg_daily_graded"]
    if daily_avg < 1:
        recommendations.append({
            "type": "productivity",
            "priority": "medium",
            "title": "保持批改节奏",
            "message": "建议保持每日批改习惯，避免积压",
            "action": "设定每日批改目标，分批处理作业"
        })
    
    return recommendations[:3]  # 最多返回3个建议


# ================================
# 报告导出接口
# ================================

@router.get("/export/efficiency-report")
async def export_efficiency_report(
    format_type: str = Query(description="导出格式: pdf 或 excel"),
    days: int = Query(default=30, ge=7, le=90, description="分析天数"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    导出批改效率分析报告
    支持PDF和Excel两种格式
    """
    if format_type not in ['pdf', 'excel']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="导出格式只支持 pdf 或 excel"
        )
    
    try:
        # 获取分析数据
        analytics_service = get_grading_analytics_service(db)
        overview_data = analytics_service.get_teacher_grading_overview(current_user.id, days)
        
        # 准备教师和任务信息
        teacher_info = {
            'id': current_user.id,
            'name': current_user.nickname or '未知教师'
        }
        
        task_info = {
            'title': f'近{days}天批改效率分析',
            'period': days
        }
        
        # 获取导出服务
        export_service = get_report_export_service()
        
        # 根据格式生成报告
        if format_type == 'pdf':
            report_buffer = await export_service.generate_grading_report_pdf(
                overview_data, teacher_info, task_info
            )
            media_type = "application/pdf"
        else:  # excel
            report_buffer = await export_service.generate_grading_report_excel(
                overview_data, teacher_info, task_info
            )
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        
        # 生成文件名
        filename = export_service.get_export_filename(
            'grading_analytics', 
            format_type, 
            task_info['title']
        )
        
        # 返回文件流
        return StreamingResponse(
            iter([report_buffer.read()]),
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"导出报告失败: {str(e)}"
        )


@router.get("/export/grade-distribution")
async def export_grade_distribution(
    format_type: str = Query(description="导出格式: pdf 或 excel"),
    days: int = Query(default=30, ge=7, le=90, description="分析天数"),
    task_id: Optional[int] = Query(default=None, description="具体任务ID"),
    current_user: User = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    """
    导出学生成绩分布报告
    """
    if format_type not in ['pdf', 'excel']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="导出格式只支持 pdf 或 excel"
        )
    
    try:
        # 获取成绩分布数据
        analytics_service = get_grading_analytics_service(db)
        distribution_data = analytics_service.get_student_grade_distribution(
            teacher_id=current_user.id,
            task_id=task_id,
            days=days
        )
        
        # 准备信息
        teacher_info = {
            'id': current_user.id,
            'name': current_user.nickname or '未知教师'
        }
        
        task_info = {
            'title': f'学生成绩分布分析{"(任务"+str(task_id)+")" if task_id else ""}',
            'period': days
        }
        
        export_service = get_report_export_service()
        
        # 转换为导出格式
        if format_type == 'excel':
            # 构造成绩数据格式
            student_grades = []
            if 'grade_distribution' in distribution_data:
                for grade_level, grade_info in distribution_data['grade_distribution'].items():
                    count = grade_info.get('count', 0)
                    # 模拟学生数据（实际应从数据库获取详细信息）
                    for i in range(count):
                        student_grades.append({
                            'student_name': f'学生{i+1}',
                            'student_id': f'S{task_id or "000"}{i+1:03d}',
                            'grade_level': grade_info.get('label', grade_level),
                            'score': grade_info.get('avg_score', 0),
                            'status': '已批改',
                            'submitted_at': datetime.now().strftime('%Y-%m-%d'),
                            'graded_at': datetime.now().strftime('%Y-%m-%d'),
                        })
            
            report_buffer = await export_service.generate_student_grade_report_excel(
                student_grades, task_info, teacher_info
            )
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:  # PDF
            report_buffer = await export_service.generate_grading_report_pdf(
                distribution_data, teacher_info, task_info
            )
            media_type = "application/pdf"
        
        # 生成文件名
        filename = export_service.get_export_filename(
            'student_grades', 
            format_type, 
            task_info['title']
        )
        
        return StreamingResponse(
            iter([report_buffer.read()]),
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"导出成绩分布失败: {str(e)}"
        )