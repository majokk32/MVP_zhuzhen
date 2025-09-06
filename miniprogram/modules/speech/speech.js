// 语音转写服务模块
// 集成通义千问API进行语音转文字服务

class SpeechService {
  constructor() {
    this.configManager = require('../config/api-config');
    this.maxRetries = 3;
    this.config = null;
  }

  // 初始化API配置
  async initConfig() {
    try {
      this.config = await this.configManager.getSpeechConfig();
      console.log('语音API配置初始化完成');
      return this.config;
    } catch (error) {
      console.error('初始化语音API配置失败:', error);
      throw error;
    }
  }

  // 获取当前配置
  async getConfig() {
    if (!this.config) {
      await this.initConfig();
    }
    return this.config;
  }

  // 语音转写主方法
  async transcribeAudio(audioPath, options = {}) {
    try {
      console.log('开始语音转写:', audioPath);
      
      // 获取API配置
      const config = await this.getConfig();
      
      // 检查API是否可用
      if (config.mock || !config.enabled) {
        console.log('使用模拟转写服务');
        return this.getMockTranscription();
      }

      // 准备音频数据
      const audioData = await this.prepareAudioData(audioPath, config);
      
      // 调用通义千问API
      const transcription = await this.callQwenAPI(audioData, options, config);
      
      console.log('语音转写完成:', transcription);
      return transcription;
      
    } catch (error) {
      console.error('语音转写失败:', error);
      throw this.handleTranscriptionError(error);
    }
  }

  // 获取模拟转写结果
  getMockTranscription() {
    const mockTranscriptions = [
      '这位同学的作业完成得很好，字迹工整，思路清晰，继续保持！',
      '作业内容基本正确，但在细节处理上还需要加强，建议多做练习。',
      '很棒的作业！可以看出你认真思考了，希望继续努力。',
      '这次作业有进步，但还有提升空间，加油！',
      '作业完成质量不错，建议在解题步骤上更加详细。',
      '你的解题思路很清晰，表达也很准确，是一份优秀的作业。',
      '这次作业反映出你对知识点的理解还不够深入，建议复习相关内容。',
      '作业整体不错，但要注意格式的规范性和答案的完整性。'
    ];
    
    const randomIndex = Math.floor(Math.random() * mockTranscriptions.length);
    return mockTranscriptions[randomIndex];
  }

  // 准备音频数据
  async prepareAudioData(audioPath, config) {
    return new Promise((resolve, reject) => {
      try {
        // 获取音频文件信息
        wx.getFileInfo({
          filePath: audioPath,
          success: (fileInfo) => {
            console.log('音频文件信息:', fileInfo);
            
            // 检查文件大小限制
            const maxFileSize = config.maxFileSize || 10 * 1024 * 1024;
            if (fileInfo.size > maxFileSize) {
              reject(new Error(`音频文件过大，请控制在${Math.round(maxFileSize / 1024 / 1024)}MB以内`));
              return;
            }
            
            // 读取文件为base64
            wx.getFileSystemManager().readFile({
              filePath: audioPath,
              encoding: 'base64',
              success: (res) => {
                resolve({
                  audioBase64: res.data,
                  size: fileInfo.size,
                  filePath: audioPath
                });
              },
              fail: (error) => {
                console.error('读取音频文件失败:', error);
                reject(new Error('读取音频文件失败'));
              }
            });
          },
          fail: (error) => {
            console.error('获取文件信息失败:', error);
            reject(new Error('音频文件无效'));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 调用通义千问API
  async callQwenAPI(audioData, options = {}, config) {
    const retryCount = options.retryCount || 0;
    
    try {
      // 构建请求参数
      const requestData = {
        model: config.model || 'qwen-audio-turbo',
        input: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  audio: `data:audio/mp3;base64,${audioData.audioBase64}`
                },
                {
                  text: this.buildPromptText(options.context)
                }
              ]
            }
          ]
        },
        parameters: {
          result_format: 'message'
        }
      };

      console.log('调用通义千问API, 尝试次数:', retryCount + 1);

      // 发送HTTP请求
      const response = await this.sendHttpRequest(requestData, config);
      
      // 解析响应
      const transcription = this.parseApiResponse(response);
      
      if (!transcription || transcription.trim().length === 0) {
        throw new Error('转写结果为空');
      }
      
      return transcription;
      
    } catch (error) {
      console.error(`API调用失败 (尝试 ${retryCount + 1}/${this.maxRetries + 1}):`, error);
      
      // 自动重试机制
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        const delay = Math.pow(2, retryCount) * 1000; // 指数退避
        console.log(`${delay}ms后重试...`);
        
        await this.delay(delay);
        return this.callQwenAPI(audioData, { ...options, retryCount: retryCount + 1 }, config);
      }
      
      throw error;
    }
  }

  // 构建提示词
  buildPromptText(context) {
    const basePrompt = '请将这段音频转写为文字，保持语言自然流畅。';
    
    switch (context) {
      case 'grading_feedback':
        return basePrompt + '这是教师批改作业的评语，请确保用词准确、语气合适、表达专业。';
      case 'student_question':
        return basePrompt + '这是学生的提问，请准确转写问题内容。';
      case 'general':
      default:
        return basePrompt;
    }
  }

  // 发送HTTP请求
  sendHttpRequest(requestData, config) {
    return new Promise((resolve, reject) => {
      const requestTask = wx.request({
        url: config.apiUrl,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'X-DashScope-Async': 'enable'
        },
        data: requestData,
        timeout: config.timeout || 30000,
        success: (response) => {
          console.log('API响应:', response);
          
          if (response.statusCode === 200) {
            resolve(response.data);
          } else {
            const error = new Error(`HTTP ${response.statusCode}: ${response.data?.message || '请求失败'}`);
            error.statusCode = response.statusCode;
            error.responseData = response.data;
            reject(error);
          }
        },
        fail: (error) => {
          console.error('HTTP请求失败:', error);
          
          const apiError = new Error('网络请求失败');
          if (error.errMsg?.includes('timeout')) {
            apiError.message = '请求超时，请检查网络连接';
            apiError.code = 'TIMEOUT';
          } else if (error.errMsg?.includes('fail')) {
            apiError.message = '网络连接失败，请稍后重试';
            apiError.code = 'NETWORK_ERROR';
          }
          
          reject(apiError);
        }
      });

      // 设置请求超时
      setTimeout(() => {
        requestTask.abort();
        reject(new Error('请求超时'));
      }, config.timeout || 30000);
    });
  }

