"""
报告导出服务
支持PDF和Excel格式的批改数据报告生成
"""

import io
import json
import logging
from datetime import datetime, date
from typing import Dict, List, Optional, Union, BinaryIO
from pathlib import Path

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.platypus.charts.linecharts import HorizontalLineChart
from reportlab.platypus.charts.piecharts import Pie
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.shapes import Drawing
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)


class ReportExportService:
    """报告导出服务类"""
    
    def __init__(self):
        # 尝试注册中文字体
        try:
            # 这里使用系统默认字体，实际部署时需要配置具体字体路径
            font_path = self._get_chinese_font_path()
            if font_path:
                pdfmetrics.registerFont(TTFont('SimSun', font_path))
                self.chinese_font = 'SimSun'
            else:
                self.chinese_font = 'Helvetica'  # 回退到默认字体
        except Exception as e:
            logger.warning(f"无法加载中文字体: {e}")
            self.chinese_font = 'Helvetica'
    
    def _get_chinese_font_path(self) -> Optional[str]:
        """获取中文字体路径"""
        possible_paths = [
            "C:/Windows/Fonts/simsun.ttc",  # Windows
            "C:/Windows/Fonts/msyh.ttc",    # 微软雅黑
            "/System/Library/Fonts/Arial Unicode MS.ttf",  # macOS
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"  # Linux
        ]
        
        for path in possible_paths:
            if Path(path).exists():
                return path
        return None
    
    async def generate_grading_report_pdf(
        self, 
        analytics_data: Dict, 
        teacher_info: Dict, 
        task_info: Dict
    ) -> BinaryIO:
        """生成PDF格式的批改效率报告"""
        
        buffer = io.BytesIO()
        
        try:
            # 创建PDF文档
            doc = SimpleDocTemplate(
                buffer, 
                pagesize=A4,
                leftMargin=0.75*inch,
                rightMargin=0.75*inch,
                topMargin=1*inch,
                bottomMargin=1*inch
            )
            
            # 准备样式
            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontName=self.chinese_font,
                fontSize=18,
                spaceAfter=20,
                alignment=1  # 居中
            )
            
            heading_style = ParagraphStyle(
                'CustomHeading',
                parent=styles['Heading2'],
                fontName=self.chinese_font,
                fontSize=14,
                spaceAfter=12
            )
            
            normal_style = ParagraphStyle(
                'CustomNormal',
                parent=styles['Normal'],
                fontName=self.chinese_font,
                fontSize=10,
                spaceAfter=6
            )
            
            # 构建报告内容
            story = []
            
            # 标题
            title = f"批改效率分析报告 - {task_info.get('title', '作业任务')}"
            story.append(Paragraph(title, title_style))
            story.append(Spacer(1, 20))
            
            # 基本信息
            story.append(Paragraph("📋 基本信息", heading_style))
            
            basic_info = [
                ["教师", teacher_info.get('name', '')],
                ["任务名称", task_info.get('title', '')],
                ["生成时间", datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
                ["分析期间", f"{analytics_data.get('period_days', 30)}天"],
                ["提交总数", str(analytics_data.get('basic_stats', {}).get('total_submissions', 0))],
                ["已批改", str(analytics_data.get('basic_stats', {}).get('completed_count', 0))]
            ]
            
            info_table = Table(basic_info, colWidths=[2*inch, 3*inch])
            info_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), self.chinese_font),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ]))
            
            story.append(info_table)
            story.append(Spacer(1, 20))
            
            # 效率分析
            efficiency_stats = analytics_data.get('efficiency_stats', {})
            if efficiency_stats:
                story.append(Paragraph("⚡ 效率分析", heading_style))
                
                efficiency_data = [
                    ["平均响应时间", f"{efficiency_stats.get('avg_response_time_hours', 0):.1f}小时"],
                    ["效率等级", efficiency_stats.get('efficiency_rating', '中等')],
                    ["今日批改", f"{efficiency_stats.get('today_graded', 0)}份"],
                    ["本周批改", f"{efficiency_stats.get('week_graded', 0)}份"]
                ]
                
                eff_table = Table(efficiency_data, colWidths=[2*inch, 3*inch])
                eff_table.setStyle(TableStyle([
                    ('FONTNAME', (0, 0), (-1, -1), self.chinese_font),
                    ('FONTSIZE', (0, 0), (-1, -1), 10),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black),
                    ('BACKGROUND', (0, 0), (0, -1), colors.lightblue),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ]))
                
                story.append(eff_table)
                story.append(Spacer(1, 20))
            
            # 质量统计
            quality_stats = analytics_data.get('quality_stats', {})
            if quality_stats and 'grade_distribution' in quality_stats:
                story.append(Paragraph("📊 成绩分布", heading_style))
                
                grade_dist = quality_stats['grade_distribution']
                grade_data = [["评价等级", "数量", "占比"]]
                
                for grade_info in grade_dist:
                    grade_data.append([
                        grade_info.get('label', ''),
                        str(grade_info.get('count', 0)),
                        f"{grade_info.get('percentage', 0)}%"
                    ])
                
                grade_table = Table(grade_data, colWidths=[1.5*inch, 1*inch, 1*inch])
                grade_table.setStyle(TableStyle([
                    ('FONTNAME', (0, 0), (-1, -1), self.chinese_font),
                    ('FONTSIZE', (0, 0), (-1, -1), 10),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ]))
                
                story.append(grade_table)
                story.append(Spacer(1, 20))
            
            # 趋势分析
            trend_analysis = analytics_data.get('trend_analysis', {})
            if trend_analysis:
                story.append(Paragraph("📈 趋势分析", heading_style))
                
                trend_content = f"""
                当前趋势：{trend_analysis.get('trend', '稳定')}
                变化幅度：{trend_analysis.get('change_rate', 0)}%
                周对比：{trend_analysis.get('week_comparison', '暂无数据')}
                """
                
                story.append(Paragraph(trend_content, normal_style))
                story.append(Spacer(1, 20))
            
            # 页脚信息
            story.append(Spacer(1, 40))
            footer = Paragraph(
                "本报告由公考督学助手自动生成 | 数据仅供参考", 
                ParagraphStyle(
                    'Footer',
                    parent=styles['Normal'],
                    fontName=self.chinese_font,
                    fontSize=8,
                    textColor=colors.grey,
                    alignment=1  # 居中
                )
            )
            story.append(footer)
            
            # 生成PDF
            doc.build(story)
            buffer.seek(0)
            
            return buffer
            
        except Exception as e:
            logger.error(f"生成PDF报告失败: {e}")
            # 返回错误信息的简单PDF
            error_doc = SimpleDocTemplate(buffer, pagesize=A4)
            error_story = [
                Paragraph("报告生成失败", getSampleStyleSheet()['Title']),
                Paragraph(f"错误信息: {str(e)}", getSampleStyleSheet()['Normal'])
            ]
            error_doc.build(error_story)
            buffer.seek(0)
            return buffer
    
    async def generate_grading_report_excel(
        self, 
        analytics_data: Dict, 
        teacher_info: Dict, 
        task_info: Dict
    ) -> BinaryIO:
        """生成Excel格式的批改效率报告"""
        
        buffer = io.BytesIO()
        
        try:
            with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                
                # 基本信息工作表
                basic_info = {
                    '项目': ['教师姓名', '任务名称', '生成时间', '分析期间', '提交总数', '已批改数', '完成率'],
                    '值': [
                        teacher_info.get('name', ''),
                        task_info.get('title', ''),
                        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        f"{analytics_data.get('period_days', 30)}天",
                        analytics_data.get('basic_stats', {}).get('total_submissions', 0),
                        analytics_data.get('basic_stats', {}).get('completed_count', 0),
                        f"{analytics_data.get('basic_stats', {}).get('completion_rate', 0)}%"
                    ]
                }
                
                basic_df = pd.DataFrame(basic_info)
                basic_df.to_excel(writer, sheet_name='基本信息', index=False)
                
                # 效率分析工作表
                efficiency_stats = analytics_data.get('efficiency_stats', {})
                if efficiency_stats:
                    efficiency_info = {
                        '指标': ['平均响应时间(小时)', '效率等级', '今日批改', '本周批改', '效率评分'],
                        '数值': [
                            efficiency_stats.get('avg_response_time_hours', 0),
                            efficiency_stats.get('efficiency_rating', '中等'),
                            efficiency_stats.get('today_graded', 0),
                            efficiency_stats.get('week_graded', 0),
                            efficiency_stats.get('efficiency_score', 0)
                        ]
                    }
                    
                    efficiency_df = pd.DataFrame(efficiency_info)
                    efficiency_df.to_excel(writer, sheet_name='效率分析', index=False)
                
                # 成绩分布工作表
                quality_stats = analytics_data.get('quality_stats', {})
                if quality_stats and 'grade_distribution' in quality_stats:
                    grade_dist = quality_stats['grade_distribution']
                    
                    grade_data = []
                    for grade in grade_dist:
                        grade_data.append({
                            '评价等级': grade.get('label', ''),
                            '数量': grade.get('count', 0),
                            '占比(%)': grade.get('percentage', 0),
                            '描述': grade.get('description', '')
                        })
                    
                    if grade_data:
                        grade_df = pd.DataFrame(grade_data)
                        grade_df.to_excel(writer, sheet_name='成绩分布', index=False)
                
                # 时间分布工作表
                time_dist = analytics_data.get('time_distribution', {})
                if time_dist and 'hourly_distribution' in time_dist:
                    hourly_data = []
                    for hour_info in time_dist['hourly_distribution']:
                        hourly_data.append({
                            '时段': f"{hour_info.get('hour', 0)}:00",
                            '批改数量': hour_info.get('count', 0),
                            '占比(%)': hour_info.get('percentage', 0)
                        })
                    
                    if hourly_data:
                        time_df = pd.DataFrame(hourly_data)
                        time_df.to_excel(writer, sheet_name='时间分布', index=False)
                
                # 趋势分析工作表
                trend_analysis = analytics_data.get('trend_analysis', {})
                if trend_analysis:
                    trend_info = {
                        '指标': ['当前趋势', '变化幅度(%)', '周对比', '月对比'],
                        '值': [
                            trend_analysis.get('trend', '稳定'),
                            trend_analysis.get('change_rate', 0),
                            trend_analysis.get('week_comparison', '暂无'),
                            trend_analysis.get('month_comparison', '暂无')
                        ]
                    }
                    
                    trend_df = pd.DataFrame(trend_info)
                    trend_df.to_excel(writer, sheet_name='趋势分析', index=False)
                
                # 质量指标工作表（如果有详细数据）
                if 'quality_metrics' in analytics_data:
                    quality_metrics = analytics_data['quality_metrics']
                    
                    metrics_info = {
                        '质量指标': [
                            '优秀率(%)', 
                            '及格率(%)', 
                            '平均分', 
                            '标准差', 
                            '最高分', 
                            '最低分'
                        ],
                        '数值': [
                            quality_metrics.get('excellent_rate', 0),
                            quality_metrics.get('pass_rate', 0),
                            quality_metrics.get('avg_score', 0),
                            quality_metrics.get('std_deviation', 0),
                            quality_metrics.get('max_score', 0),
                            quality_metrics.get('min_score', 0)
                        ]
                    }
                    
                    metrics_df = pd.DataFrame(metrics_info)
                    metrics_df.to_excel(writer, sheet_name='质量指标', index=False)
            
            buffer.seek(0)
            return buffer
            
        except Exception as e:
            logger.error(f"生成Excel报告失败: {e}")
            # 创建简单的错误信息Excel
            error_df = pd.DataFrame({
                '错误信息': [f'报告生成失败: {str(e)}'],
                '时间': [datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
            })
            
            with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                error_df.to_excel(writer, sheet_name='错误信息', index=False)
            
            buffer.seek(0)
            return buffer
    
    async def generate_student_grade_report_excel(
        self,
        student_grades: List[Dict],
        task_info: Dict,
        teacher_info: Dict
    ) -> BinaryIO:
        """生成学生成绩单Excel报告"""
        
        buffer = io.BytesIO()
        
        try:
            # 准备学生成绩数据
            grade_data = []
            for grade in student_grades:
                grade_data.append({
                    '学生姓名': grade.get('student_name', ''),
                    '学号': grade.get('student_id', ''),
                    '提交时间': grade.get('submitted_at', ''),
                    '批改时间': grade.get('graded_at', ''),
                    '评价等级': grade.get('grade_level', ''),
                    '分数': grade.get('score', ''),
                    '批改用时(分钟)': grade.get('grading_time_minutes', ''),
                    '评语': grade.get('comment', ''),
                    '状态': grade.get('status', '')
                })
            
            with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                
                # 成绩明细表
                if grade_data:
                    grades_df = pd.DataFrame(grade_data)
                    grades_df.to_excel(writer, sheet_name='成绩明细', index=False)
                
                # 统计汇总表
                if grade_data:
                    grades_df = pd.DataFrame(grade_data)
                    
                    # 计算统计数据
                    total_students = len(grades_df)
                    excellent_count = len(grades_df[grades_df['评价等级'] == '极佳'])
                    good_count = len(grades_df[grades_df['评价等级'] == '优秀'])
                    review_count = len(grades_df[grades_df['评价等级'] == '待复盘'])
                    
                    summary_data = {
                        '统计项目': [
                            '总学生数', 
                            '极佳数量', 
                            '优秀数量', 
                            '待复盘数量',
                            '极佳率(%)',
                            '优秀率(%)',
                            '待复盘率(%)'
                        ],
                        '数值': [
                            total_students,
                            excellent_count,
                            good_count,
                            review_count,
                            round((excellent_count / total_students) * 100, 1) if total_students > 0 else 0,
                            round((good_count / total_students) * 100, 1) if total_students > 0 else 0,
                            round((review_count / total_students) * 100, 1) if total_students > 0 else 0
                        ]
                    }
                    
                    summary_df = pd.DataFrame(summary_data)
                    summary_df.to_excel(writer, sheet_name='统计汇总', index=False)
                
                # 任务信息表
                task_data = {
                    '项目': ['任务名称', '教师', '生成时间', '学生总数'],
                    '信息': [
                        task_info.get('title', ''),
                        teacher_info.get('name', ''),
                        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        len(grade_data)
                    ]
                }
                
                task_df = pd.DataFrame(task_data)
                task_df.to_excel(writer, sheet_name='任务信息', index=False)
            
            buffer.seek(0)
            return buffer
            
        except Exception as e:
            logger.error(f"生成学生成绩报告失败: {e}")
            
            # 错误处理
            error_df = pd.DataFrame({
                '错误': [f'生成失败: {str(e)}'],
                '时间': [datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
            })
            
            with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                error_df.to_excel(writer, sheet_name='错误', index=False)
            
            buffer.seek(0)
            return buffer
    
    def get_export_filename(
        self, 
        report_type: str, 
        format_type: str,
        task_title: str = None
    ) -> str:
        """生成导出文件名"""
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        if report_type == 'grading_analytics':
            base_name = '批改效率分析报告'
        elif report_type == 'student_grades':
            base_name = '学生成绩单'
        else:
            base_name = '分析报告'
        
        if task_title:
            # 清理任务标题中的特殊字符
            clean_title = ''.join(c for c in task_title if c.isalnum() or c in (' ', '-', '_'))
            if len(clean_title) > 20:
                clean_title = clean_title[:20]
            base_name = f"{base_name}_{clean_title}"
        
        extension = 'pdf' if format_type == 'pdf' else 'xlsx'
        
        return f"{base_name}_{timestamp}.{extension}"


# 全局导出服务实例
_export_service = None


def get_report_export_service() -> ReportExportService:
    """获取报告导出服务实例"""
    global _export_service
    if _export_service is None:
        _export_service = ReportExportService()
    return _export_service