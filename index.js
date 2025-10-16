// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const cors = require("cors");
const axios = require("axios");

console.log("▶️ Starting the Simple API Server (Using Device ID)...");

// --- 2. [สำคัญ!] ตั้งค่า Credentials และ Device ID ของคุณ ---
const NETPIE_API_KEY = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const NETPIE_API_SECRET = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA";
// ✅✅✅ เราจะใช้ Device ID โดยตรง ไม่ต้องใช้ Alias อีกแล้ว ✅✅✅
const TARGET_DEVICE_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";

// สร้าง Authorization Token เตรียมไว้ (ส่วนนี้จำเป็นตามกฎของ NETPIE)
const NETPIE_AUTH_TOKEN = Buffer.from(`${NETPIE_API_KEY}:${NETPIE_API_SECRET}`).toString('base64');


// --- 3. สร้าง Server และเปิดรับคำสั่งจากเว็บแอป ---
const app = express();
app.use(cors());
app.use(express.json());


// Endpoint 1: สำหรับหน้า My Device (ข้อมูลล่าสุด) - ดึงจาก Shadow ด้วย Device ID
app.get("/devices/latest", async (req, res) => {
  console.log(`[API] Request for latest data of [${TARGET_DEVICE_ID}]`);
  try {
    // ⚠️ เปลี่ยนจากการใช้ alias=... มาเป็น id=...
    const netpieApiUrl = `https://api.netpie.io/v2/device/shadow/data?id=${TARGET_DEVICE_ID}`;
    const response = await axios.get(netpieApiUrl, { headers: { 'Authorization': `Basic ${NETPIE_AUTH_TOKEN}` } });
    res.status(200).json(response.data);
  } catch (error) {
    console.error(`!!! [API] NETPIE Shadow ERROR:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});


// Endpoint 2: สำหรับกราฟและตาราง Report (ข้อมูลย้อนหลัง) - ดึงจาก Data Store ด้วย Device ID
app.get("/reports", async (req, res) => {
  const { period } = req.query;
  if (!period) {
    return res.status(400).json({ message: "period query parameter is required." });
  }

  console.log(`[API] Request for report data of [${TARGET_DEVICE_ID}] for period [${period}]`);

  try {
    const now = new Date();
    const endDate = new Date(now);
    let startDate;

    if (period === 'last7days') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
    } else if (period === 'thisMonth') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'lastMonth') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        startDate = lastMonth;
        endDate.setDate(0);
    } else {
        return res.status(400).json({ message: 'Invalid period.' });
    }

    const netpieStoreApiUrl = `https://api.netpie.io/v2/store/data/query`;
    const response = await axios.get(netpieStoreApiUrl, {
        headers: { 'Authorization': `Basic ${NETPIE_AUTH_TOKEN}` },
        params: {
            // ⚠️ เปลี่ยนจากการใช้ alias: ... มาเป็น id: ...
            id: TARGET_DEVICE_ID,
            start: startDate.getTime(),
            end: endDate.getTime(),
            limit: 50000 // ดึงข้อมูลให้ได้มากที่สุดเท่าที่ NETPIE จะให้ได้
        }
    });

    const rawData = response.data;
    if (!rawData || rawData.length === 0) {
        return res.status(200).json([]);
    }

    // ประมวลผลข้อมูลดิบเพื่อสรุปยอดรายวัน
    const dailySummary = {};
    rawData.forEach(record => {
        try {
            const recordData = JSON.parse(record.data).data;
            const recordDate = new Date(record.ts);
            const dayKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-${String(recordDate.getDate()).padStart(2, '0')}`;
            
            if (!dailySummary[dayKey]) {
                dailySummary[dayKey] = { min_pkWh: Infinity, max_pkWh: -Infinity };
            }
            if (recordData && typeof recordData.pkWh === 'number') {
                if (recordData.pkWh < dailySummary[dayKey].min_pkWh) dailySummary[dayKey].min_pkWh = recordData.pkWh;
                if (recordData.pkWh > dailySummary[dayKey].max_pkWh) dailySummary[dayKey].max_pkWh = recordData.pkWh;
            }
        } catch(e) {
            // ข้ามข้อมูลที่อาจจะมี format ผิดพลาด
        }
    });

    // คำนวณผลลัพธ์สุดท้าย
    const reportData = Object.keys(dailySummary).map(dayKey => {
        const summary = dailySummary[dayKey];
        const kwhUsed = (summary.max_pkWh === -Infinity || summary.min_pkWh === Infinity) ? 0 : (summary.max_pkWh - summary.min_pkWh);
        const co2 = kwhUsed * 0.5; // สมมติ 1 kWh = 0.5 kgCO2e
        const cost = kwhUsed * 4.0; // สมมติค่าไฟหน่วยละ 4 บาท
        return {
            date: dayKey,
            kwh: kwhUsed.toFixed(2).toString(),
            co2: co2.toFixed(2).toString(),
            cost: cost.toFixed(2).toString()
        };
    });

    // เรียงข้อมูลจากวันล่าสุดไปเก่า
    res.status(200).json(reportData.sort((a, b) => b.date.localeCompare(a.date)));

  } catch (error) {
    console.error(`!!! [API] NETPIE Store ERROR:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});

// Endpoint สำหรับเช็คว่า Server ทำงานอยู่
app.get("/", (req, res) => {
  res.status(200).send("API Server (Using Device ID) is running.");
});

// --- 4. เริ่มเปิด Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Server is ready on port ${PORT}`);
});