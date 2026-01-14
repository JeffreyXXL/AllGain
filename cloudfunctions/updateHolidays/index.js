const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ...前面的代码不变...

exports.main = async (event, context) => {
  const targetYears = [2024, 2025, 2026]; 
  console.log(`开始批量同步：${targetYears.join(', ')}`);
  
  // === 修改点：使用 Promise.all 让几年同时跑 ===
  const tasks = targetYears.map(async (year) => {
    const url = `http://timor.tech/api/holiday/year/${year}`;
    console.log(`正在抓取 ${year}...`);
    
    try {
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const holidayData = res.data.holiday;
      const yearBatch = [];

      for (let dateKey in holidayData) {
        const item = holidayData[dateKey];
        // 查重
        const checkRes = await db.collection('holidays').where({ date: item.date }).count();
        if (checkRes.total === 0) {
          yearBatch.push(db.collection('holidays').add({
            data: {
              date: item.date,
              name: item.name,
              isHoliday: item.holiday,
              createTime: new Date()
            }
          }));
        }
      }
      
      if (yearBatch.length > 0) {
        await Promise.all(yearBatch);
        return `${year}年新增${yearBatch.length}条`;
      }
      return `${year}年无新增`;

    } catch (err) {
      return `${year}年失败: ${err.message}`;
    }
  });

  // 等待所有年份完成
  const results = await Promise.all(tasks);

  return {
    status: 'success',
    msg: results.join('; ')
  }
}