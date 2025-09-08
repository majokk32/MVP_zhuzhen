/**
 * 图片优化工具模块 - Phase 2 性能优化
 * 
 * 特性:
 * - 图片压缩和格式转换
 * - 多级缓存策略
 * - 渐进式加载
 * - 智能压缩比例
 * - 网络自适应
 */

class ImageOptimizer {
  constructor() {
    // 缓存配置
    this.cacheConfig = {
      maxSize: 50 * 1024 * 1024, // 50MB缓存上限
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7天过期
      cleanupThreshold: 0.8 // 80%时清理
    };
    
    // 压缩配置
    this.compressConfig = {
      quality: 0.8,
      maxWidth: 1200,
      maxHeight: 1200,
      thumbWidth: 300,
      thumbHeight: 300,
      formats: ['webp', 'jpg', 'png']
    };
    
    // 网络类型映射
    this.networkQuality = {
      'wifi': 1.0,
      '4g': 0.8,
      '3g': 0.6,
      '2g': 0.4,
      'none': 0.2
    };
    
    this.initCache();
  }

  /**
   * 初始化缓存系统
   */
  async initCache() {
    try {
      // 获取缓存信息
      const cacheInfo = wx.getStorageInfoSync();
      console.log('图片缓存初始化:', {
        currentSize: cacheInfo.currentSize,
        limitSize: cacheInfo.limitSize,
        keys: cacheInfo.keys.filter(key => key.startsWith('img_cache_')).length
      });
      
      // 如果缓存使用率过高，执行清理
      if (cacheInfo.currentSize / cacheInfo.limitSize > this.cacheConfig.cleanupThreshold) {
        await this.cleanupCache();
      }
    } catch (error) {
      console.warn('缓存初始化失败:', error);
    }
  }

  /**
   * 智能图片压缩
   * @param {string} filePath - 图片路径
   * @param {Object} options - 压缩选项
   * @returns {Promise<Object>} 压缩结果
   */
  async compressImage(filePath, options = {}) {
    try {
      // 获取图片信息
      const imageInfo = await this.getImageInfo(filePath);
      
      // 根据网络状况调整压缩参数
      const networkType = await this.getNetworkType();
      const qualityFactor = this.networkQuality[networkType] || 0.8;
      
      // 计算最优压缩参数
      const compressOptions = this.calculateCompressOptions(imageInfo, qualityFactor, options);
      
      // 执行压缩
      const compressedInfo = await wx.compressImage({
        src: filePath,
        quality: compressOptions.quality,
        compressedWidth: compressOptions.width,
        compressedHeight: compressOptions.height
      });
      
      // 获取压缩后文件大小
      const compressedSize = await this.getFileSize(compressedInfo.tempFilePath);
      
      const result = {
        tempFilePath: compressedInfo.tempFilePath,
        originalSize: imageInfo.size,
        compressedSize,
        compressionRatio: ((imageInfo.size - compressedSize) / imageInfo.size * 100).toFixed(1),
        width: compressedInfo.width || compressOptions.width,
        height: compressedInfo.height || compressOptions.height,
        quality: compressOptions.quality,
        format: this.getImageFormat(filePath)
      };
      
      console.log('图片压缩完成:', result);
      return result;
      
    } catch (error) {
      console.error('图片压缩失败:', error);
      // 压缩失败时返回原图
      return {
        tempFilePath: filePath,
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        error: error.message
      };
    }
  }

  /**
   * 生成缩略图
   * @param {string} filePath - 原图路径
   * @param {Object} options - 缩略图选项
   * @returns {Promise<string>} 缩略图路径
   */
  async generateThumbnail(filePath, options = {}) {
    const thumbOptions = {
      quality: 0.7,
      width: options.width || this.compressConfig.thumbWidth,
      height: options.height || this.compressConfig.thumbHeight
    };
    
    try {
      const result = await wx.compressImage({
        src: filePath,
        quality: thumbOptions.quality,
        compressedWidth: thumbOptions.width,
        compressedHeight: thumbOptions.height
      });
      
      return result.tempFilePath;
    } catch (error) {
      console.error('缩略图生成失败:', error);
      return filePath; // 失败时返回原图
    }
  }

