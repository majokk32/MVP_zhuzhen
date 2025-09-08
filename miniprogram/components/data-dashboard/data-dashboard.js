// components/data-dashboard/data-dashboard.js
/**
 * 数据看板组件
 * 提供丰富的数据可视化和统计展示
 */
Component({
  properties: {
    // 看板数据
    dashboardData: {
      type: Object,
      value: {}
    },
    
    // 看板类型：admin（管理员）| teacher（教师）| student（学生）
    dashboardType: {
      type: String,
      value: 'admin'
    },
    
    // 时间范围
    timeRange: {
      type: String,
      value: '7d' // 7d, 30d, 3m, 1y
    },
    
    // 是否显示图表
    showCharts: {
      type: Boolean,
      value: true
    },
    
    // 是否显示趋势
    showTrends: {
      type: Boolean,
      value: true
    },
    
    // 自定义配置
    config: {
      type: Object,
      value: {}
    }
  },

  data: {
    // 加载状态
    loading: false,
    
    // 统计卡片数据
    statsCards: [],
    
    // 图表数据
    chartData: {
      submissions: [], // 提交趋势
      grades: [],      // 批改趋势
      users: [],       // 用户活跃度
      performance: []  // 性能数据
    },
    
    // 时间范围选项
    timeRangeOptions: [
      { value: '7d', label: '最近7天' },
      { value: '30d', label: '最近30天' },
      { value: '3m', label: '最近3个月' },
      { value: '1y', label: '最近1年' }
    ],
    
    // 快捷操作
    quickActions: [],
    
    // 实时数据
    realTimeStats: {
      onlineUsers: 0,
      currentSubmissions: 0,
      systemHealth: 100
    }
  },

  observers: {
    'dashboardData': function(newData) {
      this.processDashboardData(newData);
    },
    
    'dashboardType': function(newType) {
      this.setupDashboardConfig(newType);
    }
  },

  lifetimes: {
    attached() {
      this.initDashboard();
      this.startRealTimeUpdates();
    },
    
    detached() {
      this.stopRealTimeUpdates();
    }
  },

  methods: {
    /**
     * 初始化看板
     */
    initDashboard() {
      this.setupDashboardConfig(this.properties.dashboardType);
      this.processDashboardData(this.properties.dashboardData);
    },

    /**
     * 设置看板配置
     */
    setupDashboardConfig(type) {
      const configs = {
        admin: {
          title: '管理员看板',
          primaryColor: '#1989fa',
          cards: [
            { key: 'totalUsers', label: '总用户数', icon: '👥', color: '#1989fa' },
            { key: 'totalTasks', label: '总任务数', icon: '📋', color: '#52c41a' },
            { key: 'pendingGrading', label: '待批改', icon: '📝', color: '#faad14' },
            { key: 'systemHealth', label: '系统健康度', icon: '💚', color: '#13c2c2', suffix: '%' }
          ],
          charts: ['submissions', 'users', 'performance'],
          actions: [
            { key: 'createTask', label: '创建任务', icon: '➕' },
            { key: 'viewReports', label: '查看报表', icon: '📊' },
            { key: 'systemSettings', label: '系统设置', icon: '⚙️' }
          ]
        },
        
        teacher: {
          title: '教师看板',
          primaryColor: '#52c41a',
          cards: [
            { key: 'myTasks', label: '我的任务', icon: '📚', color: '#52c41a' },
            { key: 'myStudents', label: '我的学生', icon: '🎓', color: '#1989fa' },
            { key: 'pendingGrading', label: '待批改', icon: '📝', color: '#faad14' },
            { key: 'avgScore', label: '平均分', icon: '⭐', color: '#722ed1', suffix: '分' }
          ],
          charts: ['submissions', 'grades'],
          actions: [
            { key: 'createTask', label: '创建任务', icon: '➕' },
            { key: 'gradeSubmissions', label: '开始批改', icon: '✏️' },
            { key: 'exportData', label: '导出数据', icon: '📤' }
          ]
        },
        
        student: {
          title: '学习概览',
          primaryColor: '#722ed1',
          cards: [
            { key: 'completedTasks', label: '已完成', icon: '✅', color: '#52c41a' },
            { key: 'avgScore', label: '平均分', icon: '📊', color: '#1989fa', suffix: '分' },
            { key: 'studyStreak', label: '连续学习', icon: '🔥', color: '#fa541c', suffix: '天' },
            { key: 'rank', label: '班级排名', icon: '🏆', color: '#faad14', prefix: '第', suffix: '名' }
          ],
          charts: ['performance'],
          actions: [
            { key: 'startStudy', label: '开始学习', icon: '📖' },
            { key: 'viewProgress', label: '学习进度', icon: '📈' },
            { key: 'joinGroup', label: '加入学习群', icon: '👥' }
          ]
        }
      };
      
      const config = configs[type] || configs.admin;
      this.setData({
        dashboardConfig: config,
        statsCards: config.cards,
        quickActions: config.actions
      });
    },

    /**
     * 处理看板数据
     */
    processDashboardData(data) {
      if (!data || typeof data !== 'object') return;
      
      // 处理统计卡片数据
      this.processStatsCards(data);
      
      // 处理图表数据
      if (this.properties.showCharts) {
        this.processChartData(data);
      }
      
      // 处理趋势数据
      if (this.properties.showTrends) {
        this.processTrendData(data);
      }
    },

    /**
     * 处理统计卡片数据
     */
    processStatsCards(data) {
      const updatedCards = this.data.statsCards.map(card => {
        const value = data[card.key] || 0;
        const previousValue = data[`${card.key}_previous`] || 0;
        
        // 计算变化率
        let changeRate = 0;
        let changeDirection = 'stable';
        
        if (previousValue > 0) {
          changeRate = ((value - previousValue) / previousValue * 100).toFixed(1);
          changeDirection = changeRate > 0 ? 'up' : changeRate < 0 ? 'down' : 'stable';
        }
        
        return {
          ...card,
          value: this.formatValue(value, card),
          rawValue: value,
          changeRate: Math.abs(changeRate),
          changeDirection,
          trend: data[`${card.key}_trend`] || []
        };
      });
      
      this.setData({ statsCards: updatedCards });
    },

    /**
     * 格式化数值
     */
    formatValue(value, card) {
      let formatted = value;
      
      // 大数值格式化
      if (value >= 1000000) {
        formatted = (value / 1000000).toFixed(1) + 'M';
      } else if (value >= 1000) {
        formatted = (value / 1000).toFixed(1) + 'K';
      }
      
      // 添加前缀和后缀
      if (card.prefix) formatted = card.prefix + formatted;
      if (card.suffix) formatted = formatted + card.suffix;
      
      return formatted;
    },

    /**
     * 处理图表数据
     */
    processChartData(data) {
      const chartData = {
        submissions: data.submissionsTrend || [],
        grades: data.gradesTrend || [],
        users: data.usersTrend || [],
        performance: data.performanceTrend || []
      };
      
      this.setData({ chartData });
    },

    /**
     * 处理趋势数据
     */
    processTrendData(data) {
      // 这里可以添加更复杂的趋势分析逻辑
      console.log('处理趋势数据:', data.trends);
    },

    /**
     * 切换时间范围
     */
    onTimeRangeChange(e) {
      const timeRange = e.detail.value;
      this.setData({ loading: true });
      
      // 触发时间范围变更事件
      this.triggerEvent('timeRangeChange', { timeRange });
      
      setTimeout(() => {
        this.setData({ loading: false });
      }, 1000);
    },

    /**
     * 快捷操作点击
     */
    onQuickActionClick(e) {
      const { action } = e.currentTarget.dataset;
      this.triggerEvent('quickAction', { action });
    },

    /**
     * 统计卡片点击
     */
    onStatsCardClick(e) {
      const { card } = e.currentTarget.dataset;
      this.triggerEvent('statsCardClick', { card });
    },

    /**
     * 开始实时更新
     */
    startRealTimeUpdates() {
      // 每30秒更新一次实时数据
      this.realTimeTimer = setInterval(() => {
        this.updateRealTimeStats();
      }, 30000);
    },

    /**
     * 停止实时更新
     */
    stopRealTimeUpdates() {
      if (this.realTimeTimer) {
        clearInterval(this.realTimeTimer);
        this.realTimeTimer = null;
      }
    },

    /**
     * 更新实时统计
     */
    updateRealTimeStats() {
      // 这里应该调用API获取实时数据
      // 为了演示，我们模拟一些数据
      const realTimeStats = {
        onlineUsers: Math.floor(Math.random() * 100) + 50,
        currentSubmissions: Math.floor(Math.random() * 20) + 5,
        systemHealth: Math.floor(Math.random() * 10) + 90
      };
      
      this.setData({ realTimeStats });
      
      // 触发实时数据更新事件
      this.triggerEvent('realTimeUpdate', { realTimeStats });
    },

    /**
     * 刷新看板数据
     */
    refreshDashboard() {
      this.setData({ loading: true });
      this.triggerEvent('refresh');
    },

    /**
     * 导出看板数据
     */
    exportDashboard() {
      this.triggerEvent('export', {
        type: 'dashboard',
        data: {
          statsCards: this.data.statsCards,
          chartData: this.data.chartData,
          timeRange: this.properties.timeRange,
          exportTime: new Date().toISOString()
        }
      });
    },

    /**
     * 获取颜色主题
     */
    getThemeColor(type) {
      const colors = {
        up: '#52c41a',
        down: '#f56565',
        stable: '#999'
      };
      return colors[type] || colors.stable;
    }
  }
});