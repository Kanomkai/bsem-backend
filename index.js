// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const cors = require("cors");
const axios = require("axios");

console.log("▶️ Starting the RESTful API Server for NETPIE...");

// --- 2. [สำคัญ!] ตั้งค่า Credentials สำหรับ NETPIE API ---
// เราจะใช้ Application Key ชุดที่ "ยืนยันตัวตนผ่าน" แต่ "ไม่ได้รับอนุญาต" (ได้ 403)
// เพราะนี่คือ Key ที่ถูกต้องสำหรับ Application ของเรา
const NETPIE_API_KEY = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const NETPIE_API_SECRET = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA";

// --- 3. สร้าง Express App (เว็บเซิร์ฟเวอร์) ---
const app = express();
app.use(cors());
app.use(express.json());


// --- 4. สร้าง API Endpoint สำหรับให้แอปเรียกใช้ ---
app.get("/get-latest-data/:alias", async (req, res) => {
  const { alias } = req.params;

  console.log(`[API] Received request for alias: ${alias}`);

  try {
    // สร้าง Token สำหรับยืนยันตัวตนกับ NETPIE
    const token = Buffer.from(`${NETPIE_API_KEY}:${NETPIE_API_SECRET}`).toString('base64');
    
    // กำหนด URL ปลายทางของ NETPIE API
    const netpieApiUrl = `https://api.netpie.io/v2/device/shadow/data?alias=${alias}`;
    
    // สั่งให้เซิร์ฟเวอร์ "โทร" ไปหา NETPIE
    console.log(`[API] Forwarding request to NETPIE...`);
    const response = await axios.get(netpieApiUrl, {
      headers: { 'Authorization': `Basic ${token}` }
    });
    
    // ถ้าสำเร็จ: ส่งข้อมูลที่ได้กลับไปให้แอป
    console.log(`[SUCCESS] Received data from NETPIE. Sending to client.`);
    res.status(200).json(response.data);

  } catch (error) {
    // ถ้าล้มเหลว: ส่ง "คำตอบที่เป็น Error" จาก NETPIE กลับไปให้แอปแบบเป๊ะๆ
    console.error(`!!! [NETPIE ERROR] NETPIE responded with an error:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
  }
});


// --- 5. เริ่มรันเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 RESTful API Server is running on port ${PORT}`);
});