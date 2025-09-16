# A/B测试系统实现教程

基于现有的**FastAPI + 微信小程序**架构，完整的A/B测试系统设计指南。

## 🎯 核心概念理解

### 系统架构流程
```
用户请求 → 分流服务 → 变体配置 → 业务逻辑 → 事件追踪 → 数据分析
```

### 关键概念
1. **实验(Experiment)**: 一个完整的A/B测试活动
2. **变体(Variant)**: 实验的不同版本(A组/B组)
3. **分流(Allocation)**: 用户分配到不同变体的算法
4. **指标(Metrics)**: 衡量实验效果的关键数据
5. **显著性检验**: 统计学验证实验结果的可靠性

## 📊 数据模型设计

### 核心表结构

#### 1. 实验表 (experiments)
```sql
CREATE TABLE experiments (
    id INTEGER PRIMARY KEY,
    name VARCHAR(200) NOT NULL,           -- 实验名称
    description TEXT,                     -- 实验描述
    hypothesis TEXT,                      -- 实验假设
    status VARCHAR(20) DEFAULT 'draft',   -- 实验状态
    allocation_method VARCHAR(20),        -- 分流方法
    traffic_allocation FLOAT DEFAULT 100, -- 参与流量百分比
    start_time DATETIME,                  -- 开始时间
    end_time DATETIME,                    -- 结束时间
    primary_metric VARCHAR(100),          -- 主要指标
    secondary_metrics JSON,               -- 次要指标
    targeting_rules JSON,                 -- 目标用户规则
    created_at DATETIME DEFAULT NOW()
);
```

#### 2. 实验变体表 (experiment_variants)
```sql
CREATE TABLE experiment_variants (
    id INTEGER PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id),
    name VARCHAR(100) NOT NULL,           -- 变体名称
    allocation_percentage FLOAT NOT NULL, -- 分配百分比
    config JSON,                          -- 变体配置参数
    is_control BOOLEAN DEFAULT FALSE,     -- 是否为对照组
    created_at DATETIME DEFAULT NOW()
);
```

#### 3. 用户分流记录表 (user_allocations)
```sql
CREATE TABLE user_allocations (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    experiment_id INTEGER REFERENCES experiments(id),
    variant_id INTEGER REFERENCES experiment_variants(id),
    allocation_time DATETIME DEFAULT NOW(),
    allocation_hash VARCHAR(32),          -- 分流哈希值
    user_agent VARCHAR(500)
);
```

#### 4. 实验事件追踪表 (experiment_events)
```sql
CREATE TABLE experiment_events (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    experiment_id INTEGER REFERENCES experiments(id),
    variant_id INTEGER REFERENCES experiment_variants(id),
    event_name VARCHAR(100) NOT NULL,     -- 事件名称
    event_properties JSON,                -- 事件属性
    event_value FLOAT,                    -- 事件数值
    client_timestamp DATETIME,
    server_timestamp DATETIME DEFAULT NOW()
);
```

#### 5. 实验结果汇总表 (experiment_results)
```sql
CREATE TABLE experiment_results (
    id INTEGER PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id),
    variant_id INTEGER REFERENCES experiment_variants(id),
    metric_name VARCHAR(100) NOT NULL,
    sample_size INTEGER DEFAULT 0,        -- 样本量
    conversion_count INTEGER DEFAULT 0,   -- 转化次数
    conversion_rate FLOAT DEFAULT 0.0,    -- 转化率
    p_value FLOAT,                        -- P值
    is_significant BOOLEAN DEFAULT FALSE, -- 是否显著
    calculated_at DATETIME DEFAULT NOW()
);
```

## 🚀 后端实现指南

### 1. 实验配置管理API

```python
# app/api/ab_testing.py
from fastapi import APIRouter, Depends
from app.schemas import ResponseBase

router = APIRouter(prefix="/ab-testing", tags=["A/B Testing"])

@router.post("/experiments", response_model=ResponseBase)
async def create_experiment(experiment_data: ExperimentCreate):
    """创建新实验"""
    pass

@router.get("/experiments/{experiment_id}")
async def get_experiment(experiment_id: int):
    """获取实验详情"""
    pass

@router.patch("/experiments/{experiment_id}/status")
async def update_experiment_status(experiment_id: int, status: str):
    """更新实验状态（启动/暂停/停止）"""
    pass
```

### 2. 用户分流服务

