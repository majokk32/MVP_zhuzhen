/**
 * TabBar动态管理工具
 * 根据用户角色动态显示/隐藏教研入口
 */

// TabBar配置 - 简化版本，不依赖图标文件
const TAB_CONFIGS = {
  // 学生端TabBar
  student: [
    {
      pagePath: "pages/index/index",
      text: "任务"
    },
    {
      pagePath: "pages/profile/profile", 
      text: "我的"
    }
  ],
  
  // 教师端TabBar（包含教研）
  teacher: [
    {
      pagePath: "pages/index/index",
      text: "任务"
    },
    {
      pagePath: "pages/admin/teacher-center/teacher-center",
      text: "教研"
    },
    {
      pagePath: "pages/profile/profile",
      text: "我的"
    }
  ]
}

/**
 * 根据用户角色设置TabBar (简化版本)
 * @param {string} userRole - 用户角色 'student' 或 'teacher'
 */
function setTabBarByRole(userRole = 'student') {
  try {
    // 所有用户都显示教研Tab，通过页面权限控制访问
    wx.setTabBarItem({
      index: 1,
      text: '教研',
      pagePath: 'pages/admin/teacher-center/teacher-center'
    })
    
    console.log(`TabBar设置完成，用户角色：${userRole}`)
    
  } catch (error) {
    console.error('设置TabBar失败:', error)
  }
}

/**
 * 初始化TabBar
 * 在app启动时调用，根据用户登录状态设置TabBar
 */
function initTabBar() {
  const app = getApp()
  
  // 如果用户已登录且是教师，设置教师TabBar
  if (app.globalData.isLogin && app.globalData.isTeacher) {
    setTabBarByRole('teacher')
  } else {
    setTabBarByRole('student')
  }
}

/**
 * 处理用户角色变化
 * 当用户登录或角色发生变化时调用
 */
function handleRoleChange() {
  const app = getApp()
  const userRole = app.globalData.isTeacher ? 'teacher' : 'student'
  
  console.log('handleRoleChange - isTeacher:', app.globalData.isTeacher)
  console.log('handleRoleChange - userRole:', userRole)
  console.log('handleRoleChange - userInfo.role:', app.globalData.userInfo?.role)
  
  // 更新TabBar
  setTabBarByRole(userRole)
}

module.exports = {
  setTabBarByRole,
  initTabBar,
  handleRoleChange,
  TAB_CONFIGS
}