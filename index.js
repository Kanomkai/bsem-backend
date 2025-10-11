// --- 1. Import เครื่องมือที่จำเป็น ---
const admin = require("firebase-admin");
const mqtt = require("mqtt");
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


// --- 3. ตั้งค่าการเชื่อมต่อ NETPIE MQTT ---
const MQTT_BROKER = "broker.netpie.io";
const MQTT_PORT = 8883;
const MQTT_CLIENT_ID = "Y9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const MQTT_USERNAME = "jiXFhjE4fgcmFtuYV16nv5Mbhpu9gLTv";
const MQTT_PASSWORD = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA";
const SUBSCRIBE_TOPIC = "@shadow/data/updated";

const client = mqtt.connect(`mqtts://${MQTT_BROKER}`, { port: MQTT_PORT, clientId: MQTT_CLIENT_ID, username: MQTT_USERNAME, password: MQTT_PASSWORD });


// --- 4. ระบบดักฟังและบันทึกข้อมูลจริงจาก NETPIE ---
client.on("connect", () => {
  console.log("✅ MQTT Client connected to NETPIE successfully!");
  client.subscribe(SUBSCRIBE_TOPIC, (err) => !err && console.log(`👂 Subscribed to topic: ${SUBSCRIBE_TOPIC}`));
});
client.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const { alias, data, timestamp } = payload;
    if (alias && data && timestamp) {
      await db.collection("device_data").add({ alias, data, timestamp: new Date(timestamp) });
      console.log(`💾 [REAL DATA] Saved for [${alias}] to Firestore.`);
    }
  } catch (error) {
    console.error("!!! Error processing MQTT message:", error);
  }
});
client.on("error", (error) => console.error("!!! MQTT Client Error:", error));


// --- 5. [เพิ่มเข้ามา] โรงไฟฟ้าทิพย์ (ฟังก์ชันสร้างข้อมูลปลอม) ---
function generateFakeDeviceData(deviceId) {
    let averagePa = 1200, maxPa = 1400, fluctuationRange = 50;
    if (deviceId === 'air_cond_03') { averagePa = 800; maxPa = 1000; fluctuationRange = 40; }
    if (deviceId === 'air_cond_04') { averagePa = 400; maxPa = 600; fluctuationRange = 30; }

    const Pa = averagePa + (Math.random() * (fluctuationRange * 2) - fluctuationRange);
    const Ua = 233 + (Math.random() * 4 - 2);
    const Hza = 50.0 + (Math.random() * 0.2 - 0.1);
    const Pfa = 0.9 + (Math.random() * 0.1 - 0.05);
    const Ia = Pa / (Ua * Pfa);
    const Sa = Ua * Ia;
    const Qa = Math.sqrt(Math.pow(Sa, 2) - Math.pow(Pa, 2));

    // ส่งคืนข้อมูลในรูปแบบเดียวกับข้อมูลจริง
    return {
      alias: deviceId,
      timestamp: new Date().toISOString(),
      data: {
        Hza: parseFloat(Hza.toFixed(1)), Ia: parseFloat(Ia.toFixed(3)), Pa: parseFloat(Pa.toFixed(2)),
        Pfa: parseFloat(Pfa.toFixed(2)), Qa: parseFloat(Qa.toFixed(2)), Sa: parseFloat(Sa.toFixed(2)),
        Ua: parseFloat(Ua.toFixed(1)), pkWh: parseFloat((Math.random() * 100).toFixed(4)), // สุ่มค่า pkWh ไปก่อน
      }
    };
}


// --- 6. สร้าง Express App และเปิด CORS ---
const app = express();
app.use(cors());
app.use(express.json());


// --- 7. API Endpoints (เส้นทางต่างๆ) ---

// [แก้ไข] Endpoint สำหรับดึงข้อมูลล่าสุด (ฉบับผสม)
app.get("/get-latest-data/:alias", async (req, res) => {
  const { alias } = req.params;

  // --- Logic การตัดสินใจ ---
  if (alias === 'air_cond_01') {
    // --- ถ้าเป็น air_cond_01 ให้ดึงข้อมูลจริงจาก NETPIE ---
    try {
      const token = Buffer.from(`${MQTT_CLIENT_ID}:${MQTT_PASSWORD}`).toString('base64');
      const netpieApiUrl = `https://api.netpie.io/v2/device/shadow/data?alias=${alias}`;
      console.log(`[REAL DATA] Forwarding request to NETPIE for alias: ${alias}`);
      const response = await axios.get(netpieApiUrl, { headers: { 'Authorization': `Basic ${token}` } });
      res.status(200).json(response.data);
    } catch (error) {
      console.error(`!!! NETPIE API ERROR for ${alias}:`, error.response?.data || error.message);
      res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
    }
  } else if (['air_cond_02', 'air_cond_03', 'air_cond_04'].includes(alias)) {
    // --- ถ้าเป็น 02, 03, 04 ให้สร้างข้อมูลปลอมจากโรงไฟฟ้าทิพย์ ---
    console.log(`[FAKE DATA] Generating data for alias: ${alias}`);
    const fakeData = generateFakeDeviceData(alias);
    res.status(200).json(fakeData);
  } else {
    // --- ถ้าเป็น alias อื่นๆ ที่ไม่รู้จัก ---
    res.status(404).send({ error: `Alias '${alias}' not found.` });
  }
});

// Endpoint สำหรับดึงข้อมูลย้อนหลัง (ยังคงดึงจาก Firestore เหมือนเดิม)
app.get("/get-historical-data/:alias", async (req, res) => {
    // ... โค้ดส่วนนี้เหมือนเดิมเป๊ะๆ ไม่ต้องแก้ไข ...
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


// --- 8. เริ่มรันเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});