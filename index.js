// --- 1. Import เครื่องมือที่จำเป็น (เหลือแค่ 3 อย่าง) ---
const express = require("express");
const cors = require("cors");
const axios = require("axios");

// --- 2. ตั้งค่า Credentials สำหรับ NETPIE API (ใช้ชุดที่ถูกต้อง) ---
// นี่คือชุดที่ทำให้เกิด Error 403 ซึ่งแปลว่า "ยืนยันตัวตนผ่าน" แต่ "ไม่ได้รับอนุญาต"
const NETPIE_API_KEY = "Y9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const NETPIE_API_SECRET = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA";

// --- 3. สร้าง Express App ---
const app = express();
app.use(cors());
app.use(express.json());


// --- 4. API Endpoint หลัก (ทำงานแค่อย่างเดียว) ---
app.get("/get-latest-data/:alias", async (req, res) => {
  const { alias } = req.params;

  console.log(`[Direct Forwarder] Received request for alias: ${alias}`);

  try {
    // สร้าง Token ยืนยันตัวตน
    const token = Buffer.from(`${NETPIE_API_KEY}:${NETPIE_API_SECRET}`).toString('base64');
    
    // สร้าง URL ปลายทาง
    const netpieApiUrl = `https://api.netpie.io/v2/device/shadow/data?alias=${alias}`;
    
    // ยิง Request ไปที่ NETPIE
    console.log(`[Direct Forwarder] Forwarding request to NETPIE...`);
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
  console.log(`🚀 Direct Forwarder Server is running on port ${PORT}`);
});