  /**
   * 缓存图片
   * @param {string} url - 图片URL
   * @param {string} filePath - 本地文件路径
   * @param {Object} metadata - 元数据
   */
  async cacheImage(url, filePath, metadata = {}) {
    try {
      const cacheKey = this.getCacheKey(url);
      const cacheData = {
        url,
        filePath,
        metadata,
        timestamp: Date.now(),
        size: metadata.size || 0
      };
      
      wx.setStorageSync(cacheKey, cacheData);
      console.log('图片已缓存:', cacheKey);
      
    } catch (error) {
      console.warn('图片缓存失败:', error);
    }
  }

  /**
   * 从缓存获取图片
   * @param {string} url - 图片URL
   * @returns {Object|null} 缓存数据
   */
  getCachedImage(url) {
    try {
      const cacheKey = this.getCacheKey(url);
      const cacheData = wx.getStorageSync(cacheKey);
      
      if (!cacheData) return null;
      
      // 检查是否过期
      if (Date.now() - cacheData.timestamp > this.cacheConfig.maxAge) {
        wx.removeStorageSync(cacheKey);
        return null;
      }
      
      // 检查本地文件是否存在
      try {
        const fileManager = wx.getFileSystemManager();
        fileManager.accessSync(cacheData.filePath);
        return cacheData;
      } catch (e) {
        // 本地文件不存在，清除缓存记录
        wx.removeStorageSync(cacheKey);
        return null;
      }
      
    } catch (error) {
      console.warn('获取缓存图片失败:', error);
      return null;
    }
  }

  /**
   * 智能图片加载
   * @param {string} url - 图片URL
   * @param {Object} options - 加载选项
   * @returns {Promise<string>} 图片路径
   */
  async loadImage(url, options = {}) {
    try {
      // 首先检查缓存
      const cached = this.getCachedImage(url);
      if (cached && !options.forceRefresh) {
        console.log('使用缓存图片:', url);
        return cached.filePath;
      }
      
      // 下载图片
      const downloadResult = await wx.downloadFile({
        url: url,
        header: options.header || {}
      });
      
      if (downloadResult.statusCode !== 200) {
        throw new Error(`下载失败: ${downloadResult.statusCode}`);
      }
      
      let finalPath = downloadResult.tempFilePath;
      
      // 如果需要压缩
      if (options.compress !== false) {
        const compressResult = await this.compressImage(finalPath, options.compressOptions);
        finalPath = compressResult.tempFilePath;
      }
      
      // 缓存图片
      const metadata = {
        size: await this.getFileSize(finalPath),
        compressed: options.compress !== false
      };
      await this.cacheImage(url, finalPath, metadata);
      
      return finalPath;
      
    } catch (error) {
      console.error('图片加载失败:', url, error);
      throw error;
    }
  }

  /**
   * 渐进式图片组件数据
   * @param {string} url - 图片URL
   * @param {Object} options - 选项
   * @returns {Object} 组件数据
   */
  async getProgressiveImageData(url, options = {}) {
    try {
      const cached = this.getCachedImage(url);
      
      if (cached) {
        return {
          src: cached.filePath,
          loaded: true,
          cached: true,
          placeholder: null
        };
      }
      
      // 生成占位符（可以是低质量版本或者模糊效果）
      const placeholder = options.placeholder || 'data:image/svg+xml;base64,...'; // 可以实现模糊占位符
      
      return {
        src: url,
        loaded: false,
        cached: false,
        placeholder,
        onLoad: async () => {
          // 图片加载完成后的处理
          try {
            await this.loadImage(url, { ...options, compress: true });
          } catch (error) {
            console.error('后台图片处理失败:', error);
          }
        }
      };
      
    } catch (error) {
      console.error('渐进式图片数据生成失败:', error);
      return {
        src: url,
        loaded: false,
        cached: false,
        placeholder: null
      };
    }
  }

