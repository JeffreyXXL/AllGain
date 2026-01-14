const db = wx.cloud.database();

Page({
  data: {
    totalOvertime: 0,
    totalOff: 0,
    balance: 0,
    balanceStr: '',
    isPositive: true,
    
    fullList: [],
    groupedList: [],
    filterType: 'all'
  },

  onShow() {
    this.calculateStats();
  },
  
  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  calculateStats() {
    wx.showLoading({ title: '加载统计...' });
    
    db.collection('work_records').limit(1000).get().then(res => {
      const list = res.data;
      
      let ot = 0;
      let off = 0;

      list.forEach(item => {
        // 初始化位置信息
        item.x = 0;

        if (item.type === 'overtime') {
          ot += item.hours;
        } else {
          off += item.hours;
        }
      });

      const balance = ot - off;
      const isPositive = balance >= 0;
      const absBalance = Math.abs(balance);
      const days = Math.floor(absBalance / 8);
      const hours = (absBalance % 8).toFixed(1);
      
      let balanceStr = `${days}天 ${hours}小时`;
      if (days === 0) balanceStr = `${hours}小时`;

      // === 核心：确保最新日期的内容在最上面 ===
      list.sort((a, b) => new Date(b.date) - new Date(a.date));

      this.setData({
        totalOvertime: ot.toFixed(1),
        totalOff: off.toFixed(1),
        balance: balance.toFixed(1),
        balanceStr,
        isPositive,
        fullList: list
      });

      this.applyFilter();
      wx.hideLoading();
      
    }).catch(err => {
      console.error(err);
      wx.hideLoading();
    });
  },

  toggleFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ 
      filterType: (this.data.filterType === type) ? 'all' : type 
    });
    this.applyFilter();
  },

  applyFilter() {
    const { fullList, filterType } = this.data;
    let filtered = fullList;
    if (filterType !== 'all') {
      filtered = fullList.filter(item => item.type === filterType);
    }

    // 分组
    const groups = {};
    filtered.forEach(item => {
      const [y, m, d] = item.date.split('-');
      const key = `${y}年${m}月`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    // 组名按时间倒序
    const groupedArr = Object.keys(groups).map(key => ({
      title: key,
      // 组内 items 已经因为 fullList 是倒序的而保持倒序
      items: groups[key]
    })).sort((a, b) => b.title.localeCompare(a.title));

    this.setData({ groupedList: groupedArr });
  },

  // === 1. 监听滑动事件，同步 x 值到数据层 (不触发重绘) ===
  onSwipeChange(e) {
    const id = e.currentTarget.dataset.id;
    const x = e.detail.x;
    
    // 直接修改内存中的数据，以便后续 reset 时能进行 diff
    const { groupedList } = this.data;
    for (let group of groupedList) {
      for (let item of group.items) {
        if (item._id === id) {
          item.x = x;
          return;
        }
      }
    }
  },

  // === 2. 触摸某个 Item 时，关闭其他已打开的项 ===
  onTouchItem(e) {
    const id = e.currentTarget.dataset.id;
    this.resetAllSwipes(id); // 排除当前这个，重置其他的
  },

  // === 3. 点击空白处，关闭所有 ===
  onTapContainer() {
    this.resetAllSwipes();
  },

  // === 4. 上下滑动页面时，关闭所有 ===
  onPageScroll() {
    // 加一个简单的防抖或直接调用（如果性能ok）
    this.resetAllSwipes();
  },

  // === 核心复位逻辑 ===
  resetAllSwipes(excludeId = null) {
    const { groupedList } = this.data;
    let hasChange = false;

    // 遍历检查是否有需要归位的项
    const newList = groupedList.map(group => {
      const newItems = group.items.map(item => {
        // 如果 x 偏移量小于 -5 (说明被滑开了)，且不是当前正在操作的项
        if (item.x < -5 && item._id !== excludeId) {
          hasChange = true;
          return { ...item, x: 0 }; // 强制设为 0
        }
        return item;
      });
      return { ...group, items: newItems };
    });

    // 只有确实有变化才 setData，减少渲染消耗
    if (hasChange) {
      this.setData({ groupedList: newList });
    }
  },

  handleDelete(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;

    wx.showModal({
      title: '删除记录',
      content: '确定要删除这条记录吗？',
      success(res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          db.collection('work_records').doc(id).remove().then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            that.calculateStats(); // 重新加载数据
          });
        } else {
            // 如果取消删除，也可以选择复位
            that.resetAllSwipes();
        }
      }
    });
  }
});