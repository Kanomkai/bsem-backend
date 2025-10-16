// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const admin = require("firebase-admin");

// --- 2. [สำคัญ!] ตั้งค่า Credentials ทั้งหมด ---
// กุญแจสำหรับเชื่อมต่อ Firebase (ไฟล์ที่คุณเพิ่งโหลดมา)
const serviceAccount = require("./serviceAccountKey.json");

// Credentials สำหรับ NETPIE (ใช้ Client ID และ Token)
const DEVICE_CLIENT_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a"; 
const DEVICE_TOKEN = "jiXFhjE4fgcmFtuYV16nv5Mbhpu9gLTv"; 
const NETPIE_AUTH_HEADER = `Device ${DEVICE_CLIENT_ID}:${DEVICE_TOKEN}`;

// --- 3. เริ่มการเชื่อมต่อกับ Firebase ---
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://bsem-5e4c1-default-rtdb.asia-southeast1.firebasedatabase.app" // URL ของ Realtime Database ของคุณ
});

// สร้าง reference ไปยังตำแหน่งที่เราจะเก็บข้อมูล
const db = admin.database();
const deviceDataRef = db.ref(`devices/${DEVICE_CLIENT_ID}/latest_data`);

console.log("▶️ Starting Firebase Bridge Server...");

// --- 4. สร้าง Server ---
const app = express();
app.use(cors());
app.use(express.json({ extended: true }));


// --- [Endpoint ใหม่!] สำหรับรับ Webhook จาก NETPIE ---
app.post("/netpie-webhook", async (req, res) => {
  console.log('[Webhook] Received data from NETPIE:', req.body);
  
  try {
    // 1. ไปดึงข้อมูล Shadow ตัวเต็มจาก NETPIE API
    const netpieApiUrl = `https://api.netpie.io/v2/device/shadow`;
    const response = await axios.get(netpieApiUrl, {
        headers: { 'Authorization': NETPIE_AUTH_HEADER },
        params: { ids: [DEVICE_CLIENT_ID] }
    });

    const deviceData = response.data && response.data.length > 0 ? response.data[0] : null;

    if (deviceData && deviceData.data) {
      // 2. นำข้อมูลที่ได้ไปเขียนทับใน Firebase Realtime Database
      await deviceDataRef.set(deviceData.data);
      console.log('[Firebase] Successfully wrote data to Realtime Database.');
      res.status(200).send("OK");
    } else {
      console.log('[Webhook] No shadow data found to update.');
      res.status(404).send("Shadow data not found.");
    }

  } catch (error) {
    console.error(`!!! [Webhook Error]`, error.response?.data || error.message);
    res.status(500).send("Internal Server Error");
  }
});


// Endpoint สำหรับเช็คว่า Server ทำงานอยู่
app.get("/", (req, res) => {
  res.status(200).send("Firebase Bridge Server is running.");
});

// --- 5. เริ่มเปิด Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Server is ready on port ${PORT}`);
});