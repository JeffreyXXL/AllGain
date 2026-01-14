const db = wx.cloud.database();

Page({
  data: {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    days: [],
    emptyGrids: [],
    weekDays: ['日','一','二','三','四','五','六'],
    weekStartDay: 0, 

    modalHidden: true,
    
    selectedDate: '',
    selectedDateStr: '',
    currentDayRecord: null,
    todayKey: '', 

    currentType: 'overtime',
    currentHours: '',
    startTime: '18:00',
    endTime: '20:00',

    cloudRecordsMap: {}, 
    
    touchStartX: 0,
    touchStartY: 0, 
    animationData: {}, 

    currentMonthOt: 0,
    currentMonthOff: 0,
    currentMonthNet: 0
  },

  onShow() {
    this.initDate();
    this.fetchCloudData(); 
  },

  initDate() {
    if (!this.data.todayKey) {
      const now = new Date();
      const tYear = now.getFullYear();
      const tMonth = now.getMonth();
      const tDay = now.getDate();
      const todayKey = `${tYear}-${tMonth + 1}-${tDay}`;
      
      this.setData({
        year: tYear,
        month: tMonth,
        todayKey: todayKey,
        selectedDate: todayKey, 
        selectedDateStr: `${tYear}年${tMonth + 1}月${tDay}日`,
      });
    }
  },
  
  bindDateChange(e) {
    const val = e.detail.value;
    const [y, m] = val.split('-');
    this.setData({
      year: parseInt(y),
      month: parseInt(m) - 1,
      selectedDate: '',
      selectedDateStr: '',
      currentDayRecord: null
    });
    this.fetchCloudData();
  },

  runSwitchAnimation(direction) {
    const animation = wx.createAnimation({ duration: 200, timingFunction: 'ease-out' });
    animation.translateX(direction === 1 ? '-100%' : '100%').opacity(0).step();
    this.setData({ animationData: animation.export() });

    setTimeout(() => {
      if (direction === 1) this.realNextMonth();
      else this.realPrevMonth();

      this.setData({
        selectedDate: '', 
        selectedDateStr: '', 
        currentDayRecord: null
      });

      const resetAnimation = wx.createAnimation({ duration: 0 });
      resetAnimation.translateX(direction === 1 ? '100%' : '-100%').step();
      this.setData({ animationData: resetAnimation.export() });

      setTimeout(() => {
        const showAnimation = wx.createAnimation({ duration: 200, timingFunction: 'ease-out' });
        showAnimation.translateX(0).opacity(1).step();
        this.setData({ animationData: showAnimation.export() });
      }, 50);
    }, 200);
  },

  realPrevMonth() {
    let { year, month } = this.data;
    if (month === 0) { year--; month = 11; } else { month--; }
    this.setData({ year, month });
    this.fetchCloudData();
  },

  realNextMonth() {
    let { year, month } = this.data;
    if (month === 11) { year++; month = 0; } else { month++; }
    this.setData({ year, month });
    this.fetchCloudData();
  },

  prevMonth() { this.runSwitchAnimation(-1); },
  nextMonth() { this.runSwitchAnimation(1); },

  touchStart(e) {
    this.setData({ 
      touchStartX: e.changedTouches[0].clientX,
      touchStartY: e.changedTouches[0].clientY
    });
  },
  touchEnd(e) {
    let startX = this.data.touchStartX;
    let startY = this.data.touchStartY;
    let endX = e.changedTouches[0].clientX;
    let endY = e.changedTouches[0].clientY;
    
    const diffX = endX - startX;
    const diffY = endY - startY;

    if (Math.abs(diffX) > 50 && Math.abs(diffY) < 50) {
      if (diffX < 0) this.nextMonth(); 
      else this.prevMonth();
    }
  },

  fetchCloudData() {
    wx.showLoading({ title: '加载中...' });
    const { year, month } = this.data;
    const realMonth = month + 1;
    const padM = realMonth < 10 ? '0' + realMonth : realMonth;
    const holidayRegex = `^${year}-${padM}-`;
    const recordRegex = `^${year}-${realMonth}-`;

    const recordsPromise = db.collection('work_records').where({
      date: db.RegExp({ regexp: recordRegex, options: 'i' })
    }).limit(100).get();

    const holidaysPromise = db.collection('holidays').where({
      date: db.RegExp({ regexp: holidayRegex, options: 'i' })
    }).limit(100).get();

    Promise.all([recordsPromise, holidaysPromise]).then(res => {
      const recordsList = res[0].data;
      const holidaysList = res[1].data;

      const rMap = {};
      recordsList.forEach(item => { rMap[item.date] = item; });
      const hMap = {};
      holidaysList.forEach(item => { hMap[item.date] = item; });

      this.setData({ cloudRecordsMap: rMap, holidaysMap: hMap });
      this.renderCalendar();

      if(this.data.selectedDate) {
        this.setData({ currentDayRecord: rMap[this.data.selectedDate] || null });
      }
      wx.hideLoading();
    }).catch(err => {
      console.error(err);
      wx.hideLoading();
    });
  },

  goToday() {
    const now = new Date();
    const tYear = now.getFullYear();
    const tMonth = now.getMonth();
    const tDay = now.getDate();
    const todayKey = `${tYear}-${tMonth + 1}-${tDay}`;
    
    this.setData({
      year: tYear,
      month: tMonth,
      selectedDate: todayKey,
      selectedDateStr: `${tYear}年${tMonth + 1}月${tDay}日`,
      currentDayRecord: null 
    });
    this.fetchCloudData(); 
    wx.showToast({ title: '回到今天', icon: 'none' });
  },

  renderCalendar() {
    const settings = wx.getStorageSync('appSettings') || {};
    const weekStartDay = settings.weekStartDay !== undefined ? settings.weekStartDay : 0; 

    const weekDays = weekStartDay === 0 
      ? ['日','一','二','三','四','五','六']
      : ['一','二','三','四','五','六','日'];

    const { year, month, todayKey, cloudRecordsMap, holidaysMap } = this.data;
    
    const firstDateDay = new Date(year, month, 1).getDay(); 
    const daysCount = new Date(year, month + 1, 0).getDate();
    
    let emptyCount = 0;
    if (weekStartDay === 0) {
      emptyCount = firstDateDay;
    } else {
      emptyCount = (firstDateDay + 6) % 7;
    }

    let days = [];
    let ot = 0, off = 0;

    for (let i = 1; i <= daysCount; i++) {
      const pad = n => n < 10 ? '0' + n : n;
      const dateKey = `${year}-${month + 1}-${i}`;
      const fullDateKey = `${year}-${pad(month + 1)}-${pad(i)}`;

      const record = cloudRecordsMap[dateKey];
      const holidayInfo = holidaysMap ? holidaysMap[fullDateKey] : null;

      let tagType = '';
      const dateObj = new Date(year, month, i);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      if (holidayInfo) {
        if (holidayInfo.isHoliday === true) tagType = 'rest';
        else tagType = 'work';
      } else {
        if (isWeekend) tagType = 'rest';
      }

      if (record) {
        if (record.type === 'overtime') ot += parseFloat(record.hours);
        else off += parseFloat(record.hours);
      }

      days.push({
        day: i,
        fullDate: dateKey,
        type: record ? record.type : null,
        hours: record ? record.hours : null,
        selected: this.data.selectedDate === dateKey,
        isToday: dateKey === todayKey,
        tagType: tagType
      });
    }

    this.setData({
      weekStartDay,
      weekDays,
      emptyGrids: new Array(emptyCount).fill(0),
      days: days,
      currentMonthOt: ot.toFixed(1),
      currentMonthOff: off.toFixed(1),
      currentMonthNet: (ot - off).toFixed(1)
    });
  },

  onDayClick(e) {
    const day = e.currentTarget.dataset.day;
    const fullDate = `${this.data.year}-${this.data.month + 1}-${day}`;
    const record = this.data.cloudRecordsMap[fullDate] || null;
    const newDays = this.data.days.map(d => ({
      ...d, selected: d.day === day
    }));
    this.setData({
      days: newDays,
      selectedDate: fullDate,
      selectedDateStr: `${this.data.year}年${this.data.month + 1}月${day}日`,
      currentDayRecord: record 
    });
  },

  getDefaultTimes(dateStr, type) {
    const settings = wx.getStorageSync('appSettings') || {};
    
    // === 需求修改：调休默认显示 09:00 - 18:00 ===
    if (type === 'off') {
      return { start: '09:00', end: '18:00' };
    }

    const dateObj = new Date(dateStr.replace(/-/g, '/'));
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const pad = n => n < 10 ? '0' + n : n;
    const fullDateKey = `${year}-${pad(month)}-${pad(day)}`;
    
    const holidayInfo = this.data.holidaysMap ? this.data.holidaysMap[fullDateKey] : null;
    const dayOfWeek = dateObj.getDay();

    let isWorkDay = true;
    if (holidayInfo) {
      if (holidayInfo.isHoliday) isWorkDay = false; 
    } else {
      if (dayOfWeek === 0 || dayOfWeek === 6) isWorkDay = false; 
    }

    if (!isWorkDay) {
      return { start: '09:00', end: '18:00' };
    } else {
      const dinnerEnd = settings.dinnerEnd || '18:30'; 
      const [h, m] = dinnerEnd.split(':');
      let endH = parseInt(h) + 2;
      return { start: dinnerEnd, end: `${endH}:${m}` };
    }
  },

  showModal() {
    if (!this.data.selectedDate) return;
    // 默认是加班，还是根据上次操作？通常默认加班即可，或者读取 data.currentType
    const type = 'overtime'; 
    const times = this.getDefaultTimes(this.data.selectedDate, type);
    this.setData({ 
      modalHidden: false,
      currentType: type,
      startTime: times.start,
      endTime: times.end
    });
    this.calculateDuration();
  },

  changeType(e) { 
    const newType = e.currentTarget.dataset.type;
    const times = this.getDefaultTimes(this.data.selectedDate, newType);
    this.setData({ 
      currentType: newType, 
      startTime: times.start,
      endTime: times.end
    });
    this.calculateDuration();
  },

  onEditRecord() {
    const record = this.data.currentDayRecord;
    if (!record) return;
    this.setData({
      modalHidden: false, 
      currentType: record.type, 
      currentHours: record.hours, 
      startTime: record.startTime || '18:00', 
      endTime: record.endTime || '20:00'
    });
  },

  hideModal() { this.setData({ modalHidden: true }); },
  
  bindStartTimeChange(e) { this.setData({ startTime: e.detail.value }); this.calculateDuration(); },
  bindEndTimeChange(e) { this.setData({ endTime: e.detail.value }); this.calculateDuration(); },

  // === 核心修改：计算时长 ===
  calculateDuration() {
    const { startTime, endTime, selectedDate, currentType } = this.data;
    if (!startTime || !endTime || !selectedDate) return;

    // 1. 获取设置
    const settings = wx.getStorageSync('appSettings') || {
      lunchStart: '12:00', lunchEnd: '13:00',
      dinnerStart: '18:00', dinnerEnd: '18:30'
    };

    const dateStr = selectedDate.replace(/-/g, '/');
    let start = new Date(`${dateStr} ${startTime}:00`);
    let end = new Date(`${dateStr} ${endTime}:00`);

    if (end <= start) {
      this.setData({ currentHours: '0.0' });
      return;
    }

    const year = start.getFullYear();
    const month = start.getMonth();
    const day = start.getDate();

    // 2. === 新增逻辑：调休只计算 09:00-18:00 ===
    if (currentType === 'off') {
      const validStart = new Date(year, month, day, 9, 0, 0); // 09:00
      const validEnd = new Date(year, month, day, 18, 0, 0);   // 18:00

      // 如果开始时间早于 09:00，强制设为 09:00
      if (start < validStart) start = validStart;
      // 如果结束时间晚于 18:00，强制设为 18:00
      if (end > validEnd) end = validEnd;

      // 如果调整后开始时间 >= 结束时间 (说明完全在范围外)，时长为0
      if (start >= end) {
        this.setData({ currentHours: '0.0' });
        return;
      }
    }

    const parseTime = (timeStr) => {
      const [h, m] = timeStr.split(':');
      return new Date(year, month, day, parseInt(h), parseInt(m), 0);
    };

    const lunchStart = parseTime(settings.lunchStart);
    const lunchEnd = parseTime(settings.lunchEnd);
    const dinnerStart = parseTime(settings.dinnerStart);
    const dinnerEnd = parseTime(settings.dinnerEnd);

    let totalDurationMs = end.getTime() - start.getTime();

    const getOverlap = (workStart, workEnd, breakStart, breakEnd) => {
      const overlapStart = Math.max(workStart.getTime(), breakStart.getTime());
      const overlapEnd = Math.min(workEnd.getTime(), breakEnd.getTime());
      return Math.max(0, overlapEnd - overlapStart);
    };

    // 扣除休息时间 (调休和加班都扣午休)
    totalDurationMs -= getOverlap(start, end, lunchStart, lunchEnd);

    // 加班才扣晚休 (调休因为截止到18:00，理论上不会碰到晚休，但保留判断更稳妥)
    if (currentType === 'overtime') {
        totalDurationMs -= getOverlap(start, end, dinnerStart, dinnerEnd);
    }

    let exactHours = totalDurationMs / (1000 * 60 * 60);

    // 3. === 新增逻辑：调休每天最多8小时 ===
    if (currentType === 'off') {
      exactHours = Math.min(exactHours, 8);
    }

    let stepHours = Math.floor(exactHours * 2) / 2;
    stepHours = Math.max(0, stepHours);

    this.setData({ currentHours: stepHours.toFixed(1) });
  },

  hoursInput(e) { this.setData({ currentHours: e.detail.value }); },

  saveRecord() {
    if (!this.data.currentHours) return;
    const that = this;
    const key = this.data.selectedDate;
    
    const existingId = this.data.currentDayRecord ? this.data.currentDayRecord._id : null;

    const recordData = {
      date: key, 
      type: this.data.currentType, 
      hours: parseFloat(this.data.currentHours),
      startTime: this.data.startTime, 
      endTime: this.data.endTime, 
      updateTime: new Date()
    };
    
    wx.showLoading({ title: '保存中...' });

    if (existingId) {
      db.collection('work_records').doc(existingId).update({
        data: recordData
      }).then(() => finishSave('已修改'));
    } else {
      recordData.createTime = new Date();
      db.collection('work_records').add({
        data: recordData
      }).then(() => finishSave('已保存'));
    }

    function finishSave(msg) {
      wx.hideLoading(); 
      that.setData({ modalHidden: true }); 
      wx.showToast({ title: msg, icon: 'success' });
      that.fetchCloudData(); 
    }
  },

  onDeleteRecord() {
    const that = this;
    const record = this.data.currentDayRecord;
    if (!record || !record._id) return; 
    wx.showModal({
      title: '确认删除', content: '确定删除吗？',
      success(res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          db.collection('work_records').doc(record._id).remove().then(() => {
            wx.hideLoading(); 
            wx.showToast({ title: '已删除', icon: 'success' });
            that.setData({ currentDayRecord: null }); 
            that.fetchCloudData();
          });
        }
      }
    });
  },
});