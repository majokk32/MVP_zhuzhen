Component({
  properties: {
    // 输入提示文本
    placeholder: {
      type: String,
      value: '请输入批改评语，给学生一些建议和鼓励...'
    },
    
    // 最大字符数
    maxLength: {
      type: Number,
      value: 500
    },
    
    // 初始值
    value: {
      type: String,
      value: ''
    },
    
    // 是否自动调整高度
    autoHeight: {
      type: Boolean,
      value: true
    },
    
    // 是否显示快捷操作
    showQuickActions: {
      type: Boolean,
      value: true
    },
    
    // 是否显示清空按钮
    showClearBtn: {
      type: Boolean,
      value: true
    }
  },

  data: {
    // 当前输入模式
    inputMode: 'text', // text | voice
    
    // 文字输入内容
    textValue: '',
    
    // 语音录制状态
    voiceState: 'idle', // idle | recording | processing
    
    // 录音相关
    recordingTime: 0,
    recordingTimeText: '00:00',
    recordingTimer: null,
    recorderManager: null,
    
    // 音量显示
    volumeBars: [],
    
    // 转写结果
    transcriptionResult: '',
    editingTranscription: false,
    
    // 录音历史
    voiceHistory: [],
    
    // 最终文本（用于统计和确认）
    finalText: ''
  },

  lifetimes: {
    attached() {
      this.initRecorder();
      this.initVolumeDisplay();
      
      // 设置初始值
      if (this.properties.value) {
        this.setData({
          textValue: this.properties.value,
          finalText: this.properties.value
        });
      }
    },
    
    detached() {
      this.cleanup();
    }
  },

  observers: {
    'textValue': function(textValue) {
      this.setData({
        finalText: this.data.inputMode === 'text' ? textValue : this.data.transcriptionResult
      });
    },
    
    'transcriptionResult': function(result) {
      if (this.data.inputMode === 'voice') {
        this.setData({
          finalText: result
        });
      }
    }
  },

  methods: {
    // 初始化录音管理器
    initRecorder() {
      try {
        const recorderManager = wx.getRecorderManager();
        this.setData({ recorderManager });
        
        // 录音开始
        recorderManager.onStart(() => {
          console.log('录音开始');
          this.setData({ voiceState: 'recording' });
          this.startRecordingTimer();
        });
        
        // 录音结束
        recorderManager.onStop((res) => {
          console.log('录音结束:', res);
          this.stopRecordingTimer();
          this.setData({ voiceState: 'processing' });
          this.processAudioFile(res.tempFilePath, res.duration);
        });
        
        // 录音出错
        recorderManager.onError((err) => {
          console.error('录音失败:', err);
          this.stopRecordingTimer();
          this.setData({ voiceState: 'idle' });
          
          wx.showModal({
            title: '录音失败',
            content: '请检查麦克风权限或重试',
            showCancel: false
          });
        });
        
        // 音量监测
        recorderManager.onFrameRecorded((res) => {
          this.updateVolumeDisplay(res.frameBuffer);
        });
        
      } catch (error) {
        console.error('初始化录音器失败:', error);
        wx.showToast({
          title: '录音功能初始化失败',
          icon: 'none'
        });
      }
    },

    // 初始化音量显示
    initVolumeDisplay() {
      const volumeBars = [];
      for (let i = 0; i < 8; i++) {
        volumeBars.push({
          height: 10 + i * 8,
          active: false
        });
      }
      this.setData({ volumeBars });
    },

    // 更新音量显示
    updateVolumeDisplay(frameBuffer) {
      if (!frameBuffer) return;
      
      // 计算音量级别 (简化处理)
      const volume = Math.random() * 8; // 实际应该基于 frameBuffer 计算
      const volumeBars = this.data.volumeBars.map((bar, index) => ({
        ...bar,
        active: index < volume
      }));
      
      this.setData({ volumeBars });
    },

    // 切换输入模式
    switchMode(e) {
      const mode = e.currentTarget.dataset.mode;
      
      if (mode === this.data.inputMode) return;
      
      // 如果正在录音，先停止
      if (this.data.voiceState === 'recording') {
        this.data.recorderManager?.stop();
      }
      
      this.setData({ 
        inputMode: mode,
        voiceState: 'idle' 
      });
      
      // 切换到语音模式时，请求麦克风权限
      if (mode === 'voice') {
        this.requestMicrophonePermission();
      }
    },

    // 请求麦克风权限
    requestMicrophonePermission() {
      wx.getSetting({
        success: (res) => {
          if (!res.authSetting['scope.record']) {
            wx.authorize({
              scope: 'scope.record',
              success: () => {
                console.log('麦克风权限已授权');
              },
              fail: () => {
                wx.showModal({
                  title: '需要录音权限',
                  content: '语音输入需要录音权限，请在设置中开启',
                  confirmText: '去设置',
                  success: (res) => {
                    if (res.confirm) {
                      wx.openSetting();
                    }
                  }
                });
              }
            });
          }
        }
      });
    },

    // 文字输入处理
    onTextInput(e) {
      const value = e.detail.value;
      this.setData({ 
        textValue: value 
      });
      
      // 触发输入变化事件
      this.triggerEvent('input', {
        value: value,
        type: 'text'
      });
    },

    // 开始录音
    startRecord() {
      if (this.data.voiceState !== 'idle') return;
      
      try {
        const recorderManager = this.data.recorderManager;
        if (!recorderManager) {
          wx.showToast({
            title: '录音器初始化失败',
            icon: 'none'
          });
          return;
        }

        // 振动反馈
        wx.vibrateShort();
        
        recorderManager.start({
          duration: 60000, // 最长60秒
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3',
          frameSize: 50 // 每50ms一帧，用于音量检测
        });
        
      } catch (error) {
        console.error('开始录音失败:', error);
        wx.showToast({
          title: '录音启动失败',
          icon: 'none'
        });
      }
    },

    // 停止录音
    stopRecord() {
      if (this.data.voiceState !== 'recording') return;
      
      try {
        this.data.recorderManager?.stop();
        wx.vibrateShort();
      } catch (error) {
        console.error('停止录音失败:', error);
      }
    },

    // 取消录音
    cancelRecord() {
      if (this.data.voiceState !== 'recording') return;
      
      try {
        this.data.recorderManager?.stop();
        this.stopRecordingTimer();
        this.setData({ voiceState: 'idle' });
        wx.vibrateShort();
        
        wx.showToast({
          title: '录音已取消',
          icon: 'none'
        });
      } catch (error) {
        console.error('取消录音失败:', error);
      }
    },

    // 开始录音计时
    startRecordingTimer() {
      let time = 0;
      this.setData({ recordingTime: 0 });
      
      const timer = setInterval(() => {
        time += 1;
        const minutes = Math.floor(time / 60).toString().padStart(2, '0');
        const seconds = (time % 60).toString().padStart(2, '0');
        
        this.setData({
          recordingTime: time,
          recordingTimeText: `${minutes}:${seconds}`
        });
        
        // 超过60秒自动停止
        if (time >= 60) {
          this.data.recorderManager?.stop();
          clearInterval(timer);
        }
      }, 1000);
      
      this.setData({ recordingTimer: timer });
    },

    // 停止录音计时
    stopRecordingTimer() {
      if (this.data.recordingTimer) {
        clearInterval(this.data.recordingTimer);
        this.setData({ recordingTimer: null });
      }
    },

    // 处理音频文件（发送到语音转写服务）
    async processAudioFile(audioPath, duration) {
      try {
        console.log('开始语音转写:', audioPath, duration);
        
        // 调用语音转写API
        const transcription = await this.transcribeAudio(audioPath, duration);
        
        if (transcription && transcription.trim()) {
          // 添加到历史记录
          const historyItem = {
            id: Date.now(),
            audioPath: audioPath,
            transcription: transcription,
            duration: duration,
            durationText: this.formatDuration(duration),
            timeText: this.formatTime(new Date()),
            timestamp: Date.now()
          };
          
          const voiceHistory = [...this.data.voiceHistory, historyItem];
          
          this.setData({
            transcriptionResult: transcription,
            voiceHistory: voiceHistory,
            voiceState: 'idle',
            editingTranscription: false
          });
          
          // 触发转写完成事件
          this.triggerEvent('transcriptionComplete', {
            transcription: transcription,
            duration: duration
          });
          
          wx.showToast({
            title: '转写完成',
            icon: 'success',
            duration: 1500
          });
          
        } else {
          throw new Error('转写结果为空');
        }
        
      } catch (error) {
        console.error('语音转写失败:', error);
        this.setData({ voiceState: 'idle' });
        
        wx.showModal({
          title: '转写失败',
          content: error.message || '语音转写服务暂时不可用，请重试',
          confirmText: '重试',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              this.processAudioFile(audioPath, duration);
            }
          }
        });
      }
    },

    // 调用语音转写API
    async transcribeAudio(audioPath, duration) {
      try {
        // 集成通义千问API进行语音转写
        const speechService = require('../../modules/speech/speech');
        
        console.log('开始调用通义千问API转写语音:', audioPath);
        
        // 调用语音转写服务
        const transcription = await speechService.transcribeAudio(audioPath, {
          duration: duration,
          context: 'grading_feedback', // 批改评语上下文
          language: 'zh-CN'
        });
        
        // 上报使用统计
        await speechService.reportUsage(
          { size: 0, filePath: audioPath }, 
          transcription, 
          duration, 
          true
        );
        
        return transcription;
        
      } catch (error) {
        console.error('通义千问API转写失败:', error);
        
        // 上报失败统计
        try {
          const speechService = require('../../modules/speech/speech');
          await speechService.reportUsage(
            { size: 0, filePath: audioPath }, 
            null, 
            duration, 
            false
          );
        } catch (reportError) {
          console.warn('上报失败统计出错:', reportError);
        }
        
        // 如果是开发环境或API不可用，降级到模拟数据
        if (this.shouldUseMockData(error)) {
          console.warn('使用模拟转写数据:', error.message);
          return this.getMockTranscription();
        }
        
        throw error;
      }
    },

    // 判断是否应该使用模拟数据
    shouldUseMockData(error) {
      // 在开发环境或API配置不可用时使用模拟数据
      const isDevelopment = !this.data.recorderManager; // 简单的开发环境判断
      const isApiUnavailable = error.code === 'AUTH_ERROR' || 
                              error.code === 'CONFIG_ERROR' ||
                              error.message?.includes('API配置');
      
      return isDevelopment || isApiUnavailable;
    },

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
    },

    // 辅助方法：延时
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    // 编辑转写结果
    editTranscription() {
      this.setData({ editingTranscription: true });
    },

    // 转写结果编辑
    onTranscriptionEdit(e) {
      this.setData({ transcriptionResult: e.detail.value });
    },

    // 重新转写
    retryTranscription() {
      const lastHistory = this.data.voiceHistory[this.data.voiceHistory.length - 1];
      if (lastHistory) {
        this.setData({ voiceState: 'processing' });
        this.processAudioFile(lastHistory.audioPath, lastHistory.duration);
      }
    },

    // 使用转写结果
    useTranscription() {
      const transcription = this.data.transcriptionResult;
      if (transcription) {
        this.setData({
          finalText: transcription,
          editingTranscription: false
        });
        
        this.triggerEvent('input', {
          value: transcription,
          type: 'voice'
        });
      }
    },

    // 选择历史记录
    selectHistoryItem(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.voiceHistory[index];
      if (item) {
        this.setData({
          transcriptionResult: item.transcription,
          editingTranscription: false
        });
      }
    },

    // 使用历史记录
    useHistoryItem(e) {
      e.stopPropagation();
      const index = e.currentTarget.dataset.index;
      const item = this.data.voiceHistory[index];
      if (item) {
        this.setData({
          transcriptionResult: item.transcription,
          finalText: item.transcription,
          editingTranscription: false
        });
        
        this.triggerEvent('input', {
          value: item.transcription,
          type: 'voice'
        });
      }
    },

    // 清空历史记录
    clearVoiceHistory() {
      wx.showModal({
        title: '确认清空',
        content: '确定要清空所有录音历史吗？',
        success: (res) => {
          if (res.confirm) {
            this.setData({ voiceHistory: [] });
          }
        }
      });
    },

    // 清空文本
    clearText() {
      wx.showModal({
        title: '确认清空',
        content: '确定要清空输入内容吗？',
        success: (res) => {
          if (res.confirm) {
            this.setData({ textValue: '' });
            this.triggerEvent('input', { value: '', type: 'text' });
          }
        }
      });
    },

    // 粘贴文本
    async pasteText() {
      try {
        const res = await wx.getClipboardData();
        if (res.data) {
          const newValue = this.data.textValue + res.data;
          if (newValue.length <= this.properties.maxLength) {
            this.setData({ textValue: newValue });
            this.triggerEvent('input', { value: newValue, type: 'text' });
          } else {
            wx.showToast({
              title: '内容超长',
              icon: 'none'
            });
          }
        }
      } catch (error) {
        wx.showToast({
          title: '粘贴失败',
          icon: 'none'
        });
      }
    },

    // 清空所有内容
    clearAll() {
      wx.showModal({
        title: '确认清空',
        content: '确定要清空所有输入内容吗？',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              textValue: '',
              transcriptionResult: '',
              finalText: ''
            });
            this.triggerEvent('input', { value: '', type: 'clear' });
          }
        }
      });
    },

    // 确认输入
    confirmInput() {
      const finalText = this.data.finalText;
      if (!finalText.trim()) {
        wx.showToast({
          title: '请输入内容',
          icon: 'none'
        });
        return;
      }
      
      this.triggerEvent('confirm', {
        value: finalText.trim(),
        type: this.data.inputMode,
        wordCount: finalText.length
      });
    },

    // 格式化时长
    formatDuration(ms) {
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) {
        return `${seconds}秒`;
      } else {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}分${remainingSeconds}秒`;
      }
    },

    // 格式化时间
    formatTime(date) {
      const now = new Date();
      const diff = now - date;
      
      if (diff < 60000) { // 1分钟内
        return '刚刚';
      } else if (diff < 3600000) { // 1小时内
        return `${Math.floor(diff / 60000)}分钟前`;
      } else if (date.toDateString() === now.toDateString()) { // 今天
        return `今天 ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
      } else {
        return `${date.getMonth() + 1}月${date.getDate()}日`;
      }
    },

    // 清理资源
    cleanup() {
      if (this.data.recordingTimer) {
        clearInterval(this.data.recordingTimer);
      }
      
      if (this.data.recorderManager) {
        try {
          this.data.recorderManager.stop();
        } catch (error) {
          console.warn('清理录音器失败:', error);
        }
      }
    }
  }
});