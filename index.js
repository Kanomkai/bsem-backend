// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const axios = require("axios"); // <--- เพิ่มเข้ามาเพื่อยิง API
const admin = require("firebase-admin");

// --- 2. ตั้งค่าการเชื่อมต่อต่างๆ ---

// อ่านค่า Service Account จาก Environment Variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

// --- [สำคัญ!] Credentials สำหรับ NETPIE API ---
// คุณต้องใช้ Client ID และ Token ของ "อุปกรณ์" ที่คุณต้องการดึงข้อมูล
const DEVICE_CLIENT_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const DEVICE_TOKEN = "jiXFhjE4fgcmFtuYV16nv5Mbhpu9gLTv"; // <--- 🤫 ควรเก็บเป็น Environment Variable เพื่อความปลอดภัย

// สร้าง Header สำหรับยืนยันตัวตนกับ NETPIE
const NETPIE_AUTH_HEADER = `Device ${DEVICE_CLIENT_ID}:${DEVICE_TOKEN}`;
const NETPIE_API_URL = `https://api.netpie.io/v2/device/shadow/data?alias=${DEVICE_CLIENT_ID}`;

// --- 3. เริ่มการเชื่อมต่อกับ Firebase ---
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://bsem-5e4c1-default-rtdb.asia-southeast1.firebasediatabase.app"
});

const db = admin.database();
const latestDataRef = db.ref(`devices/${DEVICE_CLIENT_ID}/latest_data`);
const historyRef = db.ref(`devices/${DEVICE_CLIENT_ID}/history`);

console.log("▶️ Starting Firebase Polling Server...");

// --- 4. [หัวใจหลัก] ฟังก์ชันสำหรับดึงข้อมูลจาก NETPIE (Polling) ---
const pollNetpieData = async () => {
  console.log(`[Polling] ⏱️  Attempting to fetch data from NETPIE...`);

  try {
    // 4.1 ยิง GET request ไปที่ NETPIE API เพื่อขอข้อมูล Shadow
    const response = await axios.get(NETPIE_API_URL, {
      headers: {
        'Authorization': NETPIE_AUTH_HEADER
      }
    });

    // 4.2 NETPIE จะส่งข้อมูลกลับมาใน response.data.data.reported
    const reportedData = response.data?.data?.reported;

    if (reportedData && Object.keys(reportedData).length > 0) {
      console.log("[Polling] ✅ SUCCESS! Data received:", reportedData);

      // 4.3 สร้างข้อมูลสำหรับบันทึกลง History (เพิ่ม Timestamp)
      const dataWithTimestamp = {
        ...reportedData,
        timestamp: admin.database.ServerValue.TIMESTAMP
      };

      // 4.4 บันทึกข้อมูลลง Firebase ทั้ง 2 ที่
      await Promise.all([
        latestDataRef.set(reportedData),
        historyRef.push(dataWithTimestamp)
      ]);

      console.log("[Firebase] 💾 Data saved successfully.");
    } else {
      console.log("[Polling] ⚠️  No 'reported' data found in the response.");
    }

  } catch (error) {
    // 4.5 แสดง Error หากการเชื่อมต่อกับ NETPIE ล้มเหลว
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! [ERROR] 🔴 FAILED to fetch data from NETPIE:", error.response?.data || error.message);
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  }
};

// --- 5. [คำสั่งสำคัญ] เริ่มการทำงานของ Polling ---
// สั่งให้ฟังก์ชัน pollNetpieData ทำงานครั้งแรกทันทีที่ Server เริ่ม
pollNetpieData();

// จากนั้นให้ทำงานซ้ำอีกทุกๆ 1 นาที (60,000 มิลลิวินาที)
setInterval(pollNetpieData, 60000);

// --- 6. สร้าง Server พื้นฐานเพื่อให้ Render ทำงานได้ ---
const app = express();

// Endpoint สำหรับเช็คว่า Server ทำงานอยู่
app.get("/", (req, res) => {
  res.status(200).send("Firebase Polling Server is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Server is ready on port ${PORT}`);
});