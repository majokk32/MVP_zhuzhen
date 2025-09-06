// API配置管理模块
// 安全管理通义千问API等第三方服务配置

class ApiConfigManager {
  constructor() {
    this.configs = new Map();
    this.initialized = false;
    this.initPromise = null;
  }

  // 初始化API配置
  async init() {
    if (this.initialized) {
      return this.configs;
    }
    
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = this._loadConfigs();
    return this.initPromise;
  }

  // 从服务器加载配置
  async _loadConfigs() {
    try {
      const app = getApp();
      
      // 从后端安全获取API配置
      const response = await app.request({
        url: '/api/v1/config/third-party-apis',
        method: 'GET',
        showError: false
      });
      
      if (response.code === 200 && response.data) {
        this.processConfigs(response.data);
        this.initialized = true;
        console.log('API配置初始化完成');
      } else {
        throw new Error('API配置获取失败');
      }
      
      return this.configs;
      
    } catch (error) {
      console.error('加载API配置失败:', error);
      
      // 使用缓存的配置
      const cachedConfigs = this.loadCachedConfigs();
      if (cachedConfigs.size > 0) {
        console.log('使用缓存的API配置');
        this.configs = cachedConfigs;
        this.initialized = true;
        return this.configs;
      }
      
      // 使用默认开发配置
      this.loadDevelopmentConfigs();
      throw error;
    }
  }

  // 处理服务器返回的配置
  processConfigs(configData) {
    // 通义千问语音转写配置
    if (configData.qwen_speech) {
      this.configs.set('qwen_speech', {
        apiKey: configData.qwen_speech.api_key,
        apiUrl: configData.qwen_speech.api_url,
        model: configData.qwen_speech.model || 'qwen-audio-turbo',
        maxFileSize: configData.qwen_speech.max_file_size || 10 * 1024 * 1024, // 10MB
        timeout: configData.qwen_speech.timeout || 30000,
        enabled: configData.qwen_speech.enabled !== false
      });
    }

    // 其他API配置可以在这里扩展
    if (configData.other_apis) {
      // 处理其他第三方API配置
    }

    // 缓存配置到本地
    this.cacheConfigs();
  }

  // 缓存配置到本地存储
  cacheConfigs() {
    try {
      const configsObj = {};
      this.configs.forEach((value, key) => {
        configsObj[key] = value;
      });
      
      wx.setStorageSync('api_configs', {
        data: configsObj,
        timestamp: Date.now(),
        version: '1.0'
      });
    } catch (error) {
      console.warn('缓存API配置失败:', error);
    }
  }

  // 加载缓存的配置
  loadCachedConfigs() {
    try {
      const cached = wx.getStorageSync('api_configs');
      if (cached && cached.data) {
        // 检查缓存时效性（24小时）
        const isExpired = Date.now() - cached.timestamp > 24 * 60 * 60 * 1000;
        if (!isExpired) {
          const configs = new Map();
          Object.entries(cached.data).forEach(([key, value]) => {
            configs.set(key, value);
          });
          return configs;
        }
      }
    } catch (error) {
      console.warn('加载缓存API配置失败:', error);
    }
    
    return new Map();
  }

  // 加载开发环境默认配置
  loadDevelopmentConfigs() {
    console.log('加载开发环境API配置');
    
    // 开发环境使用模拟配置
    this.configs.set('qwen_speech', {
      apiKey: 'dev_mock_key',
      apiUrl: 'https://mock-api.example.com',
      model: 'qwen-audio-turbo',
      maxFileSize: 10 * 1024 * 1024,
      timeout: 30000,
      enabled: false, // 开发环境禁用真实API
      mock: true
    });
    
    this.initialized = true;
  }

  // 获取指定API的配置
  async getConfig(apiName) {
    await this.init();
    return this.configs.get(apiName);
  }

  // 检查API是否可用
  async isApiAvailable(apiName) {
    try {
      const config = await this.getConfig(apiName);
      return config && config.enabled && config.apiKey && config.apiKey !== 'dev_mock_key';
    } catch (error) {
      return false;
    }
  }

  // 获取语音转写配置
  async getSpeechConfig() {
    const config = await this.getConfig('qwen_speech');
    
    if (!config) {
      throw new Error('语音转写配置不存在');
    }
    
    if (!config.enabled) {
      throw new Error('语音转写功能未启用');
    }
    
    if (!config.apiKey || config.apiKey === 'dev_mock_key') {
      throw new Error('语音转写API密钥未配置');
    }
    
    return config;
  }

  // 更新配置
  async updateConfig(apiName, newConfig) {
    await this.init();
    
    const existingConfig = this.configs.get(apiName) || {};
    const updatedConfig = { ...existingConfig, ...newConfig };
    
    this.configs.set(apiName, updatedConfig);
    this.cacheConfigs();
    
    console.log(`API配置已更新: ${apiName}`);
  }

  // 重新加载配置
  async reload() {
    this.initialized = false;
    this.initPromise = null;
    this.configs.clear();
    
    return this.init();
  }

  // 获取配置统计信息
  getStats() {
    return {
      initialized: this.initialized,
      configCount: this.configs.size,
      configs: Array.from(this.configs.keys()),
      timestamp: Date.now()
    };
  }

  // 验证API配置完整性
  validateConfig(apiName) {
    const config = this.configs.get(apiName);
    
    if (!config) {
      return { valid: false, error: '配置不存在' };
    }
    
    if (apiName === 'qwen_speech') {
      const required = ['apiKey', 'apiUrl', 'model'];
      const missing = required.filter(key => !config[key]);
      
      if (missing.length > 0) {
        return { valid: false, error: `缺少必需配置: ${missing.join(', ')}` };
      }
      
      if (config.apiKey === 'dev_mock_key' && config.enabled) {
        return { valid: false, error: '开发环境密钥不能用于生产环境' };
      }
    }
    
    return { valid: true };
  }

  // 清除配置缓存
  clearCache() {
    try {
      wx.removeStorageSync('api_configs');
      console.log('API配置缓存已清除');
    } catch (error) {
      console.warn('清除API配置缓存失败:', error);
    }
  }
}

// 创建全局单例
const apiConfigManager = new ApiConfigManager();

module.exports = apiConfigManager;