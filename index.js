// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const admin = require("firebase-admin");


// อ่านค่า Service Account จาก Environment Variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

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


// --- [Endpoint ใหม่!] สำหรับรับ Webhook จาก NETPIE ---
// --- [Endpoint ใหม่!] สำหรับรับ Webhook จาก NETPIE ---
// --- [Endpoint ใหม่!] สำหรับรับ Webhook จาก NETPIE (เวอร์ชันเก็บประวัติ) ---
app.post("/netpie-webhook", express.text({ type: '*/*' }), async (req, res) => {
  try {
    const shadowData = JSON.parse(req.body);
    console.log('[Webhook] Received and parsed shadow data:', shadowData);

    if (shadowData) {
      // --- [ส่วนที่ 1] สร้าง reference ไปยังตำแหน่งต่างๆ ---
      const deviceId = process.env.DEVICE_CLIENT_ID;
      const latestDataRef = db.ref(`devices/${deviceId}/latest_data`);
      const historyRef = db.ref(`devices/${deviceId}/history`); // <--- ตำแหน่งใหม่สำหรับเก็บประวัติ

      // --- [ส่วนที่ 2] เพิ่ม timestamp ของ Server เข้าไปในข้อมูล ---
      const dataWithTimestamp = {
        ...shadowData,
        timestamp: admin.database.ServerValue.TIMESTAMP // <--- เพิ่มเวลาที่บันทึกข้อมูล
      };

      // --- [ส่วนที่ 3] สั่งให้ Firebase ทำงาน 2 อย่างพร้อมกัน ---
      await Promise.all([
        latestDataRef.set(shadowData),             // 1. เขียนทับข้อมูลล่าสุด (เหมือนเดิม)
        historyRef.push(dataWithTimestamp)         // 2. เพิ่มข้อมูลใหม่เข้าไปใน history (ทำเพิ่ม)
      ]);

      console.log('[Firebase] Updated latest data and pushed to history.');
      res.status(200).send("OK");

    } else {
      console.log('[Webhook] Received empty data.');
      res.status(400).send("Received empty data.");
    }
  } catch (error) {
    console.error(`!!! [Webhook Error]`, error.message);
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