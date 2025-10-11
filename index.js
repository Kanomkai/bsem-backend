// --- 1. Import เครื่องมือที่จำเป็น ---
const admin = require("firebase-admin");
const mqtt = require("mqtt");
const express = require("express");
const cors = require("cors");
const axios = require("axios"); // (อย่าลืมรัน 'npm install axios' ก่อนนะครับ)

// --- 2. ตั้งค่าการเชื่อมต่อ Firebase ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();
console.log("✅ Firebase Firestore connected successfully!");


// --- 3. [แก้ไข] ตั้งค่าการเชื่อมต่อ NETPIE MQTT ให้ถูกต้อง ---
const MQTT_BROKER = "broker.netpie.io";
const MQTT_PORT = 8883; // ใช้ Port 8883 สำหรับการเชื่อมต่อที่ปลอดภัย (TLS/SSL)
const MQTT_CLIENT_ID = "Y9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const MQTT_USERNAME = "jiXFhjE4fgcmFtuYV16nv5Mbhpu9gLTv";
const MQTT_PASSWORD = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA";
const SUBSCRIBE_TOPIC = "@shadow/data/updated";

// เปลี่ยน protocol เป็น 'mqtts' เพื่อใช้ Port ที่ปลอดภัย
const client = mqtt.connect(`mqtts://${MQTT_BROKER}`, {
  port: MQTT_PORT,
  clientId: MQTT_CLIENT_ID,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
});


// --- 4. ระบบดักฟังและบันทึกข้อมูลจาก NETPIE ลง Firestore อัตโนมัติ ---
client.on("connect", () => {
  console.log("✅ MQTT Client connected to NETPIE successfully!");
  client.subscribe(SUBSCRIBE_TOPIC, (err) => {
    if (!err) {
      console.log(`👂 Subscribed to topic: ${SUBSCRIBE_TOPIC}`);
    } else {
      console.error("!!! MQTT Subscribe Error:", err);
    }
  });
});

client.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const alias = payload.alias;
    const data = payload.data;
    const timestamp = new Date(payload.timestamp); // แปลงเป็น Object Date ของ JavaScript

    if (alias && data && timestamp) {
      await db.collection("device_data").add({ alias, data, timestamp });
      console.log(`💾 Saved data for [${alias}] to Firestore.`);
    }
  } catch (error) {
    console.error("!!! Error processing MQTT message:", error);
  }
});

client.on("error", (error) => {
  console.error("!!! MQTT Client Error:", error);
});


// --- 5. สร้าง Express App และเปิด CORS ---
const app = express();
app.use(cors());
app.use(express.json());


// --- 6. API Endpoints (เส้นทางต่างๆ) ---

// [Option A] Endpoint สำหรับดึงข้อมูลล่าสุด (Live Data) จาก NETPIE API โดยตรง
app.get("/get-latest-data/:alias", async (req, res) => {
  try {
    const { alias } = req.params;
    const token = Buffer.from(`${MQTT_CLIENT_ID}:${MQTT_PASSWORD}`).toString('base64');
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

// Endpoint สำหรับตรวจสอบ Alias
app.get("/check-alias/:alias", async (req, res) => {
  try {
    const { alias } = req.params;
    const snapshot = await db.collection("device_data").where('alias', '==', alias).limit(1).get();
    if (!snapshot.empty) {
       res.status(200).send({ message: 'Alias is valid.' });
    } else {
       res.status(404).send({ error: 'Alias not found.' });
    }
  } catch (error) {
    res.status(500).send({ error: "Internal server error." });
  }
});


// --- 7. เริ่มรันเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});