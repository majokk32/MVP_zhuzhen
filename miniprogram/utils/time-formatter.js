/**
 * 时间格式化工具
 * 将各种时间格式转换为统一的显示格式：YYYY-MM-DD HH:mm
 * 使用中国时间 (UTC+8) 作为标准时间
 */

/**
 * 获取中国时间 (UTC+8)
 * @returns {Date} 中国时区的当前时间
 */
function getChinaTime() {
  const now = new Date()
  // 获取UTC时间，然后加上8小时得到中国时间
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
  const chinaTime = new Date(utc + (8 * 3600000))
  return chinaTime
}

/**
 * 格式化时间为 YYYY-MM-DD HH:mm 格式
 * @param {string|Date} dateInput - 时间字符串或Date对象
 * @returns {string} 格式化后的时间字符串
 */
function formatDateTime(dateInput) {
  if (!dateInput) return ''
  
  let date
  if (typeof dateInput === 'string') {
    // 处理各种时间字符串格式
    date = new Date(dateInput)
  } else if (dateInput instanceof Date) {
    date = dateInput
  } else {
    return ''
  }
  
  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    return ''
  }
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

/**
 * 格式化日期为 YYYY-MM-DD 格式
 * @param {string|Date} dateInput - 时间字符串或Date对象
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(dateInput) {
  if (!dateInput) return ''
  
  let date
  if (typeof dateInput === 'string') {
    date = new Date(dateInput)
  } else if (dateInput instanceof Date) {
    date = dateInput
  } else {
    return ''
  }
  
  if (isNaN(date.getTime())) {
    return ''
  }
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

/**
 * 计算距离截止时间的相对时间
 * @param {string|Date} deadlineInput - 截止时间
 * @returns {string} 相对时间描述
 */
function getRelativeTime(deadlineInput) {
  if (!deadlineInput) return ''
  
  let deadline
  if (typeof deadlineInput === 'string') {
    deadline = new Date(deadlineInput)
  } else if (deadlineInput instanceof Date) {
    deadline = deadlineInput
  } else {
    return ''
  }
  
  if (isNaN(deadline.getTime())) {
    return ''
  }
  
  const now = getChinaTime()
  const diffMs = deadline.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))
  
  if (diffDays > 1) {
    return `还剩${diffDays}天`
  } else if (diffDays === 1) {
    return '还剩1天'
  } else if (diffDays === 0 && diffHours > 0) {
    return `还剩${diffHours}小时`
  } else if (diffDays === 0 && diffHours === 0) {
    const diffMinutes = Math.ceil(diffMs / (1000 * 60))
    if (diffMinutes > 0) {
      return `还剩${diffMinutes}分钟`
    } else {
      return '已截止'
    }
  } else {
    const overdueDays = Math.abs(diffDays)
    return overdueDays > 1 ? `已截止${overdueDays}天` : '已截止'
  }
}

module.exports = {
  formatDateTime,
  formatDate,
  getRelativeTime,
  getChinaTime
}