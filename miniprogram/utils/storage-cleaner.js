/**
 * 存储清理工具
 * 用于清理微信小程序10MB存储限制问题
 */

const storageCleaner = {
  /**
   * 清理所有存储
   */
  clearAll() {
    try {
      console.log('开始清理所有存储...');
      
      // 获取所有存储的key
      const info = wx.getStorageInfoSync();
      console.log('当前存储信息:', info);
      
      // 逐个删除
      info.keys.forEach(key => {
        try {
          wx.removeStorageSync(key);
          console.log('已删除存储项:', key);
        } catch (e) {
          console.error('删除存储项失败:', key, e);
        }
      });
      
      console.log('存储清理完成');
      
      // 验证清理结果
      const newInfo = wx.getStorageInfoSync();
      console.log('清理后存储信息:', newInfo);
      
    } catch (error) {
      console.error('存储清理失败:', error);
    }
  },

  /**
   * 清理错误相关存储
   */
  clearErrorLogs() {
    try {
      wx.removeStorageSync('error_logs');
      console.log('错误日志已清理');
    } catch (e) {
      console.error('清理错误日志失败:', e);
    }
  },

  /**
   * 获取存储使用情况
   */
  getStorageInfo() {
    try {
      const info = wx.getStorageInfoSync();
      console.log('存储信息:', {
        keys: info.keys,
        keyCount: info.keys.length,
        currentSize: info.currentSize,
        limitSize: info.limitSize,
        usage: (info.currentSize / info.limitSize * 100).toFixed(2) + '%'
      });
      return info;
    } catch (error) {
      console.error('获取存储信息失败:', error);
      return null;
    }
  }
};

// 在控制台暴露清理函数，方便调试
if (typeof global !== 'undefined') {
  global.clearStorage = storageCleaner.clearAll;
  global.clearErrorLogs = storageCleaner.clearErrorLogs;
  global.getStorageInfo = storageCleaner.getStorageInfo;
}

module.exports = storageCleaner;