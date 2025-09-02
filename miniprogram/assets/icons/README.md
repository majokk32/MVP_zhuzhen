# 图标文件说明

由于微信小程序的tabBar图标必须是本地文件，这里需要放置以下图标文件：

## 必需的图标文件
- home.png - 首页图标（未选中）
- home-active.png - 首页图标（选中）
- user.png - 个人中心图标（未选中）
- user-active.png - 个人中心图标（选中）

## 图标规格
- 尺寸：81px × 81px
- 格式：PNG
- 建议：使用透明背景

## 临时解决方案
可以先创建纯色的占位图标，或者从以下网站下载免费图标：
- https://www.iconfont.cn/
- https://icons8.com/
- https://www.flaticon.com/

## 生成占位图标
由于无法直接生成PNG文件，您可以：
1. 使用在线工具创建简单的色块图标
2. 或者暂时移除tabBar配置，使用普通页面导航