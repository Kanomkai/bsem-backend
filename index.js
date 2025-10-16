// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const cors = require("cors");
const axios = require("axios");

console.log("▶️ Starting the API Server (NETPIE2020 Fixed Device ID)...");

// --- 2. [สำคัญ!] ตั้งค่า Credentials และ Device ID ของคุณ ---
// 🔑 ให้ใช้ Key และ Secret ที่ถูกต้องจาก NETPIE2020 Dashboard ของคุณ
const NETPIE_API_KEY = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a"; // <--- 🔑 ใส่ Client ID ที่ถูกต้อง
const NETPIE_API_SECRET = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA"; // <--- 🤫 ใส่ Secret ที่ถูกต้อง

// 🎯 ID ของอุปกรณ์เป้าหมาย
const TARGET_DEVICE_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a"; 

// สร้าง Authorization Token สำหรับการยืนยันตัวตน
const NETPIE_AUTH_TOKEN = Buffer.from(`${NETPIE_API_KEY}:${NETPIE_API_SECRET}`).toString('base64');

// --- 3. สร้าง Server และเปิดรับคำสั่งจากเว็บแอป ---
const app = express();
app.use(cors());
app.use(express.json());


// --- [อัปเดต] Endpoint 1: สำหรับข้อมูลล่าสุด (ดึงจาก Shadow) ---
app.get("/devices/latest", async (req, res) => {
  console.log(`[API] Request for latest shadow data of [${TARGET_DEVICE_ID}]`);
  try {
    // ✅✅✅ URL ที่ถูกต้องสำหรับ NETPIE2020 Shadow API ✅✅✅
    const netpieApiUrl = `https://api.netpie.io/v2/device/shadow`;
    const response = await axios.get(netpieApiUrl, {
        headers: { 'Authorization': `Basic ${NETPIE_AUTH_TOKEN}` },
        params: {
            // ส่ง Device ID เป็น Array ตามสเปคใหม่
            ids: [TARGET_DEVICE_ID] 
        }
    });

    // NETPIE2020 จะ return ข้อมูลเป็น Array, เราจึงต้องดึงตัวแรกออกมา
    const deviceData = response.data && response.data.length > 0 ? response.data[0] : null;

    if (deviceData) {
        res.status(200).json(deviceData); // ส่งข้อมูลของอุปกรณ์ตัวนั้นกลับไป
    } else {
        res.status(404).json({ message: "Device shadow not found." });
    }

  } catch (error) {
    console.error(`!!! [API] NETPIE Shadow ERROR:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});


// --- [อัปเดต] Endpoint 2: สำหรับกราฟ (ดึงจาก Data Store) ---
app.get("/devices/historical", async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ message: "start and end query parameters are required." });
  }

  console.log(`[API] Request for historical data of [${TARGET_DEVICE_ID}]`);

  try {
    // ✅✅✅ URL ที่ถูกต้องสำหรับ NETPIE2020 Data Store API ✅✅✅
    const netpieStoreApiUrl = `https://api.netpie.io/v2/feed/datastore/query`;
    const response = await axios.get(netpieStoreApiUrl, {
        headers: { 'Authorization': `Basic ${NETPIE_AUTH_TOKEN}` },
        params: {
            // ส่ง Device ID ใน Topic รูปแบบเฉพาะของ NETPIE2020
            topic: `@private/+/+/${TARGET_DEVICE_ID}/shadow/data/updated`, 
            from: new Date(start).getTime(),
            to: new Date(end).getTime(),
            limit: 1000
        }
    });

    // NETPIE2020 จะส่งข้อมูลดิบมาในรูปแบบที่ต่างจากเดิม
    const rawData = response.data.data;
    const formattedData = rawData.map(record => {
        try {
            // ข้อมูลจริงจะอยู่ใน record[1] ซึ่งเป็น JSON string
            const parsedData = JSON.parse(record[1]);
            return {
                // เวลาอยู่ใน record[0] เป็น millisecond
                timestamp: new Date(record[0]).toISOString(),
                // ดึงค่า Pa จาก data.Pa
                Pa: parsedData.data?.Pa || 0
            };
        } catch(e) { return null; }
    }).filter(item => item !== null);

    res.status(200).json(formattedData.sort((a, b) => a.timestamp.localeCompare(b.timestamp)));

  } catch (error) {
    console.error(`!!! [API] NETPIE Data Store ERROR:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});


// --- [อัปเดต] Endpoint 3: สำหรับ Report (ดึงจาก Data Store) ---
app.get("/devices/reports", async (req, res) => {
    const { period } = req.query;
    if (!period) {
        return res.status(400).json({ message: "period query parameter is required." });
    }

    console.log(`[API] Request for report data of [${TARGET_DEVICE_ID}] for period [${period}]`);

    try {
        const now = new Date();
        let startDate;
        const endDate = new Date(now);

        if (period === 'last7days') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
        } else if (period === 'thisMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'lastMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate.setDate(0);
        } else {
            return res.status(400).json({ message: 'Invalid period.' });
        }

        // ✅✅✅ ใช้ URL ที่ถูกต้องสำหรับ NETPIE2020 Data Store API ✅✅✅
        const netpieStoreApiUrl = `https://api.netpie.io/v2/feed/datastore/query`;
        const response = await axios.get(netpieStoreApiUrl, {
            headers: { 'Authorization': `Basic ${NETPIE_AUTH_TOKEN}` },
            params: {
                topic: `@private/+/+/${TARGET_DEVICE_ID}/shadow/data/updated`,
                from: startDate.getTime(),
                to: endDate.getTime(),
                limit: 50000
            }
        });

        const rawData = response.data.data;
        if (!rawData || rawData.length === 0) {
            return res.status(200).json([]);
        }

        const dailySummary = {};
        rawData.forEach(record => {
            try {
                const recordTimestamp = record[0];
                const recordData = JSON.parse(record[1]).data;
                const recordDate = new Date(recordTimestamp);
                const dayKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-${String(recordDate.getDate()).padStart(2, '0')}`;
                
                if (!dailySummary[dayKey]) {
                    dailySummary[dayKey] = { min_pkWh: Infinity, max_pkWh: -Infinity };
                }
                if (recordData && typeof recordData.pkWh === 'number') {
                    if (recordData.pkWh < dailySummary[dayKey].min_pkWh) dailySummary[dayKey].min_pkWh = recordData.pkWh;
                    if (recordData.pkWh > dailySummary[dayKey].max_pkWh) dailySummary[dayKey].max_pkWh = recordData.pkWh;
                }
            } catch(e) {}
        });

        const reportData = Object.keys(dailySummary).map(dayKey => {
            const summary = dailySummary[dayKey];
            const kwhUsed = (summary.max_pkWh === -Infinity || summary.min_pkWh === Infinity) ? 0 : (summary.max_pkWh - summary.min_pkWh);
            const co2 = kwhUsed * 0.5;
            const cost = kwhUsed * 4.0;
            return {
                date: dayKey,
                kwh: kwhUsed.toFixed(2).toString(),
                co2: co2.toFixed(2).toString(),
                cost: cost.toFixed(2).toString()
            };
        });
        
        res.status(200).json(reportData.sort((a, b) => b.date.localeCompare(a.date)));

    } catch (error) {
        console.error(`!!! [API] NETPIE Data Store ERROR:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
    }
});


// Endpoint สำหรับเช็คว่า Server ทำงานอยู่
app.get("/", (req, res) => {
  res.status(200).send("API Server (NETPIE2020 Fixed Device ID) is running.");
});

// --- 4. เริ่มเปิด Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Server is ready on port ${PORT}`);
});