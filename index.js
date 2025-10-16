// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const cors = require("cors");
const axios = require("axios");

console.log("▶️ Starting the API Server (Fixed Device ID)...");

// --- 2. [สำคัญ!] ตั้งค่า Credentials และ Device ID ที่คุณต้องการเจาะจง ---
const NETPIE_API_KEY = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const NETPIE_API_SECRET = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA";
// ✅✅✅ กำหนด Device ID ที่ต้องการใช้งานตายตัวที่นี่ ✅✅✅
const TARGET_DEVICE_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a"; // <--- ใส่ Device ID ที่คุณต้องการ

// สร้าง Authorization Token เตรียมไว้
const NETPIE_AUTH_TOKEN = Buffer.from(`${NETPIE_API_KEY}:${NETPIE_API_SECRET}`).toString('base64');

// --- 3. สร้าง Server และเปิดรับคำสั่งจากเว็บแอป ---
const app = express();
app.use(cors());
app.use(express.json());


// --- [แก้ไข] Endpoint 1: สำหรับข้อมูลล่าสุด (ไม่ต้องรับ deviceId) ---
app.get("/devices/latest", async (req, res) => {
  console.log(`[API] Request for latest data of [${TARGET_DEVICE_ID}]`);
  try {
    const netpieApiUrl = `https://api.netpie.io/v2/device/shadow/data?id=${TARGET_DEVICE_ID}`;
    const response = await axios.get(netpieApiUrl, { headers: { 'Authorization': `Basic ${NETPIE_AUTH_TOKEN}` } });
    res.status(200).json(response.data);
  } catch (error) {
    console.error(`!!! [API] NETPIE Shadow ERROR:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});


// --- [แก้ไข] Endpoint 2: สำหรับกราฟ (ไม่ต้องรับ deviceId) ---
app.get("/devices/historical", async (req, res) => {
  const { start, end } = req.query; // รับแค่ start/end time

  if (!start || !end) {
    return res.status(400).json({ message: "start and end query parameters are required." });
  }

  console.log(`[API] Request for historical data of [${TARGET_DEVICE_ID}]`);

  try {
    const netpieStoreApiUrl = `https://api.netpie.io/v2/store/data/query`;
    const response = await axios.get(netpieStoreApiUrl, {
        headers: { 'Authorization': `Basic ${NETPIE_AUTH_TOKEN}` },
        params: {
            id: TARGET_DEVICE_ID, // ใช้ค่าที่กำหนดไว้
            start: new Date(start).getTime(),
            end: new Date(end).getTime(),
            limit: 1000
        }
    });

    const formattedData = response.data.map(record => {
        try {
            const parsedData = JSON.parse(record.data);
            return {
                timestamp: new Date(record.ts).toISOString(),
                Pa: parsedData.data?.Pa || 0
            };
        } catch(e) { return null; }
    }).filter(item => item !== null);

    res.status(200).json(formattedData.sort((a, b) => a.timestamp.localeCompare(b.timestamp)));

  } catch (error) {
    console.error(`!!! [API] NETPIE Store ERROR:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});


// --- [แก้ไข] Endpoint 3: สำหรับ Report (ไม่ต้องรับ deviceId) ---
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

        const netpieStoreApiUrl = `https://api.netpie.io/v2/store/data/query`;
        const response = await axios.get(netpieStoreApiUrl, {
            headers: { 'Authorization': `Basic ${NETPIE_AUTH_TOKEN}` },
            params: {
                id: TARGET_DEVICE_ID, // ใช้ค่าที่กำหนดไว้
                start: startDate.getTime(),
                end: endDate.getTime(),
                limit: 50000
            }
        });

        const rawData = response.data;
        if (!rawData || rawData.length === 0) {
            return res.status(200).json([]);
        }

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
        console.error(`!!! [API] NETPIE Store ERROR:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
    }
});


// Endpoint สำหรับเช็คว่า Server ทำงานอยู่
app.get("/", (req, res) => {
  res.status(200).send("API Server (Fixed Device ID) is running.");
});

// --- 4. เริ่มเปิด Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Server is ready on port ${PORT}`);
});