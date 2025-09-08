// 课后加餐资料页面
const app = getApp()

Page({
  data: {
    // 搜索和筛选
    keyword: '',
    selectedCategory: '',
    selectedType: '',
    sortBy: 'created_at',
    showFilterModal: false,
    
    // 列表数据
    materials: [],
    categories: ['理论基础', '真题解析', '答题技巧', '热点分析', '面试指导'],
    
    // 分页
    page: 1,
    hasMore: true,
    loading: false,
    
    // 选项配置
    typeMap: {
      video: '视频',
      audio: '音频', 
      document: '文档',
      image: '图片',
      link: '链接'
    },
    
    typeOptions: [
      { value: 'video', label: '视频' },
      { value: 'audio', label: '音频' },
      { value: 'document', label: '文档' },
      { value: 'image', label: '图片' },
      { value: 'link', label: '链接' }
    ],
    
    sortOptions: [
      { value: 'created_at', label: '最新发布' },
      { value: 'view_count', label: '浏览最多' },
      { value: 'like_count', label: '点赞最多' },
      { value: 'priority', label: '推荐优先' }
    ]
  },

  onLoad() {
    this.loadMaterials()
  },

  onShow() {
    // 页面显示时可能需要刷新收藏状态
    this.refreshMaterialsStatus()
  },

  onPullDownRefresh() {
    this.refreshData()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  // 加载资料列表
  async loadMaterials(refresh = false) {
    if (this.data.loading) return

    this.setData({ loading: true })

    const { keyword, selectedCategory, selectedType, sortBy } = this.data
    const page = refresh ? 1 : this.data.page

    try {
      const params = {
        page,
        per_page: 20,
        sort_by: sortBy,
        sort_order: 'desc'
      }

      if (keyword) params.keyword = keyword
      if (selectedCategory) params.category = selectedCategory
      if (selectedType) params.material_type = selectedType

      const response = await app.api.get('/materials/list', { params })

      if (response.code === 0) {
        const { materials, total, has_next } = response.data
        
        this.setData({
          materials: refresh ? materials : [...this.data.materials, ...materials],
          hasMore: has_next,
          page: refresh ? 2 : page + 1
        })
      } else {
        wx.showToast({
          title: response.msg || '加载失败',
          icon: 'error'
        })
      }
    } catch (error) {
      console.error('加载资料列表失败:', error)
      wx.showToast({
        title: '网络错误',
        icon: 'error'
      })
    } finally {
      this.setData({ loading: false })
      if (wx.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    }
  },

  // 刷新数据
  refreshData() {
    this.loadMaterials(true)
  },

  // 加载更多
  loadMore() {
    this.loadMaterials()
  },

  // 刷新资料状态（收藏、点赞）
  refreshMaterialsStatus() {
    // 这里可以实现局部刷新逻辑，避免重新加载整个列表
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      keyword: e.detail.value
    })
  },

  // 执行搜索
  onSearch() {
    this.refreshData()
  },

  // 选择分类
  selectCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      selectedCategory: category
    })
    this.refreshData()
  },

  // 查看资料详情
  viewMaterial(e) {
    const materialId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/material-detail/material-detail?id=${materialId}`
    })
  },

  // 切换收藏状态
  async toggleCollect(e) {
    const materialId = e.currentTarget.dataset.id
    const isCollected = e.currentTarget.dataset.collected

    try {
      let response
      if (isCollected) {
        response = await app.api.delete(`/materials/collect/${materialId}`)
      } else {
        response = await app.api.post('/materials/collect', {
          material_id: materialId
        })
      }

      if (response.code === 0) {
        // 更新本地状态
        const materials = this.data.materials.map(material => {
          if (material.id === materialId) {
            return {
              ...material,
              is_collected: !isCollected
            }
          }
          return material
        })

        this.setData({ materials })

        wx.showToast({
          title: isCollected ? '已取消收藏' : '收藏成功',
          icon: 'success'
        })
      } else {
        throw new Error(response.msg)
      }
    } catch (error) {
      console.error('收藏操作失败:', error)
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      })
    }
  },

  // 切换点赞状态
  async toggleLike(e) {
    const materialId = e.currentTarget.dataset.id
    const isLiked = e.currentTarget.dataset.liked

    try {
      const response = await app.api.post(`/materials/like/${materialId}`)

      if (response.code === 0) {
        // 更新本地状态
        const materials = this.data.materials.map(material => {
          if (material.id === materialId) {
            return {
              ...material,
              is_liked: !isLiked,
              like_count: isLiked ? material.like_count - 1 : material.like_count + 1
            }
          }
          return material
        })

        this.setData({ materials })

        wx.showToast({
          title: response.msg,
          icon: 'success'
        })
      } else {
        throw new Error(response.msg)
      }
    } catch (error) {
      console.error('点赞操作失败:', error)
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      })
    }
  },

  // 显示筛选弹窗
  showFilter() {
    this.setData({
      showFilterModal: true
    })
  },

  // 隐藏筛选弹窗
  hideFilter() {
    this.setData({
      showFilterModal: false
    })
  },

  // 选择资料类型
  selectType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      selectedType: type
    })
  },

  // 选择排序方式
  selectSort(e) {
    const sort = e.currentTarget.dataset.sort
    this.setData({
      sortBy: sort
    })
  },

  // 重置筛选条件
  resetFilter() {
    this.setData({
      selectedType: '',
      sortBy: 'created_at'
    })
  },

  // 应用筛选条件
  applyFilter() {
    this.hideFilter()
    this.refreshData()
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 阻止事件冒泡
  },

  // 获取默认缩略图
  getDefaultThumbnail(type) {
    const thumbnailMap = {
      video: '/images/default-video.png',
      audio: '/images/default-audio.png', 
      document: '/images/default-document.png',
      image: '/images/default-image.png',
      link: '/images/default-link.png'
    }
    return thumbnailMap[type] || '/images/default-material.png'
  },

  // 格式化时长
  formatDuration(seconds) {
    if (!seconds) return ''
    
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`
    }
  },

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return ''
    
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = now - date
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return '今天'
    } else if (diffDays === 1) {
      return '昨天'
    } else if (diffDays < 7) {
      return `${diffDays}天前`
    } else {
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const day = date.getDate().toString().padStart(2, '0')
      return `${month}-${day}`
    }
  }
})