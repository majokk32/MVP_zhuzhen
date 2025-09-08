/**
 * 分享功能深度链接模块 - Phase 2 微信生态集成
 * 
 * 特性:
 * - 智能分享内容生成
 * - 深度链接URL构建
 * - 分享数据统计和分析
 * - 多场景分享适配
 * - 分享成功率优化
 */

const app = getApp();

class SharingModule {
  constructor() {
    // 分享场景配置
    this.shareScenes = {
      // 任务分享
      task: {
        type: 'task',
        title: '{taskName} - 一起来挑战！',
        desc: '我在公考督学助手发现了这个任务，一起来提升申论成绩吧！',
        path: '/pages/task-detail/task-detail?id={taskId}&share=task',
        imageKey: 'task',
        analytics: true
      },
      
      // 成就分享
      achievement: {
        type: 'achievement',
        title: '我获得了新成就！',
        desc: '在公考督学助手取得了{achievementName}成就，快来看看我的学习成果吧！',
        path: '/pages/profile/profile?achievement={achievementId}&share=achievement',
        imageKey: 'achievement',
        analytics: true
      },
      
      // 学习报告分享
      report: {
        type: 'report',
        title: '我的学习报告 - 第{week}周',
        desc: '本周完成了{taskCount}个任务，累计学习{hours}小时！',
        path: '/pages/profile/profile?report={reportId}&share=report',
        imageKey: 'report',
        analytics: true
      },
      
      // 排行榜分享
      ranking: {
        type: 'ranking',
        title: '我在排行榜第{rank}名！',
        desc: '在公考督学助手的月度排行榜中取得了不错的成绩！',
        path: '/pages/leaderboard/leaderboard?share=ranking&rank={rank}',
        imageKey: 'ranking',
        analytics: true
      },
      
      // 应用推荐
      app: {
        type: 'app',
        title: '公考督学助手 - 高效提升申论成绩',
        desc: '专业的申论批改和学习指导，助力公考成功！',
        path: '/pages/index/index?share=app',
        imageKey: 'app',
        analytics: true
      },
      
      // 邀请好友
      invite: {
        type: 'invite',
        title: '{nickname}邀请你加入学习',
        desc: '和我一起在公考督学助手学习申论，共同进步！',
        path: '/pages/index/index?inviter={userId}&share=invite',
        imageKey: 'invite',
        analytics: true
      }
    };
    
    // 分享图片配置
    this.shareImages = {
      task: '/assets/images/share-task.png',
      achievement: '/assets/images/share-achievement.png',
      report: '/assets/images/share-report.png',
      ranking: '/assets/images/share-ranking.png',
      app: '/assets/images/share-app.png',
      invite: '/assets/images/share-invite.png',
      default: '/assets/images/share-default.png'
    };
    
    // 分享统计数据
    this.shareStats = {
      totalShares: 0,
      sharesByType: {},
      sharesByScene: {},
      clickThroughRate: {},
      lastUpdated: null
    };
    
    // 分享配置
    this.config = {
      enableAnalytics: true,
      enableDynamicImage: true,
      maxSharesPerDay: 50,
      shareThrottleDelay: 2000, // 2秒防抖
      enableShareReward: true
    };
    
    this.init();
  }

  /**
   * 初始化分享模块
   */
  async init() {
    try {
      // 加载分享统计数据
      await this.loadShareStats();
      
      // 注册深度链接处理器
      this.registerDeepLinkHandlers();
      
      console.log('分享模块初始化完成');
    } catch (error) {
      console.error('分享模块初始化失败:', error);
    }
  }

  /**
   * 生成分享内容
   * @param {string} sceneType - 分享场景类型
   * @param {Object} data - 分享数据
   * @param {Object} options - 选项
   * @returns {Object} 分享内容
   */
  generateShareContent(sceneType, data = {}, options = {}) {
    try {
      const scene = this.shareScenes[sceneType];
      if (!scene) {
        throw new Error(`未找到分享场景: ${sceneType}`);
      }

      // 构建分享数据
      const shareContent = {
        title: this.interpolateTemplate(scene.title, data),
        path: this.interpolateTemplate(scene.path, data),
        imageUrl: this.getShareImage(scene.imageKey, data, options),
        scene: sceneType,
        timestamp: Date.now(),
        userId: app.globalData.userInfo?.id
      };

      // 添加朋友圈分享特殊处理
      if (options.shareToTimeline) {
        shareContent.query = this.buildTimelineQuery(data);
        shareContent.title = this.optimizeTimelineTitle(shareContent.title);
      }

      // 记录分享统计
      if (this.config.enableAnalytics) {
        this.recordShareGeneration(sceneType, shareContent);
      }

      return shareContent;
    } catch (error) {
      console.error('生成分享内容失败:', error);
      return this.getDefaultShareContent();
    }
  }

