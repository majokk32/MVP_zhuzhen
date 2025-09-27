/**
 * 虚拟滚动列表组件 - Phase 2 性能优化
 * 专为任务列表长列表性能优化设计
 * 
 * 特性:
 * - 虚拟滚动减少DOM节点数量
 * - 自适应item高度计算
 * - 预渲染和回收机制
 * - 平滑滚动体验
 * - 兼容小程序scroll-view
 */

Component({
  properties: {
    // 数据源
    items: {
      type: Array,
      value: [],
      observer: 'onItemsChange'
    },
    // 预估item高度（rpx）
    estimatedItemHeight: {
      type: Number,
      value: 200
    },
    // 可视区域外预渲染的item数量
    overscan: {
      type: Number,
      value: 3
    },
    // 容器高度（rpx）
    height: {
      type: Number,
      value: 1000
    },
    // 是否启用下拉刷新
    refresherEnabled: {
      type: Boolean,
      value: true
    },
    // 刷新状态
    refreshing: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 虚拟滚动状态
    scrollTop: 0,
    containerHeight: 1000,
    
    // 渲染相关
    visibleItems: [],      // 当前可见的items
    startIndex: 0,         // 可见范围开始索引
    endIndex: 0,          // 可见范围结束索引
    
    // 高度缓存
    itemHeights: {},       // 每个item的实际高度缓存
    totalHeight: 0,        // 总高度
    offsetY: 0,           // 顶部偏移量
    
    // 性能优化
    isScrolling: false,    // 是否正在滚动
    scrollTimer: null,     // 滚动定时器
    
    // 渲染优化
    renderBatch: 10,       // 批次渲染数量
    isUpdating: false      // 是否正在更新
  },

  lifetimes: {
    attached() {
      this.initVirtualList();
    },
    
    detached() {
      // 清理定时器
      if (this.data.scrollTimer) {
        clearTimeout(this.data.scrollTimer);
      }
    }
  },

  methods: {
    /**
     * 初始化虚拟列表
     */
    initVirtualList() {
      const { height, estimatedItemHeight } = this.properties;
      
      // 计算可视区域能显示的item数量
      const visibleCount = Math.ceil(height / estimatedItemHeight) + this.properties.overscan * 2;
      
      this.setData({
        containerHeight: height,
        visibleCount
      });
      
      // 初始化渲染
      this.updateVisibleItems();
    },

    /**
     * 数据变化时的处理
     */
    onItemsChange(newItems, oldItems) {
      if (!newItems || newItems.length === 0) {
        this.setData({
          visibleItems: [],
          totalHeight: 0,
          startIndex: 0,
          endIndex: 0
        });
        return;
      }

      // 如果是首次加载或全量更新
      if (!oldItems || oldItems.length === 0 || newItems.length < oldItems.length) {
        // 重新计算所有item高度
        this.recalculateHeights();
      } else if (newItems.length > oldItems.length) {
        // 增量更新，只计算新增item的高度
        this.calculateNewItemHeights(oldItems.length, newItems.length);
      }
      
      this.updateVisibleItems();
    },

    /**
     * 重新计算所有item高度
     */
    recalculateHeights() {
      const { items, estimatedItemHeight } = this.properties;
      const itemHeights = {};
      let totalHeight = 0;
      
      items.forEach((item, index) => {
        // 使用估算高度，实际高度会在渲染后更新
        const height = this.getItemHeight(item, index);
        itemHeights[index] = height;
        totalHeight += height;
      });
      
      this.setData({
        itemHeights,
        totalHeight
      });
    },

    /**
     * 计算新增item的高度
     */
    calculateNewItemHeights(startIndex, endIndex) {
      const { items } = this.properties;
      const { itemHeights } = this.data;
      let additionalHeight = 0;
      
      for (let i = startIndex; i < endIndex; i++) {
        if (!itemHeights[i]) {
          const height = this.getItemHeight(items[i], i);
          itemHeights[i] = height;
          additionalHeight += height;
        }
      }
      
      this.setData({
        itemHeights,
        totalHeight: this.data.totalHeight + additionalHeight
      });
    },

    /**
     * 获取item高度（可根据item内容动态计算）
     */
    getItemHeight(item, index) {
      const { estimatedItemHeight } = this.properties;
      
      // 根据任务卡片的特殊状态调整高度
      let height = estimatedItemHeight;
      
      
      // 有权限提示的卡片高度增加
      if (item.showPermissionBadge) {
        height += 15;
      }
      
      // 任务标题较长时增加高度
      if (item.title && item.title.length > 20) {
        height += Math.ceil((item.title.length - 20) / 10) * 10;
      }
      
      return height;
    },

    /**
     * 更新可见items
     */
    updateVisibleItems() {
      if (this.data.isUpdating) return;
      
      this.setData({ isUpdating: true });
      
      const { items, overscan } = this.properties;
      const { scrollTop, containerHeight, itemHeights } = this.data;
      
      if (!items || items.length === 0) {
        this.setData({ 
          visibleItems: [],
          isUpdating: false 
        });
        return;
      }
      
      // 计算可见范围
      const range = this.calculateVisibleRange(scrollTop, containerHeight, itemHeights);
      const { startIndex, endIndex, offsetY } = range;
      
      // 添加overscan
      const actualStartIndex = Math.max(0, startIndex - overscan);
      const actualEndIndex = Math.min(items.length - 1, endIndex + overscan);
      
      // 提取可见items
      const visibleItems = [];
      for (let i = actualStartIndex; i <= actualEndIndex; i++) {
        visibleItems.push({
          ...items[i],
          virtualIndex: i,
          virtualKey: `item-${i}-${items[i].id || i}` // 确保key的唯一性
        });
      }
      
      this.setData({
        visibleItems,
        startIndex: actualStartIndex,
        endIndex: actualEndIndex,
        offsetY,
        isUpdating: false
      });
    },

    /**
     * 计算可见范围
     */
    calculateVisibleRange(scrollTop, containerHeight, itemHeights) {
      const items = this.properties.items;
      let startIndex = 0;
      let endIndex = 0;
      let currentHeight = 0;
      let offsetY = 0;
      let found = false;
      
      // 查找开始索引
      for (let i = 0; i < items.length; i++) {
        const itemHeight = itemHeights[i] || this.properties.estimatedItemHeight;
        
        if (!found && currentHeight + itemHeight > scrollTop) {
          startIndex = i;
          offsetY = currentHeight;
          found = true;
        }
        
        if (found && currentHeight > scrollTop + containerHeight) {
          endIndex = i - 1;
          break;
        }
        
        currentHeight += itemHeight;
        
        if (i === items.length - 1) {
          endIndex = i;
        }
      }
      
      return { startIndex, endIndex, offsetY };
    },

    /**
     * 滚动事件处理
     */
    onScroll(e) {
      const { scrollTop } = e.detail;
      
      this.setData({
        scrollTop,
        isScrolling: true
      });
      
      // 清除之前的滚动定时器
      if (this.data.scrollTimer) {
        clearTimeout(this.data.scrollTimer);
      }
      
      // 防抖更新可见items
      const timer = setTimeout(() => {
        this.setData({ isScrolling: false });
        this.updateVisibleItems();
      }, 16); // 约60fps
      
      this.setData({ scrollTimer: timer });
      
      // 触发滚动事件给父组件
      this.triggerEvent('scroll', e.detail);
    },

    /**
     * 滚动到底部
     */
    onScrollToLower(e) {
      this.triggerEvent('scrolltolower', e.detail);
    },

    /**
     * 下拉刷新
     */
    onRefresherRefresh(e) {
      this.triggerEvent('refresherrefresh', e.detail);
    },

    /**
     * 滚动到指定索引
     */
    scrollToIndex(index, animated = true) {
      const { itemHeights } = this.data;
      let scrollTop = 0;
      
      for (let i = 0; i < index; i++) {
        scrollTop += itemHeights[i] || this.properties.estimatedItemHeight;
      }
      
      // 触发滚动
      this.setData({ scrollTop });
    },

    /**
     * 更新item的实际高度（渲染后调用）
     */
    updateItemHeight(index, height) {
      const { itemHeights, totalHeight } = this.data;
      const oldHeight = itemHeights[index] || this.properties.estimatedItemHeight;
      const heightDiff = height - oldHeight;
      
      // 更新高度缓存
      itemHeights[index] = height;
      
      this.setData({
        itemHeights,
        totalHeight: totalHeight + heightDiff
      });
      
      // 如果高度变化较大，重新计算可见范围
      if (Math.abs(heightDiff) > 10) {
        this.updateVisibleItems();
      }
    },

    /**
     * 获取渲染性能指标
     */
    getPerformanceMetrics() {
      const { items } = this.properties;
      const { visibleItems } = this.data;
      
      return {
        totalItems: items.length,
        visibleItems: visibleItems.length,
        renderRatio: items.length > 0 ? (visibleItems.length / items.length) : 0,
        memoryReduction: items.length > 0 ? (1 - visibleItems.length / items.length) : 0
      };
    }
  }
});