  // 解析API响应
  parseApiResponse(response) {
    try {
      if (!response || !response.output) {
        throw new Error('API响应格式无效');
      }

      // 处理同步响应
      if (response.output.choices && response.output.choices.length > 0) {
        const choice = response.output.choices[0];
        if (choice.message && choice.message.content) {
          return choice.message.content.trim();
        }
      }

      // 处理异步任务ID响应
      if (response.output.task_id) {
        return this.pollAsyncTask(response.output.task_id);
      }

      throw new Error('无法解析转写结果');
      
    } catch (error) {
      console.error('解析API响应失败:', error);
      throw error;
    }
  }

  // 轮询异步任务结果
  async pollAsyncTask(taskId) {
    const maxPolls = 30; // 最多轮询30次
    const pollInterval = 2000; // 2秒间隔
    
    for (let i = 0; i < maxPolls; i++) {
      try {
        await this.delay(pollInterval);
        
        const statusResponse = await this.checkTaskStatus(taskId);
        
        if (statusResponse.output.task_status === 'SUCCEEDED') {
          return this.extractTranscriptionFromResult(statusResponse);
        } else if (statusResponse.output.task_status === 'FAILED') {
          throw new Error(statusResponse.output.message || '异步任务失败');
        }
        
        console.log(`轮询任务状态 ${i + 1}/${maxPolls}: ${statusResponse.output.task_status}`);
        
      } catch (error) {
        console.error('轮询任务状态失败:', error);
        if (i === maxPolls - 1) throw error;
      }
    }
    
    throw new Error('任务处理超时');
  }

  // 检查异步任务状态
  checkTaskStatus(taskId) {
    return this.sendHttpRequest({
      model: 'qwen-audio-turbo',
      task_id: taskId
    });
  }

  // 从异步任务结果中提取转写文本
  extractTranscriptionFromResult(result) {
    if (result.output && result.output.choices && result.output.choices.length > 0) {
      const choice = result.output.choices[0];
      if (choice.message && choice.message.content) {
        return choice.message.content.trim();
      }
    }
    
    throw new Error('无法从任务结果中提取转写文本');
  }

  // 判断是否为可重试的错误
  isRetryableError(error) {
    // 网络错误、超时、服务器5xx错误可重试
    return error.code === 'TIMEOUT' ||
           error.code === 'NETWORK_ERROR' ||
           (error.statusCode && error.statusCode >= 500) ||
           error.message?.includes('timeout') ||
           error.message?.includes('网络');
  }

  // 处理转写错误，返回用户友好的错误信息
  handleTranscriptionError(error) {
    let userMessage = '语音转写失败';
    let errorCode = 'TRANSCRIPTION_ERROR';
    
    if (error.message?.includes('权限') || error.statusCode === 401) {
      userMessage = 'API权限验证失败';
      errorCode = 'AUTH_ERROR';
    } else if (error.message?.includes('超时') || error.code === 'TIMEOUT') {
      userMessage = '转写超时，请重试较短的录音';
      errorCode = 'TIMEOUT_ERROR';
    } else if (error.message?.includes('网络') || error.code === 'NETWORK_ERROR') {
      userMessage = '网络连接失败，请检查网络后重试';
      errorCode = 'NETWORK_ERROR';
    } else if (error.message?.includes('文件过大')) {
      userMessage = '录音文件过大，请控制在60秒以内';
      errorCode = 'FILE_TOO_LARGE';
    } else if (error.message?.includes('转写结果为空')) {
      userMessage = '未识别到语音内容，请重新录音';
      errorCode = 'NO_SPEECH_DETECTED';
    } else if (error.statusCode === 429) {
      userMessage = 'API调用频率过高，请稍后重试';
      errorCode = 'RATE_LIMIT_EXCEEDED';
    }
    
    const transcriptionError = new Error(userMessage);
    transcriptionError.code = errorCode;
    transcriptionError.originalError = error;
    
    return transcriptionError;
  }

  // 辅助方法：延时
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取API使用统计
  async getUsageStats() {
    try {
      const app = getApp();
      const response = await app.request({
        url: '/api/v1/statistics/speech-api-usage',
        method: 'GET',
        showError: false
      });
      
      return response.data || {};
    } catch (error) {
      console.warn('获取API使用统计失败:', error);
      return {};
    }
  }

  // 上报API使用情况
  async reportUsage(audioData, transcription, duration, success) {
    try {
      const app = getApp();
      await app.request({
        url: '/api/v1/statistics/speech-api-usage',
        method: 'POST',
        data: {
          fileSize: audioData.size,
          transcriptionLength: transcription?.length || 0,
          duration: duration,
          success: success,
          timestamp: Date.now()
        },
        showError: false
      });
    } catch (error) {
      console.warn('上报API使用统计失败:', error);
    }
  }
}

// 创建全局实例
const speechService = new SpeechService();

module.exports = speechService;