// --- 1. Import เครื่องมือที่จำเป็น ---
const admin = require("firebase-admin");
const mqtt = require("mqtt"); // (ยังคงเก็บไว้เผื่ออนาคต แต่ตอนนี้ไม่ได้ใช้เชื่อมต่อ)
const express = require("express");
const cors = require("cors");
const axios = require("axios");

// --- 2. ตั้งค่าการเชื่อมต่อ Firebase ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();
console.log("✅ Firebase Firestore connected successfully!");


// --- 3. [แก้ไข] ตั้งค่า Credentials สำหรับ NETPIE API ---
// (เราจะใช้ชุดนี้สำหรับโทรหา API โดยตรง)
const NETPIE_API_KEY = "42e16b39-faf6-4e0f-9899-456a61d8e10f"; // <-- Key ชุดใหม่จาก cURL
const NETPIE_API_SECRET = "AjKk5jJhALhENmhSs2ETSWaSC3R6hUuB";   // <-- Secret ชุดใหม่จาก cURL


// --- 4. สร้าง Express App และเปิด CORS ---
const app = express();
app.use(cors());
app.use(express.json());


// --- 5. API Endpoints (เส้นทางต่างๆ) ---

// Endpoint สำหรับดึงข้อมูลล่าสุด (Live Data) จาก NETPIE API โดยตรง
app.get("/get-latest-data/:alias", async (req, res) => {
  try {
    const { alias } = req.params;
    
    // สร้าง Token จาก Key/Secret ชุดใหม่
    const token = Buffer.from(`${NETPIE_API_KEY}:${NETPIE_API_SECRET}`).toString('base64');
    
    // **สำคัญ:** แก้ไข URL ให้ถูกต้องตาม cURL (ไม่มี /data ต่อท้าย)
    const netpieApiUrl = `https://api.netpie.io/v2/device/shadow/data?alias=${alias}`;
    
    console.log(`Forwarding request to NETPIE for alias: ${alias}`);
    const response = await axios.get(netpieApiUrl, {
      headers: { 'Authorization': `Basic ${token}` }
    });
    
    console.log(`Successfully fetched data from NETPIE for alias: ${alias}`);
    res.status(200).json(response.data);
  } catch (error) {
    console.error("!!! NETPIE API FORWARDING ERROR !!! in /get-latest-data:", error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});

// Endpoint สำหรับดึงข้อมูลย้อนหลังจาก Firestore
app.get("/get-historical-data/:alias", async (req, res) => {
    try {
        const { alias } = req.params;
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
          return res.status(400).send({ error: "startDate and endDate query parameters are required." });
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        const snapshot = await db.collection("device_data").where('alias', '==', alias).where('timestamp', '>=', start).where('timestamp', '<=', end).orderBy("timestamp", "asc").get();
        if (snapshot.empty) {
          return res.status(200).json([]);
        }
        const data = snapshot.docs.map((doc) => {
            const docData = doc.data();
            if (docData.timestamp && typeof docData.timestamp.toDate === 'function') {
                docData.timestamp = docData.timestamp.toDate().toISOString();
            }
            return docData;
        });
        res.status(200).json(data);
    } catch (error) {
        console.error("!!! INTERNAL SERVER ERROR !!! in /get-historical-data:", error);
        res.status(500).send({ error: "Failed to get historical data." });
    }
});


// --- 6. เริ่มรันเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});ห