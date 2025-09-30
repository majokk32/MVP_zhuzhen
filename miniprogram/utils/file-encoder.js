/**
 * 文件编码工具 - 多文件上传编码解决方案
 * 将多个图片文件编码为单个请求数据
 */

class FileEncoder {
  /**
   * 将文件路径转换为base64编码
   * @param {string} filePath - 文件路径
   * @returns {Promise<string>} base64编码字符串
   */
  async fileToBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: filePath,
        encoding: 'base64',
        success: (res) => {
          resolve(res.data);
        },
        fail: (err) => {
          reject(new Error(`文件读取失败: ${err.errMsg || err}`));
        }
      });
    });
  }

  /**
   * 获取文件信息
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 文件信息
   */
  async getFileInfo(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().stat({
        path: filePath,
        success: (res) => {
          resolve({
            size: res.size,
            createTime: res.createTime,
            modifyTime: res.modifyTime
          });
        },
        fail: (err) => {
          reject(new Error(`获取文件信息失败: ${err.errMsg || err}`));
        }
      });
    });
  }

  /**
   * 编码多个文件为上传数据
   * @param {Array} files - 文件对象数组 [{path: string, name: string}, ...]
   * @returns {Promise<Object>} 编码后的上传数据
   */
  async encodeMultipleFiles(files) {
    try {
      console.log('📦 [ENCODER] 开始编码多个文件:', files.length);
      
      const encodedFiles = [];
      let totalSize = 0;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`📤 [ENCODER] 编码文件 ${i + 1}/${files.length}: ${file.name}`);
        
        // 获取文件信息
        const fileInfo = await this.getFileInfo(file.path);
        
        // 检查文件大小
        if (fileInfo.size > 10 * 1024 * 1024) {
          throw new Error(`文件 ${file.name} 超过10MB限制`);
        }
        
        // 读取并编码文件
        const base64Data = await this.fileToBase64(file.path);
        
        // 获取文件扩展名
        const ext = file.name.split('.').pop() || 'jpg';
        
        encodedFiles.push({
          filename: file.name,
          content: base64Data,
          size: fileInfo.size,
          extension: ext,
          index: i
        });
        
        totalSize += fileInfo.size;
      }
      
      console.log(`✅ [ENCODER] 编码完成: ${files.length}个文件, 总大小: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
      
      return {
        files: encodedFiles,
        totalSize: totalSize,
        fileCount: files.length,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error('❌ [ENCODER] 编码失败:', error);
      throw error;
    }
  }

  /**
   * 上传编码后的文件数据
   * @param {Object} encodedData - 编码后的数据
   * @param {number} taskId - 任务ID
   * @param {string} textContent - 文字内容
   * @returns {Promise<Object>} 上传结果
   */
  async uploadEncodedFiles(encodedData, taskId, textContent = '') {
    try {
      const app = getApp();
      console.log('🚀 [ENCODER] 开始上传编码数据:', {
        fileCount: encodedData.fileCount,
        totalSize: (encodedData.totalSize / 1024 / 1024).toFixed(2) + 'MB'
      });
      
      const result = await app.request({
        url: '/submissions/upload-encoded-files',
        method: 'POST',
        data: {
          task_id: taskId,
          text_content: textContent,
          encoded_files: encodedData.files,
          file_count: encodedData.fileCount,
          total_size: encodedData.totalSize
        }
      });
      
      console.log('✅ [ENCODER] 上传成功:', result);
      return result;
      
    } catch (error) {
      console.error('❌ [ENCODER] 上传失败:', error);
      throw error;
    }
  }
}

// 导出单例
const fileEncoder = new FileEncoder();
module.exports = fileEncoder;