// GitHub风格14天打卡图组件
Component({
  properties: {
    // 14天打卡数据
    checkinData: {
      type: Array,
      value: [],
      observer: 'processCheckinData'
    }
  },

  data: {
    // 处理后的周数据 [本周, 上周]
    weekData: [[], []],
    
    // V1.0 增强功能
    streakInfo: {         // 连续性信息
      current: 0,
      longest: 0,
      thisWeek: 0
    },
    trendAnalysis: {      // 趋势分析
      trend: 'stable',    // rising, stable, declining
      changeRate: 0,
      weekComparison: ''
    },
    motivationalMsg: '',  // 激励消息
    showDetailView: false, // 详细视图开关
    selectedDay: null     // 选中的日期
  },

  methods: {
    /**
     * 处理打卡数据，转换为2行×7天的布局
     */
    processCheckinData() {
      const checkinData = this.properties.checkinData || [];
      
      if (checkinData.length === 0) {
        // 如果没有数据，生成14天的空数据
        this.generateEmptyData();
        return;
      }

      // 确保数据长度为14天
      const fullData = this.ensureFullData(checkinData);
      
      // 按周分组：[本周7天, 上周7天]
      const weekData = [
        fullData.slice(7, 14), // 本周 (第2周)
        fullData.slice(0, 7)   // 上周 (第1周)
      ];
      
      // V1.0 增强分析
      const analysis = this.analyzeCheckinTrend(fullData);
      
      this.setData({
        weekData,
        ...analysis
      });
    },

    /**
     * 确保数据为完整的14天
     */
    ensureFullData(checkinData) {
      const fullData = [...checkinData];
      
      // 如果数据不足14天，补充空白天数
      while (fullData.length < 14) {
        const lastDate = new Date(fullData[fullData.length - 1]?.date || new Date());
        lastDate.setDate(lastDate.getDate() + 1);
        
        fullData.push({
          date: lastDate.toISOString().split('T')[0],
          checked: false,
          weekday: lastDate.getDay(),
          is_today: false
        });
      }

      return fullData.slice(-14); // 只取最近14天
    },

    /**
     * 生成空数据
     */
    generateEmptyData() {
      const weekData = [[], []];
      const today = new Date();
      
      for (let i = 13; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        
        const dayData = {
          date: date.toISOString().split('T')[0],
          checked: false,
          weekday: date.getDay(),
          is_today: i === 0
        };

        if (i < 7) {
          weekData[1].push(dayData); // 上周
        } else {
          weekData[0].push(dayData); // 本周
        }
      }

      this.setData({ weekData });
    },

    /**
     * 获取天数方格的样式类名
     */
    getWeekDayStatus(dayData) {
      let className = 'grid-item';
      
      if (dayData.checked) {
        className += ' checked';
      }
      
      if (dayData.is_today) {
        className += ' today';
      }

      // 根据打卡强度设置不同级别（暂时简化为有无打卡）
      if (dayData.checked) {
        className += ' level-3';
      } else {
        className += ' level-0';
      }

      return className;
    },

    /**
     * 点击某一天的处理
     */
    onDayTap(e) {
      const { date, checked, weekday } = e.currentTarget.dataset;
      
      // 设置选中状态
      this.setData({
        selectedDay: date
      });
      
      // 显示增强版详细信息
      this.showDayDetailInfo(date, checked, weekday);

      // 触发父组件事件
      this.triggerEvent('dayclick', {
        date,
        checked,
        dateStr: this.formatDate(new Date(date)),
        analysis: this.getDayAnalysis(date, checked)
      });
      
      // 0.5秒后清除选中状态
      setTimeout(() => {
        this.setData({ selectedDay: null });
      }, 500);
    },

    /**
     * 格式化日期显示
     */
    formatDate(date) {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const weekday = weekdays[date.getDay()];
      
      return `${month}月${day}日 ${weekday}`;
    },
    
    // ================================
    // V1.0 新增：智能分析功能
    // ================================
    
    /**
     * 分析打卡趋势和生成激励信息
     */
    analyzeCheckinTrend(fullData) {
      const checkedDays = fullData.filter(day => day.checked);
      const totalCheckins = checkedDays.length;
      
      // 连续性分析
      const streakInfo = this.calculateStreakInfo(fullData);
      
      // 趋势分析（本周 vs 上周）
      const thisWeekCheckins = fullData.slice(7, 14).filter(day => day.checked).length;
      const lastWeekCheckins = fullData.slice(0, 7).filter(day => day.checked).length;
      
      let trend = 'stable';
      let changeRate = 0;
      let weekComparison = '';
      
      if (lastWeekCheckins > 0) {
        changeRate = ((thisWeekCheckins - lastWeekCheckins) / lastWeekCheckins * 100).toFixed(1);
        
        if (changeRate > 20) {
          trend = 'rising';
          weekComparison = `比上周增加${changeRate}%`;
        } else if (changeRate < -20) {
          trend = 'declining';
          weekComparison = `比上周减少${Math.abs(changeRate)}%`;
        } else {
          trend = 'stable';
          weekComparison = '与上周基本持平';
        }
      } else {
        weekComparison = thisWeekCheckins > 0 ? '新开始的一周' : '暂无打卡数据';
      }
      
      // 激励消息生成
      const motivationalMsg = this.generateMotivationalMessage(
        totalCheckins, streakInfo.current, trend
      );
      
      return {
        streakInfo: {
          ...streakInfo,
          thisWeek: thisWeekCheckins
        },
        trendAnalysis: {
          trend,
          changeRate: parseFloat(changeRate),
          weekComparison
        },
        motivationalMsg
      };
    },
    
    /**
     * 计算连续性信息
     */
    calculateStreakInfo(fullData) {
      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 0;
      
      // 从今天往前计算当前连续天数
      for (let i = fullData.length - 1; i >= 0; i--) {
        if (fullData[i].checked) {
          currentStreak++;
        } else {
          break;
        }
      }
      
      // 计算历史最长连续
      for (let i = 0; i < fullData.length; i++) {
        if (fullData[i].checked) {
          tempStreak++;
          longestStreak = Math.max(longestStreak, tempStreak);
        } else {
          tempStreak = 0;
        }
      }
      
      return {
        current: currentStreak,
        longest: longestStreak
      };
    },
    
    /**
     * 生成激励消息
     */
    generateMotivationalMessage(totalCheckins, currentStreak, trend) {
      if (currentStreak >= 7) {
        return `🏆 连续${currentStreak}天打卡，真了不起！`;
      } else if (currentStreak >= 3) {
        return `🔥 连续${currentStreak}天，坚持就是胜利！`;
      } else if (trend === 'rising') {
        return `📈 学习状态上升中，加油！`;
      } else if (totalCheckins >= 10) {
        return `⭐ 近14天打卡${totalCheckins}次，保持下去！`;
      } else if (totalCheckins > 0) {
        return `🌱 刚刚开始，每一天都是新的进步！`;
      } else {
        return `🚀 现在开始你的学习之旅吧！`;
      }
    },
    
    /**
     * 显示单日详细信息
     */
    showDayDetailInfo(date, checked, weekday) {
      const dateObj = new Date(date);
      const dateStr = this.formatDate(dateObj);
      const isToday = date === new Date().toISOString().split('T')[0];
      
      let title = dateStr;
      let content = '';
      
      if (isToday) {
        title += ' (今天)';
        content = checked ? 
          '🎆 今天已打卡，太棒了！' : 
          '💪 今天还没有打卡，去学习一下吧！';
      } else {
        content = checked ? 
          '✅ 已打卡' : 
          '⭕ 未打卡';
      }
      
      // 添加周几信息
      const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      content += `\n\n📅 ${weekdayNames[weekday || 0]}`;
      
      wx.showModal({
        title,
        content,
        showCancel: false,
        confirmText: '知道了'
      });
    },
    
    /**
     * 获取单日分析数据
     */
    getDayAnalysis(date, checked) {
      const today = new Date().toISOString().split('T')[0];
      const isToday = date === today;
      const dayOfWeek = new Date(date).getDay();
      
      return {
        isToday,
        dayOfWeek,
        status: checked ? 'checked' : 'unchecked',
        canCheckToday: isToday && !checked
      };
    },
    
    /**
     * 查看详细趋势分析
     */
    showDetailAnalysis() {
      const { streakInfo, trendAnalysis, motivationalMsg } = this.data;
      
      const content = `🔥 当前连续：${streakInfo.current}天
🏆 历史最佳：${streakInfo.longest}天
📈 本周打卡：${streakInfo.thisWeek}天

趋势分析：${trendAnalysis.weekComparison}

${motivationalMsg}`;
      
      wx.showModal({
        title: '📊 学习数据分析',
        content,
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  attached() {
    // 组件初始化时处理数据
    this.processCheckinData();
  },
  
  /**
   * 组件外部方法：刷新数据分析
   */
  refreshAnalysis() {
    this.processCheckinData();
  }
});