  /**
   * 构建深度链接
   * @param {string} targetPage - 目标页面
   * @param {Object} params - 参数
   * @param {Object} options - 选项
   * @returns {string} 深度链接路径
   */
  buildDeepLink(targetPage, params = {}, options = {}) {
    try {
      // 基础路径
      let path = targetPage;
      
      // 添加分享标识
      params.share = options.shareType || 'link';
      params.timestamp = Date.now();
      
      // 添加分享者信息（如果需要）
      if (options.includeSharer && app.globalData.userInfo) {
        params.sharer = app.globalData.userInfo.id;
      }
      
      // 构建查询字符串
      const queryString = Object.keys(params)
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');
      
      if (queryString) {
        path += (path.includes('?') ? '&' : '?') + queryString;
      }
      
      return path;
    } catch (error) {
      console.error('构建深度链接失败:', error);
      return targetPage;
    }
  }

  /**
   * 智能分享 - 根据上下文自动选择最佳分享方式
   * @param {Object} context - 上下文信息
   * @returns {Object} 分享内容
   */
  smartShare(context) {
    try {
      // 分析上下文决定分享类型
      const shareType = this.analyzeShareContext(context);
      
      // 个性化分享数据
      const shareData = this.personalizeShareData(shareType, context);
      
      // 生成分享内容
      const shareContent = this.generateShareContent(shareType, shareData, {
        smart: true,
        context: context
      });
      
      // 优化分享内容
      return this.optimizeShareContent(shareContent, context);
      
    } catch (error) {
      console.error('智能分享失败:', error);
      return this.getDefaultShareContent();
    }
  }