```python
# app/services/ab_testing_service.py
import hashlib
from typing import Dict, Optional

class ABTestingService:
    
    @staticmethod
    def get_user_variant(user_id: int, experiment_id: int) -> Optional[Dict]:
        """获取用户应该进入的实验变体"""
        
        # 1. 检查用户是否已经分流过
        existing_allocation = get_existing_allocation(user_id, experiment_id)
        if existing_allocation:
            return existing_allocation
        
        # 2. 检查实验是否活跃
        experiment = get_active_experiment(experiment_id)
        if not experiment:
            return None
            
        # 3. 检查用户是否符合目标规则
        if not meets_targeting_rules(user_id, experiment.targeting_rules):
            return None
        
        # 4. 基于哈希的稳定分流
        variant = allocate_user_to_variant(user_id, experiment)
        
        # 5. 记录分流结果
        save_user_allocation(user_id, experiment_id, variant.id)
        
        return variant
    
    @staticmethod
    def allocate_user_to_variant(user_id: int, experiment) -> Dict:
        """基于哈希的用户分流算法"""
        
        # 使用用户ID + 实验ID 生成稳定哈希
        hash_input = f"{user_id}_{experiment.id}_{experiment.created_at}"
        hash_value = hashlib.md5(hash_input.encode()).hexdigest()
        
        # 转换为0-100的数值
        hash_number = int(hash_value[:8], 16) % 100
        
        # 根据变体权重分配
        cumulative_percentage = 0
        for variant in experiment.variants:
            cumulative_percentage += variant.allocation_percentage
            if hash_number < cumulative_percentage:
                return variant
                
        # 默认返回对照组
        return get_control_variant(experiment)

    @staticmethod
    def track_experiment_event(user_id: int, event_name: str, 
                             event_properties: Dict = None, 
                             event_value: float = None):
        """追踪实验相关事件"""
        
        # 获取用户当前参与的所有实验
        active_experiments = get_user_active_experiments(user_id)
        
        for experiment_id, variant_id in active_experiments:
            save_experiment_event(
                user_id=user_id,
                experiment_id=experiment_id,
                variant_id=variant_id,
                event_name=event_name,
                event_properties=event_properties,
                event_value=event_value
            )
```

### 3. 前端SDK集成

