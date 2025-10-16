// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const cors = require("cors");
const axios = require("axios");

console.log("▶️ Starting the API Server (Using Correct Auth Method)...");

// --- 2. [สำคัญ!] ตั้งค่า Credentials ที่ถูกต้องตามไฟล์อ้างอิง ---
// 🔑 DEVICE_CLIENT_ID คือ Client ID ของอุปกรณ์
const DEVICE_CLIENT_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a"; 

// 🤫 DEVICE_TOKEN คือ Token ของอุปกรณ์ (ไม่ใช่ Secret)
const DEVICE_TOKEN = "jiXFhjE4fgcmFtuYV16nv5Mbhpu9gLTv"; 

// สร้าง Authorization Header ที่ถูกต้อง
const NETPIE_AUTH_HEADER = `Device ${DEVICE_CLIENT_ID}:${DEVICE_TOKEN}`;

// --- 3. สร้าง Server และเปิดรับคำสั่งจากเว็บแอป ---
const app = express();
app.use(cors());
app.use(express.json());


/**
 * Endpoint 1: ดึงข้อมูลล่าสุดจาก Shadow
 */
app.get("/devices/latest", async (req, res) => {
  console.log(`[API] Request for latest shadow data of [${DEVICE_CLIENT_ID}]`);
  try {
    const netpieApiUrl = `https://api.netpie.io/v2/device/shadow`;
    
    const response = await axios.get(netpieApiUrl, {
        headers: { 
            // ✅✅✅ [แก้ไข!] ใช้ Header ที่ถูกต้อง ✅✅✅
            'Authorization': NETPIE_AUTH_HEADER 
        },
        params: { ids: [DEVICE_CLIENT_ID] }
    });

    const deviceData = response.data && response.data.length > 0 ? response.data[0] : null;

    if (deviceData) {
        res.status(200).json(deviceData);
    } else {
        res.status(404).json({ message: "Device shadow not found on NETPIE." });
    }
  } catch (error) {
    console.error(`!!! [API] NETPIE Shadow GET ERROR:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});

/**
 * Endpoint 2: ดึงข้อมูลย้อนหลังสำหรับกราฟ
 */
app.get("/devices/historical", async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ message: "start and end query parameters are required." });

  console.log(`[API] Request for historical data of [${DEVICE_CLIENT_ID}]`);
  try {
    const netpieStoreApiUrl = `https://api.netpie.io/v2/feed/datastore/query`;
    const response = await axios.get(netpieStoreApiUrl, {
        headers: { 
            'Authorization': NETPIE_AUTH_HEADER 
        },
        params: {
            topic: `@private/+/+/${DEVICE_CLIENT_ID}/shadow/data/updated`, 
            from: new Date(start).getTime(),
            to: new Date(end).getTime(),
            limit: 1000
        }
    });

    const rawData = response.data.data;
    const formattedData = rawData.map(record => {
        try {
            const parsedData = JSON.parse(record[1]);
            return { timestamp: new Date(record[0]).toISOString(), Pa: parsedData.data?.Pa || 0 };
        } catch(e) { return null; }
    }).filter(item => item !== null);

    res.status(200).json(formattedData.sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
  } catch (error) {
    console.error(`!!! [API] NETPIE Data Store ERROR:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});

/**
 * Endpoint 3: ดึงข้อมูลย้อนหลังสำหรับ Report
 */
app.get("/devices/reports", async (req, res) => {
    const { period } = req.query;
    if (!period) return res.status(400).json({ message: "period query parameter is required." });

    console.log(`[API] Request for report data of [${DEVICE_CLIENT_ID}] for period [${period}]`);
    try {
        const now = new Date();
        let startDate;
        const endDate = new Date(now);

        if (period === 'last7days') {
            startDate = new Date(now); startDate.setDate(now.getDate() - 6); startDate.setHours(0, 0, 0, 0);
        } else if (period === 'thisMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'lastMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); endDate.setDate(0);
        } else {
            return res.status(400).json({ message: 'Invalid period.' });
        }
        
        const netpieStoreApiUrl = `https://api.netpie.io/v2/feed/datastore/query`;
        const response = await axios.get(netpieStoreApiUrl, {
            headers: { 
                'Authorization': NETPIE_AUTH_HEADER 
            },
            params: {
                topic: `@private/+/+/${DEVICE_CLIENT_ID}/shadow/data/updated`,
                from: startDate.getTime(), to: endDate.getTime(), limit: 50000
            }
        });

        const rawData = response.data.data;
        if (!rawData || rawData.length === 0) return res.status(200).json([]);
        const dailySummary = {};
        rawData.forEach(record => {
            try {
                const recordTimestamp = record[0]; const recordData = JSON.parse(record[1]).data;
                const recordDate = new Date(recordTimestamp);
                const dayKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-${String(recordDate.getDate()).padStart(2, '0')}`;
                if (!dailySummary[dayKey]) dailySummary[dayKey] = { min_pkWh: Infinity, max_pkWh: -Infinity };
                if (recordData && typeof recordData.pkWh === 'number') {
                    if (recordData.pkWh < dailySummary[dayKey].min_pkWh) dailySummary[dayKey].min_pkWh = recordData.pkWh;
                    if (recordData.pkWh > dailySummary[dayKey].max_pkWh) dailySummary[dayKey].max_pkWh = recordData.pkWh;
                }
            } catch(e) {}
        });
        const reportData = Object.keys(dailySummary).map(dayKey => {
            const summary = dailySummary[dayKey];
            const kwhUsed = (summary.max_pkWh === -Infinity || summary.min_pkWh === Infinity) ? 0 : (summary.max_pkWh - summary.min_pkWh);
            const co2 = kwhUsed * 0.5; const cost = kwhUsed * 4.0;
            return { date: dayKey, kwh: kwhUsed.toFixed(2).toString(), co2: co2.toFixed(2).toString(), cost: cost.toFixed(2).toString() };
        });
        res.status(200).json(reportData.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
        console.error(`!!! [API] NETPIE Data Store ERROR:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
    }
});


// Endpoint สำหรับเช็คว่า Server ทำงานอยู่
app.get("/", (req, res) => {
  res.status(200).send("API Server for BSEM is running.");
});

// --- 4. เริ่มเปิด Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Server is ready on port ${PORT}`);
});