Page({
  data: {
    weekStartDay: 0, // 0: 周日, 1: 周一
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dinnerStart: '18:00',
    dinnerEnd: '18:30'
  },

  onShow() {
    const s = wx.getStorageSync('appSettings');
    if (s) {
      // 兼容旧数据，如果没有设置过weekStartDay，默认为0
      this.setData({
        weekStartDay: s.weekStartDay !== undefined ? s.weekStartDay : 0,
        lunchStart: s.lunchStart || '12:00',
        lunchEnd: s.lunchEnd || '13:00',
        dinnerStart: s.dinnerStart || '18:00',
        dinnerEnd: s.dinnerEnd || '18:30'
      });
    }
  },

  bindChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  // 新增：起始日改变
  bindWeekStartChange(e) {
    this.setData({ weekStartDay: parseInt(e.detail.value) });
  },

  saveSettings() {
    const { weekStartDay, lunchStart, lunchEnd, dinnerStart, dinnerEnd } = this.data;
    wx.setStorageSync('appSettings', {
      weekStartDay, lunchStart, lunchEnd, dinnerStart, dinnerEnd
    });
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  }
});