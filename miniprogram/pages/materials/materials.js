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

      // TODO: Fix API call - app.api is undefined
      // const response = await app.api.get('/materials/list', { params })
      
      // Mock data with search and filter support
      let allMaterials = [
        {
          id: 1,
          title: "申论写作技巧大全",
          summary: "掌握申论写作的核心要点和高分技巧",
          url: "https://mp.weixin.qq.com/s/example1",
          category: "答题技巧",
          type: "document"
        },
        {
          id: 2,
          title: "2024国考真题解析",
          summary: "深度解析2024年国考申论真题，提炼考试要点",
          url: "https://mp.weixin.qq.com/s/example2",
          category: "真题解析", 
          type: "link"
        },
        {
          id: 3,
          title: "面试常见问题及回答技巧",
          summary: "面试高频问题汇总及标准答题思路",
          url: "https://mp.weixin.qq.com/s/example3",
          category: "面试指导",
          type: "link"
        },
        {
          id: 4,
          title: "时政热点分析",
          summary: "每日时政热点解读，把握申论命题方向",
          url: "https://mp.weixin.qq.com/s/example4",
          category: "热点分析",
          type: "link"
        },
        {
          id: 5,
          title: "申论理论基础知识",
          summary: "申论考试必备的理论知识体系梳理",
          url: "https://mp.weixin.qq.com/s/example5",
          category: "理论基础",
          type: "document"
        }
      ]

      // Apply search filter
      if (keyword && keyword.trim()) {
        allMaterials = allMaterials.filter(material => 
          material.title.includes(keyword) || 
          material.summary.includes(keyword)
        )
      }

      // Apply category filter
      if (selectedCategory && selectedCategory !== '') {
        allMaterials = allMaterials.filter(material => 
          material.category === selectedCategory
        )
      }

      // Apply type filter
      if (selectedType && selectedType !== '') {
        allMaterials = allMaterials.filter(material => 
          material.type === selectedType
        )
      }

      const mockMaterials = allMaterials

      // if (response.code === 0) {
      //   const { materials, total, has_next } = response.data
        
        this.setData({
          materials: refresh ? mockMaterials : [...this.data.materials, ...mockMaterials],
          hasMore: false, // has_next,
          page: refresh ? 2 : page + 1
        })
      // } else {
      //   wx.showToast({
      //     title: response.msg || '加载失败',
      //     icon: 'error'
      //   })
      // }
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

  // 刷新资料状态（暂时不需要）
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

  // 点击资料卡片 - 跳转到网页链接
  viewMaterial(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      // 跳转到外部链接
      wx.navigateTo({
        url: `/pages/webview/webview?url=${encodeURIComponent(url)}`
      })
    }
  },

  // TODO: 收藏功能 - 暂时不需要
  // toggleCollect(e) {
  //   const materialId = e.currentTarget.dataset.id
  //   const isCollected = e.currentTarget.dataset.collected
  //   // 实现收藏逻辑
  // },

  // TODO: 点赞功能 - 暂时不需要  
  // toggleLike(e) {
  //   const materialId = e.currentTarget.dataset.id
  //   const isLiked = e.currentTarget.dataset.liked
  //   // 实现点赞逻辑
  // },

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