  /**
   * 清理过期缓存
   */
  async cleanupCache() {
    try {
      const storageInfo = wx.getStorageInfoSync();
      const imageCacheKeys = storageInfo.keys.filter(key => key.startsWith('img_cache_'));
      
      let cleanedCount = 0;
      let cleanedSize = 0;
      
      for (const key of imageCacheKeys) {
        try {
          const cacheData = wx.getStorageSync(key);
          
          // 检查是否过期或文件不存在
          const isExpired = Date.now() - cacheData.timestamp > this.cacheConfig.maxAge;
          let fileExists = true;
          
          try {
            const fileManager = wx.getFileSystemManager();
            fileManager.accessSync(cacheData.filePath);
          } catch (e) {
            fileExists = false;
          }
          
          if (isExpired || !fileExists) {
            wx.removeStorageSync(key);
            cleanedCount++;
            cleanedSize += cacheData.metadata?.size || 0;
          }
        } catch (error) {
          // 缓存数据损坏，直接删除
          wx.removeStorageSync(key);
          cleanedCount++;
        }
      }
      
      console.log('缓存清理完成:', {
        cleanedCount,
        cleanedSize: this.formatFileSize(cleanedSize)
      });
      
      return { cleanedCount, cleanedSize };
      
    } catch (error) {
      console.error('缓存清理失败:', error);
      return { cleanedCount: 0, cleanedSize: 0 };
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    try {
      const storageInfo = wx.getStorageInfoSync();
      const imageCacheKeys = storageInfo.keys.filter(key => key.startsWith('img_cache_'));
      
      let totalSize = 0;
      let validCount = 0;
      let expiredCount = 0;
      
      imageCacheKeys.forEach(key => {
        try {
          const cacheData = wx.getStorageSync(key);
          const isExpired = Date.now() - cacheData.timestamp > this.cacheConfig.maxAge;
          
          if (isExpired) {
            expiredCount++;
          } else {
            validCount++;
            totalSize += cacheData.metadata?.size || 0;
          }
        } catch (e) {
          expiredCount++;
        }
      });
      
      return {
        validCount,
        expiredCount,
        totalSize,
        totalSizeText: this.formatFileSize(totalSize),
        storageUsage: (storageInfo.currentSize / storageInfo.limitSize * 100).toFixed(1) + '%'
      };
      
    } catch (error) {
      console.error('获取缓存统计失败:', error);
      return {
        validCount: 0,
        expiredCount: 0,
        totalSize: 0,
        totalSizeText: '0 B',
        storageUsage: '0%'
      };
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 获取图片信息
   */
  getImageInfo(src) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src,
        success: resolve,
        fail: reject
      });
    });
  }

  /**
   * 获取网络类型
   */
  getNetworkType() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => resolve(res.networkType),
        fail: () => resolve('unknown')
      });
    });
  }

  /**
   * 获取文件大小
   */
  async getFileSize(filePath) {
    try {
      const fileManager = wx.getFileSystemManager();
      const stats = fileManager.statSync(filePath);
      return stats.size;
    } catch (error) {
      console.warn('获取文件大小失败:', error);
      return 0;
    }
  }

  /**
   * 计算最优压缩参数
   */
  calculateCompressOptions(imageInfo, qualityFactor, options = {}) {
    const maxWidth = options.maxWidth || this.compressConfig.maxWidth;
    const maxHeight = options.maxHeight || this.compressConfig.maxHeight;
    
    let { width, height } = imageInfo;
    
    // 按比例缩放
    if (width > maxWidth || height > maxHeight) {
      const widthRatio = maxWidth / width;
      const heightRatio = maxHeight / height;
      const ratio = Math.min(widthRatio, heightRatio);
      
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }
    
    // 根据网络情况调整质量
    const quality = Math.max(0.3, Math.min(1.0, 
      (options.quality || this.compressConfig.quality) * qualityFactor
    ));
    
    return { width, height, quality };
  }

  /**
   * 获取图片格式
   */
  getImageFormat(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'unknown';
  }

  /**
   * 生成缓存key
   */
  getCacheKey(url) {
    // 简单的URL hash
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return `img_cache_${Math.abs(hash)}`;
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// 创建全局实例
const imageOptimizer = new ImageOptimizer();

module.exports = imageOptimizer;