  /**
   * 批量分享处理
   * @param {Array} shareItems - 分享项目列表
   * @returns {Promise<Array>} 分享结果
   */
  async batchShare(shareItems) {
    const results = [];
    
    for (const item of shareItems) {
      try {
        const shareContent = this.generateShareContent(
          item.type, 
          item.data, 
          item.options
        );
        
        results.push({
          success: true,
          content: shareContent,
          item: item
        });
        
        // 添加延迟，避免过于频繁
        await this.delay(100);
        
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          item: item
        });
      }
    }
    
    return results;
  }

  /**
   * 处理深度链接跳转
   * @param {Object} query - 查询参数
   */
  async handleDeepLinkNavigation(query) {
    try {
      // 记录深度链接访问
      this.recordDeepLinkAccess(query);
      
      // 根据分享类型处理导航
      switch (query.share) {
        case 'task':
          return this.handleTaskDeepLink(query);
        case 'achievement':
          return this.handleAchievementDeepLink(query);
        case 'report':
          return this.handleReportDeepLink(query);
        case 'ranking':
          return this.handleRankingDeepLink(query);
        case 'invite':
          return this.handleInviteDeepLink(query);
        default:
          return this.handleDefaultDeepLink(query);
      }
    } catch (error) {
      console.error('深度链接处理失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 分享成功回调处理
   * @param {Object} shareContent - 分享内容
   * @param {Object} result - 分享结果
   */
  onShareSuccess(shareContent, result = {}) {
    try {
      // 记录分享成功
      this.recordShareSuccess(shareContent, result);
      
      // 更新用户积分（如果启用奖励）
      if (this.config.enableShareReward) {
        this.handleShareReward(shareContent);
      }
      
      // 触发分享成功事件
      this.triggerShareEvent('shareSuccess', {
        content: shareContent,
        result: result
      });
      
      console.log('分享成功记录完成');
      
    } catch (error) {
      console.error('分享成功处理失败:', error);
    }
  }

  /**
   * 获取分享统计数据
   * @param {string} timeRange - 时间范围
   * @returns {Object} 统计数据
   */
  getShareAnalytics(timeRange = 'week') {
    try {
      const stats = this.shareStats;
      
      return {
        totalShares: stats.totalShares || 0,
        sharesByType: stats.sharesByType || {},
        sharesByScene: stats.sharesByScene || {},
        clickThroughRate: this.calculateClickThroughRate(timeRange),
        topSharedContent: this.getTopSharedContent(timeRange),
        shareGrowth: this.calculateShareGrowth(timeRange),
        engagement: this.calculateShareEngagement(timeRange),
        recommendations: this.generateSharingRecommendations()
      };
    } catch (error) {
      console.error('获取分享统计失败:', error);
      return {};
    }
  }

  /**
   * 分享内容个性化推荐
   * @param {Object} userContext - 用户上下文
   * @returns {Array} 推荐的分享内容
   */
  getShareRecommendations(userContext) {
    try {
      const recommendations = [];
      
      // 基于用户行为推荐
      if (userContext.hasRecentAchievement) {
        recommendations.push({
          type: 'achievement',
          priority: 'high',
          reason: '您刚获得新成就，适合分享庆祝'
        });
      }
      
      if (userContext.weeklyProgress > 80) {
        recommendations.push({
          type: 'report',
          priority: 'medium',
          reason: '本周学习进度优秀，可分享学习成果'
        });
      }
      
      if (userContext.rankingImproved) {
        recommendations.push({
          type: 'ranking',
          priority: 'medium',
          reason: '排名有提升，可分享激励朋友'
        });
      }
      
      // 添加默认推荐
      recommendations.push({
        type: 'app',
        priority: 'low',
        reason: '推荐优质应用给朋友'
      });
      
      return recommendations.sort((a, b) => this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority));
      
    } catch (error) {
      console.error('获取分享推荐失败:', error);
      return [];
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 模板字符串插值
   */
  interpolateTemplate(template, data) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  /**
   * 获取分享图片
   */
  getShareImage(imageKey, data, options) {
    if (options.customImage) {
      return options.customImage;
    }
    
    if (this.config.enableDynamicImage && data.customImage) {
      return data.customImage;
    }
    
    return this.shareImages[imageKey] || this.shareImages.default;
  }

  /**
   * 构建朋友圈查询参数
   */
  buildTimelineQuery(data) {
    const query = {};
    
    // 只保留必要的参数
    if (data.id) query.id = data.id;
    if (data.type) query.type = data.type;
    
    return Object.keys(query).map(key => `${key}=${query[key]}`).join('&');
  }

  /**
   * 优化朋友圈标题
   */
  optimizeTimelineTitle(title) {
    // 朋友圈标题长度优化
    if (title.length > 30) {
      return title.substring(0, 27) + '...';
    }
    return title;
  }

  /**
   * 分析分享上下文
   */
  analyzeShareContext(context) {
    if (context.currentPage === 'task-detail') return 'task';
    if (context.currentPage === 'profile' && context.hasNewAchievement) return 'achievement';
    if (context.currentPage === 'leaderboard') return 'ranking';
    if (context.isInvite) return 'invite';
    
    return 'app'; // 默认应用分享
  }

  /**
   * 个性化分享数据
   */
  personalizeShareData(shareType, context) {
    const data = { ...context };
    
    // 添加用户个性化信息
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      data.nickname = userInfo.nickname;
      data.userId = userInfo.id;
    }
    
    // 添加时间信息
    data.currentWeek = Math.ceil((Date.now() - new Date().setMonth(0, 1)) / (7 * 24 * 60 * 60 * 1000));
    
    return data;
  }

  /**
   * 优化分享内容
   */
  optimizeShareContent(shareContent, context) {
    // 根据时间优化标题
    const hour = new Date().getHours();
    if (hour < 12) {
      shareContent.title = '☀️ ' + shareContent.title;
    } else if (hour < 18) {
      shareContent.title = '⏰ ' + shareContent.title;
    } else {
      shareContent.title = '🌙 ' + shareContent.title;
    }
    
    return shareContent;
  }

  /**
   * 注册深度链接处理器
   */
  registerDeepLinkHandlers() {
    // 将处理器注册到app全局
    const originalHandler = app.handleDeepLink;
    app.handleDeepLink = () => {
      if (originalHandler) originalHandler.call(app);
      
      const query = app.globalData.launchQuery;
      if (query && query.share) {
        this.handleDeepLinkNavigation(query);
      }
    };
  }

  /**
   * 处理任务深度链接
   */
  async handleTaskDeepLink(query) {
    if (query.id) {
      wx.navigateTo({
        url: `/pages/task-detail/task-detail?id=${query.id}`,
        success: () => {
          this.showShareWelcome('task', query);
        }
      });
    }
  }

  /**
   * 处理成就深度链接
   */
  async handleAchievementDeepLink(query) {
    wx.switchTab({
      url: '/pages/profile/profile',
      success: () => {
        if (query.achievementId) {
          this.showAchievementDetail(query.achievementId);
        }
      }
    });
  }

  /**
   * 处理邀请深度链接
   */
  async handleInviteDeepLink(query) {
    // 记录邀请信息
    if (query.inviter) {
      this.recordInviteClick(query.inviter);
    }
    
    wx.switchTab({
      url: '/pages/index/index',
      success: () => {
        this.showInviteWelcome(query);
      }
    });
  }

  /**
   * 显示分享欢迎信息
   */
  showShareWelcome(shareType, query) {
    const messages = {
      task: '欢迎来挑战这个任务！',
      achievement: '一起来看看这个成就！',
      ranking: '查看最新排行榜！',
      invite: '欢迎加入我们的学习社区！'
    };
    
    wx.showToast({
      title: messages[shareType] || '欢迎使用！',
      icon: 'none',
      duration: 2000
    });
  }

  /**
   * 获取默认分享内容
   */
  getDefaultShareContent() {
    return {
      title: '公考督学助手 - 高效提升申论成绩',
      path: '/pages/index/index',
      imageUrl: this.shareImages.default
    };
  }

  /**
   * 记录分享统计
   */
  recordShareGeneration(sceneType, shareContent) {
    this.shareStats.totalShares++;
    this.shareStats.sharesByType[sceneType] = (this.shareStats.sharesByType[sceneType] || 0) + 1;
    this.shareStats.lastUpdated = Date.now();
    
    this.saveShareStats();
  }

  /**
   * 记录分享成功
   */
  recordShareSuccess(shareContent, result) {
    const sceneType = shareContent.scene;
    this.shareStats.sharesByScene[sceneType] = (this.shareStats.sharesByScene[sceneType] || 0) + 1;
    
    this.saveShareStats();
  }

  /**
   * 记录深度链接访问
   */
  recordDeepLinkAccess(query) {
    const accessLog = {
      shareType: query.share,
      timestamp: Date.now(),
      params: query
    };
    
    // 保存访问日志
    const logs = wx.getStorageSync('deeplink_access_logs') || [];
    logs.push(accessLog);
    
    // 只保留最近1000条记录
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    wx.setStorageSync('deeplink_access_logs', logs);
  }

  /**
   * 加载分享统计数据
   */
  async loadShareStats() {
    try {
      const stats = wx.getStorageSync('sharing_stats');
      if (stats) {
        this.shareStats = { ...this.shareStats, ...stats };
      }
    } catch (error) {
      console.error('加载分享统计失败:', error);
    }
  }

  /**
   * 保存分享统计数据
   */
  saveShareStats() {
    try {
      wx.setStorageSync('sharing_stats', this.shareStats);
    } catch (error) {
      console.error('保存分享统计失败:', error);
    }
  }

  /**
   * 计算点击率
   */
  calculateClickThroughRate(timeRange) {
    // 这里可以实现更复杂的点击率计算
    return '12.5%'; // 示例数据
  }

  /**
   * 获取热门分享内容
   */
  getTopSharedContent(timeRange) {
    return [
      { type: 'task', count: 25, title: '申论真题练习' },
      { type: 'achievement', count: 18, title: '连续学习7天' },
      { type: 'ranking', count: 12, title: '月度排行榜' }
    ];
  }

  /**
   * 计算分享增长
   */
  calculateShareGrowth(timeRange) {
    return '+15%'; // 示例数据
  }

  /**
   * 计算分享参与度
   */
  calculateShareEngagement(timeRange) {
    return {
      shareRate: '8.2%',
      clickRate: '12.5%',
      conversionRate: '3.8%'
    };
  }

  /**
   * 生成分享建议
   */
  generateSharingRecommendations() {
    return [
      '成就分享的点击率最高，建议多分享学习成果',
      '下午3-5点是分享的最佳时间',
      '添加个人感想能提高分享互动率'
    ];
  }

  /**
   * 获取优先级分数
   */
  getPriorityScore(priority) {
    const scores = { high: 3, medium: 2, low: 1 };
    return scores[priority] || 0;
  }

  /**
   * 处理分享奖励
   */
  handleShareReward(shareContent) {
    // 这里可以实现分享积分奖励逻辑
    console.log('处理分享奖励:', shareContent.scene);
  }

  /**
   * 触发分享事件
   */
  triggerShareEvent(eventType, data) {
    // 触发自定义事件
    const event = new CustomEvent(eventType, { detail: data });
    if (typeof dispatchEvent === 'function') {
      dispatchEvent(event);
    }
  }

  /**
   * 延迟工具方法
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 其他辅助方法...
  showAchievementDetail(achievementId) {
    console.log('显示成就详情:', achievementId);
  }

  recordInviteClick(inviterId) {
    console.log('记录邀请点击:', inviterId);
  }

  showInviteWelcome(query) {
    wx.showModal({
      title: '欢迎加入！',
      content: '您是通过好友邀请加入的，一起开始学习之旅吧！',
      showCancel: false
    });
  }

  handleDefaultDeepLink(query) {
    console.log('处理默认深度链接:', query);
  }

  handleReportDeepLink(query) {
    wx.switchTab({
      url: '/pages/profile/profile'
    });
  }

  handleRankingDeepLink(query) {
    wx.switchTab({
      url: '/pages/leaderboard/leaderboard'
    });
  }
}

// 创建全局实例
const sharingModule = new SharingModule();

module.exports = sharingModule;