```javascript
// miniprogram/utils/ab-testing.js
class ABTestingSDK {
  
  constructor() {
    this.baseUrl = getApp().globalData.baseUrl;
    this.userVariants = new Map(); // 缓存用户变体
  }
  
  /**
   * 获取实验变体配置
   * @param {string} experimentKey - 实验标识符
   * @returns {Promise<Object>} 变体配置
   */
  async getVariant(experimentKey) {
    try {
      // 1. 检查本地缓存
      if (this.userVariants.has(experimentKey)) {
        return this.userVariants.get(experimentKey);
      }
      
      // 2. 请求服务端分流
      const response = await wx.request({
        url: `${this.baseUrl}/ab-testing/variant`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`
        },
        data: {
          experiment_key: experimentKey
        }
      });
      
      if (response.data.code === 0) {
        const variant = response.data.data;
        this.userVariants.set(experimentKey, variant);
        return variant;
      }
      
      // 3. 降级处理 - 返回默认配置
      return this.getDefaultConfig(experimentKey);
      
    } catch (error) {
      console.error('A/B Testing Error:', error);
      return this.getDefaultConfig(experimentKey);
    }
  }
  
  /**
   * 追踪实验事件
   * @param {string} eventName - 事件名称
   * @param {Object} properties - 事件属性
   * @param {number} value - 事件数值
   */
  async trackEvent(eventName, properties = {}, value = null) {
    try {
      await wx.request({
        url: `${this.baseUrl}/ab-testing/track`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`
        },
        data: {
          event_name: eventName,
          event_properties: properties,
          event_value: value,
          client_timestamp: Date.now()
        }
      });
    } catch (error) {
      console.error('Event tracking failed:', error);
    }
  }
  
  /**
   * 获取默认配置（降级处理）
   */
  getDefaultConfig(experimentKey) {
    const defaultConfigs = {
      'task_card_style': { style: 'default', color: '#007AFF' },
      'grading_flow': { steps: 3, autoSave: true },
      'reminder_frequency': { interval: 24, enabled: true }
    };
    
    return defaultConfigs[experimentKey] || {};
  }
}

// 全局实例
const abTesting = new ABTestingSDK();
module.exports = abTesting;
```

## 📱 前端使用示例

### 1. 任务卡片样式实验

```javascript
// pages/index/index.js
const abTesting = require('../../utils/ab-testing');

Page({
  async onLoad() {
    // 获取任务卡片样式实验配置
    const cardVariant = await abTesting.getVariant('task_card_style');
    
    this.setData({
      cardStyle: cardVariant.style || 'default',
      cardColor: cardVariant.color || '#007AFF'
    });
    
    // 追踪页面访问事件
    abTesting.trackEvent('page_view', {
      page: 'index',
      variant: cardVariant.name
    });
  },
  
  onTaskCardClick(e) {
    const taskId = e.currentTarget.dataset.taskId;
    
    // 追踪点击事件
    abTesting.trackEvent('task_card_click', {
      task_id: taskId,
      card_style: this.data.cardStyle
    });
    
    // 跳转到任务详情
    wx.navigateTo({
      url: `/pages/task-detail/task-detail?id=${taskId}`
    });
  }
});
```

### 2. 批改流程优化实验

```javascript
// pages/grading/grading.js
const abTesting = require('../../utils/ab-testing');

Page({
  async onLoad() {
    // 获取批改流程实验配置
    const gradingVariant = await abTesting.getVariant('grading_flow');
    
    this.setData({
      stepCount: gradingVariant.steps || 3,
      autoSaveEnabled: gradingVariant.autoSave || false
    });
  },
  
  onGradeSubmit() {
    const startTime = this.data.gradingStartTime;
    const duration = Date.now() - startTime;
    
    // 追踪批改完成事件
    abTesting.trackEvent('grading_completed', {
      duration: duration,
      steps_used: this.data.stepCount,
      auto_save: this.data.autoSaveEnabled
    }, duration); // duration作为数值指标
  }
});
```

## 📊 数据分析与统计检验

### 1. 实验结果计算

```python
# app/services/ab_analysis_service.py
import scipy.stats as stats
import numpy as np

class ABAnalysisService:
    
    @staticmethod
    def calculate_experiment_results(experiment_id: int, metric_name: str):
        """计算实验结果统计数据"""
        
        variants = get_experiment_variants(experiment_id)
        results = []
        
        for variant in variants:
            # 获取变体数据
            variant_data = get_variant_metric_data(variant.id, metric_name)
            
            # 计算基础统计量
            sample_size = len(variant_data)
            if metric_name == 'conversion_rate':
                conversions = sum(1 for x in variant_data if x > 0)
                conversion_rate = conversions / sample_size if sample_size > 0 else 0
                mean_value = conversion_rate
            else:
                mean_value = np.mean(variant_data) if variant_data else 0
            
            results.append({
                'variant_id': variant.id,
                'variant_name': variant.name,
                'sample_size': sample_size,
                'mean_value': mean_value,
                'std_deviation': np.std(variant_data) if variant_data else 0
            })
        
        # 进行统计检验
        if len(results) >= 2:
            control_data = get_control_variant_data(experiment_id, metric_name)
            
            for result in results:
                if not result['variant_id'] == get_control_variant_id(experiment_id):
                    treatment_data = get_variant_metric_data(result['variant_id'], metric_name)
                    
                    # 执行t检验
                    t_stat, p_value = stats.ttest_ind(control_data, treatment_data)
                    
                    # 计算置信区间
                    ci_lower, ci_upper = calculate_confidence_interval(treatment_data)
                    
                    result.update({
                        'p_value': p_value,
                        'is_significant': p_value < 0.05,
                        'confidence_interval_lower': ci_lower,
                        'confidence_interval_upper': ci_upper
                    })
        
        return results
    
    @staticmethod
    def calculate_confidence_interval(data, confidence=0.95):
        """计算置信区间"""
        if not data:
            return 0, 0
            
        mean = np.mean(data)
        sem = stats.sem(data)  # 标准误差
        h = sem * stats.t.ppf((1 + confidence) / 2., len(data)-1)
        
        return mean - h, mean + h
```

### 2. 实验监控大盘

```python
@router.get("/experiments/{experiment_id}/dashboard")
async def get_experiment_dashboard(experiment_id: int):
    """获取实验监控大盘数据"""
    
    experiment = get_experiment(experiment_id)
    
    # 基础统计
    total_users = get_experiment_user_count(experiment_id)
    variant_distribution = get_variant_distribution(experiment_id)
    
    # 关键指标趋势
    metrics_trend = get_metrics_trend(experiment_id, days=7)
    
    # 统计检验结果
    statistical_results = ABAnalysisService.calculate_experiment_results(
        experiment_id, experiment.primary_metric
    )
    
    return ResponseBase(data={
        'experiment': experiment,
        'total_users': total_users,
        'variant_distribution': variant_distribution,
        'metrics_trend': metrics_trend,
        'statistical_results': statistical_results,
        'recommendations': generate_recommendations(statistical_results)
    })
```

## 🎯 实际应用场景

### 1. 首页任务卡片样式优化
```
实验假设：新的卡片设计能提高用户点击率
对照组：当前默认样式
实验组：新的渐变色卡片 + 大图标
关键指标：任务卡片点击率、页面停留时间
```

### 2. 批改流程简化实验
```
实验假设：简化批改步骤能提高教师批改效率
对照组：当前3步批改流程
实验组：优化为2步批改 + 智能推荐评语
关键指标：批改完成时间、批改完成率
```

### 3. 学生激励机制测试
```
实验假设：新的积分奖励机制能提高学生活跃度
对照组：当前积分规则
实验组：连续提交奖励 + 排行榜激励
关键指标：日活跃率、作业提交率
```

## ✅ 实施步骤总结

1. **数据模型设计** - 创建实验、变体、分流、事件追踪表
2. **后端API开发** - 实验配置、用户分流、事件追踪接口
3. **前端SDK集成** - 封装A/B测试获取和事件追踪功能
4. **统计分析系统** - 实现显著性检验和实验效果分析
5. **监控大盘** - 构建实时实验监控和结果展示界面

这套系统基于你现有的技术栈，可以无缝集成到当前的公考督学助手项目中，为产品优化提供数据驱动的决策支持。