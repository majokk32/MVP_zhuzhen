// components/progressive-image/progressive-image.js
const imageOptimizer = require('../../utils/image-optimizer');

Component({
  properties: {
    // 图片源URL
    src: {
      type: String,
      value: '',
      observer: 'onSrcChange'
    },
    // 占位符图片
    placeholder: {
      type: String,
      value: ''
    },
    // 图片模式
    mode: {
      type: String,
      value: 'aspectFit'
    },
    // 是否启用懒加载
    lazyLoad: {
      type: Boolean,
      value: true
    },
    // 是否启用压缩
    enableCompress: {
      type: Boolean,
      value: true
    },
    // 压缩质量 (0.1-1.0)
    quality: {
      type: Number,
      value: 0.8
    },
    // 最大宽度
    maxWidth: {
      type: Number,
      value: 1200
    },
    // 最大高度
    maxHeight: {
      type: Number,
      value: 1200
    },
    // 是否显示加载状态
    showLoading: {
      type: Boolean,
      value: true
    },
    // 是否显示加载进度
    showProgress: {
      type: Boolean,
      value: false
    },
    // 失败时显示的图片
    errorSrc: {
      type: String,
      value: '/assets/images/image-error.png'
    },
    // 圆角大小
    borderRadius: {
      type: String,
      value: '0'
    },
    // 自定义样式类
    customClass: {
      type: String,
      value: ''
    }
  },

  data: {
    // 当前显示的图片源
    currentSrc: '',
    // 加载状态
    loading: false,
    // 是否加载完成
    loaded: false,
    // 是否加载失败
    error: false,
    // 是否使用缓存
    cached: false,
    // 加载进度 (0-100)
    progress: 0,
    // 图片尺寸信息
    imageInfo: null,
    // 压缩信息
    compressInfo: null
  },

  lifetimes: {
    attached() {
      this.initComponent();
    },
    
    detached() {
      // 清理资源
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
      }
    }
  },

  methods: {
    /**
     * 初始化组件
     */
    initComponent() {
      // 如果有初始src，开始加载
      if (this.properties.src) {
        this.loadImage(this.properties.src);
      } else {
        this.setPlaceholder();
      }
    },

    /**
     * src属性变化处理
     */
    onSrcChange(newSrc, oldSrc) {
      if (newSrc !== oldSrc) {
        this.resetState();
        if (newSrc) {
          this.loadImage(newSrc);
        } else {
          this.setPlaceholder();
        }
      }
    },

    /**
     * 重置组件状态
     */
    resetState() {
      this.setData({
        loading: false,
        loaded: false,
        error: false,
        cached: false,
        progress: 0,
        imageInfo: null,
        compressInfo: null
      });
      
      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
      }
    },

    /**
     * 设置占位符
     */
    setPlaceholder() {
      const placeholder = this.properties.placeholder || this.generatePlaceholder();
      this.setData({
        currentSrc: placeholder,
        loading: false,
        loaded: false,
        error: false
      });
    },

    /**
     * 加载图片
     */
    async loadImage(src) {
      if (!src) {
        this.setPlaceholder();
        return;
      }

      // 设置加载状态
      this.setData({
        loading: true,
        error: false,
        progress: 0
      });

      // 触发加载开始事件
      this.triggerEvent('loadstart', { src });

      try {
        // 检查缓存
        const cachedImage = imageOptimizer.getCachedImage(src);
        
        if (cachedImage) {
          // 使用缓存图片
          this.setData({
            currentSrc: cachedImage.filePath,
            loading: false,
            loaded: true,
            cached: true,
            imageInfo: cachedImage.metadata
          });
          
          this.triggerEvent('load', {
            src,
            cached: true,
            info: cachedImage.metadata
          });
          return;
        }

        // 开始下载和处理
        await this.downloadAndProcessImage(src);

      } catch (error) {
        console.error('图片加载失败:', error);
        this.handleLoadError(error);
      }
    },

    /**
     * 下载并处理图片
     */
    async downloadAndProcessImage(src) {
      const startTime = Date.now();
      
      try {
        // 检查是否为SVG（不支持）
        if (/\.svg(\?.*)?$/i.test(src)) {
          throw new Error('SVG格式在小程序中不支持');
        }

        // 检查是否为本地路径，如果是则直接使用getImageInfo
        if (!src.startsWith('http')) {
          const imageInfo = await new Promise((resolve, reject) => {
            wx.getImageInfo({
              src: src,
              success: resolve,
              fail: reject
            });
          });
          
          this.setData({ progress: 100 });
          
          // 直接使用本地图片
          this.finishImageLoad(src, null, imageInfo, startTime);
          return;
        }

        // 模拟进度更新
        const progressTimer = setInterval(() => {
          if (this.data.progress < 90) {
            this.setData({
              progress: Math.min(90, this.data.progress + Math.random() * 10)
            });
          }
        }, 200);

        // 下载远程图片
        const downloadResult = await wx.downloadFile({
          url: src
        });

        clearInterval(progressTimer);
        this.setData({ progress: 95 });

        if (downloadResult.statusCode !== 200) {
          throw new Error(`下载失败: ${downloadResult.statusCode}`);
        }

        let finalPath = downloadResult.tempFilePath;
        let compressInfo = null;

        // 如果启用压缩
        if (this.properties.enableCompress) {
          const compressResult = await imageOptimizer.compressImage(finalPath, {
            quality: this.properties.quality,
            maxWidth: this.properties.maxWidth,
            maxHeight: this.properties.maxHeight
          });
          
          finalPath = compressResult.tempFilePath;
          compressInfo = compressResult;
        }

        // 获取图片信息
        const imageInfo = await this.getImageInfo(finalPath);
        
        // 缓存图片
        await imageOptimizer.cacheImage(src, finalPath, {
          ...imageInfo,
          compressInfo,
          loadTime: Date.now() - startTime
        });

        // 更新显示
        this.setData({
          currentSrc: finalPath,
          loading: false,
          loaded: true,
          progress: 100,
          imageInfo,
          compressInfo
        });

        // 触发加载完成事件
        this.triggerEvent('load', {
          src,
          cached: false,
          info: imageInfo,
          compressInfo,
          loadTime: Date.now() - startTime
        });

      } catch (error) {
        throw error;
      }
    },

    /**
     * 处理加载错误
     */
    handleLoadError(error) {
      this.setData({
        loading: false,
        error: true,
        currentSrc: this.properties.errorSrc || this.generateErrorPlaceholder()
      });

      // 触发错误事件
      this.triggerEvent('error', {
        src: this.properties.src,
        error: error.message || '加载失败'
      });
    },

    /**
     * 重试加载
     */
    retry() {
      if (this.properties.src) {
        this.resetState();
        this.loadImage(this.properties.src);
        
        // 触发重试事件
        this.triggerEvent('retry', {
          src: this.properties.src
        });
      }
    },

    /**
     * 图片点击事件
     */
    onImageTap(e) {
      this.triggerEvent('tap', {
        src: this.properties.src,
        currentSrc: this.data.currentSrc,
        loaded: this.data.loaded,
        cached: this.data.cached
      });
    },

    /**
     * 原生图片加载事件
     */
    onNativeLoad(e) {
      // 原生图片加载完成（用于占位符或错误图片）
      if (!this.data.loaded && !this.data.loading) {
        this.triggerEvent('placeholderload', e.detail);
      }
    },

    /**
     * 原生图片错误事件
     */
    onNativeError(e) {
      if (!this.data.loaded) {
        this.handleLoadError(new Error('原生图片加载失败'));
      }
    },

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
    },

    /**
     * 生成默认占位符
     */
    generatePlaceholder() {
      // 生成简单的SVG占位符
      const width = this.properties.maxWidth || 300;
      const height = this.properties.maxHeight || 200;
      
      const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="50%" fill="#999" text-anchor="middle" dy=".3em" font-size="14">加载中...</text>
      </svg>`;
      
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },

    /**
     * 生成错误占位符
     */
    generateErrorPlaceholder() {
      const width = this.properties.maxWidth || 300;
      const height = this.properties.maxHeight || 200;
      
      const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f5f5f5"/>
        <text x="50%" y="45%" fill="#999" text-anchor="middle" dy=".3em" font-size="14">图片加载失败</text>
        <text x="50%" y="65%" fill="#ccc" text-anchor="middle" dy=".3em" font-size="12">点击重试</text>
      </svg>`;
      
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },

    /**
     * 获取性能指标
     */
    getPerformanceMetrics() {
      return {
        loaded: this.data.loaded,
        cached: this.data.cached,
        compressed: !!this.data.compressInfo,
        loadTime: this.data.imageInfo?.loadTime || 0,
        compressionRatio: this.data.compressInfo?.compressionRatio || 0,
        originalSize: this.data.compressInfo?.originalSize || 0,
        compressedSize: this.data.compressInfo?.compressedSize || 0
      };
    }
  }
});