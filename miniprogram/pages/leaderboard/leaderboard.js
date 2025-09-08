// 积分排行榜页面
const app = getApp();
const authModule = require('../../modules/auth/auth');

Page({
  data: {
    currentTab: 'monthly', // monthly | quarterly
    loading: false,
    leaderboardData: [],
    myRank: null,
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    currentQuarter: Math.ceil((new Date().getMonth() + 1) / 3)
  },

  onLoad() {
    this.loadLeaderboard();
  },

  onShow() {
    // 每次显示时刷新数据
    this.loadLeaderboard();
  },

  onPullDownRefresh() {
    this.loadLeaderboard().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 切换标签页
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({
      currentTab: tab
    });
    
    this.loadLeaderboard();
  },

  /**
   * 加载排行榜数据
   */
  async loadLeaderboard() {
    this.setData({ loading: true });

    try {
      const { currentTab, currentYear, currentMonth, currentQuarter } = this.data;
      
      let url, params;
      
      if (currentTab === 'monthly') {
        url = '/learning/leaderboard/monthly';
        params = {
          year: currentYear,
          month: currentMonth,
          limit: 100
        };
      } else {
        url = '/learning/leaderboard/quarterly';
        params = {
          year: currentYear,
          quarter: currentQuarter,
          limit: 100
        };
      }

      const response = await app.request({
        url,
        method: 'GET',
        data: params
      });

      if (response && response.leaderboard) {
        const { leaderboard, current_user_rank } = response;
        
        this.setData({
          leaderboardData: leaderboard,
          myRank: current_user_rank ? {
            rank: current_user_rank,
            score: this.getCurrentUserScore(leaderboard)
          } : null
        });
      } else {
        this.setData({
          leaderboardData: [],
          myRank: null
        });
      }

    } catch (error) {
      console.error('加载排行榜失败:', error);
      
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
      
      this.setData({
        leaderboardData: [],
        myRank: null
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 获取当前用户的积分
   */
  getCurrentUserScore(leaderboard) {
    const currentUser = leaderboard.find(item => item.is_current_user);
    return currentUser ? currentUser.score : 0;
  },

  /**
   * 跳转到个人中心
   */
  goToProfile() {
    wx.switchTab({
      url: '/pages/profile/profile'
    });
  },

  /**
   * 查看用户详情（预留功能）
   */
  viewUserDetail(e) {
    const userId = e.currentTarget.dataset.userId;
    
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  /**
   * 分享排行榜
   */
  shareLeaderboard() {
    const { currentTab, myRank } = this.data;
    const tabText = currentTab === 'monthly' ? '月度' : '季度';
    
    let shareText = `🏆 ${tabText}积分排行榜`;
    
    if (myRank) {
      shareText += `\n我的排名：第${myRank.rank}名，${myRank.score}积分`;
    }
    
    shareText += '\n一起来学习打卡吧！';

    return {
      title: shareText,
      path: '/pages/leaderboard/leaderboard'
    };
  },

  /**
   * 查看积分规则详情
   */
  showScoreRules() {
    wx.showModal({
      title: '积分获得规则',
      content: `作业提交：+1分
获得"优秀"评价：+2分  
获得"极佳"评价：+5分
连续3天打卡：+1分
连续7天打卡：+3分
连续15天打卡：+10分
完成复盘操作：+1分

月度榜每月1日重置
季度榜每季度重置`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return this.shareLeaderboard();
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    const { currentTab, seasonInfo } = this.data;
    const tabText = currentTab === 'monthly' ? '月度' : '季度';
    
    const title = seasonInfo?.is_exam_season ? 
      `💯 国考冲刺季 - ${tabText}排行榜` : 
      `🏆 ${tabText}积分排行榜`;
    
    return {
      title: `${title} - 公考督学助手`
    };
  },

  /**
   * 新增：查看个人学习洞察
   */
  async viewLearningInsights() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const response = await app.request({
        url: '/learning/insights',
        method: 'GET'
      });
      
      if (response && response.insights) {
        this.showInsightsModal(response.insights);
      } else {
        wx.showToast({
          title: '暂无学习洞察',
          icon: 'none'
        });
      }
      
    } catch (error) {
      console.error('获取学习洞察失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 显示学习洞察弹窗
   */
  showInsightsModal(insights) {
    if (!insights || insights.length === 0) {
      wx.showToast({
        title: '暂无学习建议',
        icon: 'none'
      });
      return;
    }
    
    // 取高优先级的前3个建议
    const topInsights = insights
      .filter(item => item.priority === 'high')
      .slice(0, 2)
      .concat(
        insights.filter(item => item.priority === 'medium').slice(0, 1)
      );
    
    const content = topInsights
      .map(item => `• ${item.title}\n${item.message}`)
      .join('\n\n');
    
    wx.showModal({
      title: '💡 个性化学习建议',
      content: content || '您的学习状态很好，继续加油！',
      showCancel: false,
      confirmText: '我知道了'
    });
  }
});