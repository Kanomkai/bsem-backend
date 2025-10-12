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


// --- 3. [สำคัญ!] ตั้งค่า Credentials ทั้ง 2 ชุดให้ถูกต้อง ---

// ชุดที่ 1: สำหรับ RESTful API (Application Key)
const NETPIE_API_KEY = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const NETPIE_API_SECRET = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA";

// ชุดที่ 2: สำหรับ MQTT (Device Credentials ที่สร้างใหม่)
// *** คุณต้องนำ Client ID, Token, Secret ที่สร้างใหม่สำหรับ bsem-backend-server มาใส่ตรงนี้ ***
const MQTT_CLIENT_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const MQTT_USERNAME = "jiXFhjE4fgcmFtuYV16nv5Mbhpu9gLTv"; // Token คือ Username
const MQTT_PASSWORD = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA"; // Secret คือ Password
// ************************************************************************************

const MQTT_BROKER = "broker.netpie.io";
const MQTT_PORT = 8883;
const SUBSCRIBE_TOPIC = "@shadow/data/updated";

const client = mqtt.connect(`mqtts://${MQTT_BROKER}`, { port: MQTT_PORT, clientId: MQTT_CLIENT_ID, username: MQTT_USERNAME, password: MQTT_PASSWORD });


// --- 4. [เวอร์ชันใหม่] ระบบดักฟัง MQTT และบันทึกข้อมูลจริง (ไม่เช็คชื่อ alias) ---
client.on("connect", () => {
  console.log("✅ MQTT Client connected to NETPIE successfully!");
  client.subscribe(SUBSCRIBE_TOPIC, (err) => !err && console.log(`👂 Subscribed to topic: ${SUBSCRIBE_TOPIC}`));
});

client.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    
    const alias = payload.alias;
    const dataFromDevice = payload.datadevice;
    const timestamp = payload.timestamp;

    // แค่เช็คว่ามีข้อมูลสำคัญครบหรือไม่ โดยไม่สนว่า alias ชื่ออะไร
    if (alias && dataFromDevice && timestamp) {
      await db.collection("device_data").add({ alias, data: dataFromDevice, timestamp: new Date(timestamp) });
      console.log(`💾 [REAL DATA] Saved for [${alias}] to Firestore.`);
    }
  } catch (error) {
    console.error("!!! Error processing MQTT message:", error);
  }
});

client.on("error", (error) => console.error("!!! MQTT Client Error:", error.message));


// --- 5. โรงไฟฟ้าทิพย์ (ฟังก์ชันสร้างข้อมูลปลอม) ---
function generateFakeDeviceData(deviceId) {
    let averagePa = 1200, maxPa = 1400, fluctuationRange = 50;
    if (deviceId === 'air_cond_03') { averagePa = 800; maxPa = 1000; fluctuationRange = 40; }
    if (deviceId === 'air_cond_04') { averagePa = 400; maxPa = 600; fluctuationRange = 30; }

    const Pa = averagePa + (Math.random() * (fluctuationRange * 2) - fluctuationRange);
    const Ua = 233 + (Math.random() * 4 - 2);
    const Pfa = 0.9 + (Math.random() * 0.1 - 0.05);
    const Ia = Pa / (Ua * Pfa);

    return {
      alias: deviceId,
      timestamp: new Date().toISOString(),
      datadevice: {
        Pa: parseFloat(Pa.toFixed(2)), Ua: parseFloat(Ua.toFixed(1)), Ia: parseFloat(Ia.toFixed(3)),
        Hza: 50.0, Pfa: parseFloat(Pfa.toFixed(2)), pkWh: parseFloat((Math.random() * 100).toFixed(2))
      }
    };
}


// --- 6. สร้าง Express App (RESTful API) ---
const app = express();
app.use(cors());
app.use(express.json());


// --- 7. API Endpoints ---
app.get("/get-latest-data/:alias", async (req, res) => {
  const { alias } = req.params;

  if (alias === 'air_cond_01') {
    try {
      const token = Buffer.from(`${NETPIE_API_KEY}:${NETPIE_API_SECRET}`).toString('base64');
      const netpieApiUrl = `https://api.netpie.io/v2/device/shadow/data?alias=${alias}`;
      console.log(`[REAL API] Forwarding request to NETPIE for: ${alias}`);
      const response = await axios.get(netpieApiUrl, { headers: { 'Authorization': `Basic ${token}` } });
      res.status(200).json(response.data);
    } catch (error) {
      console.error(`!!! [REAL API] NETPIE ERROR for ${alias}:`, error.response?.data || error.message);
      res.status(error.response?.status || 500).send(error.response?.data || { message: "Internal server error." });
    }
  } else if (['air_cond_02', 'air_cond_03', 'air_cond_04'].includes(alias)) {
    console.log(`[FAKE API] Generating data for: ${alias}`);
    const fakeData = generateFakeDeviceData(alias);
    res.status(200).json(fakeData);
  } else {
    res.status(404).send({ error: `Alias '${alias}' not found.` });
  }
});

app.get("/get-historical-data/:alias", async (req, res) => {
    try {
        const { alias } = req.params;
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).send({ error: "startDate and endDate query are required." });
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        const snapshot = await db.collection("device_data").where('alias', '==', alias).where('timestamp', '>=', start).where('timestamp', '<=', end).orderBy("timestamp", "asc").get();
        
        if (snapshot.empty) return res.status(200).json([]);
        
        const data = snapshot.docs.map(doc => {
            const docData = doc.data();
            if (docData.timestamp && typeof docData.timestamp.toDate === 'function') {
                docData.timestamp = docData.timestamp.toDate().toISOString();
            }
            return docData;
        });
        res.status(200).json(data);
    } catch (error) {
        console.error("!!! FIRESTORE ERROR in /get-historical-data:", error);
        res.status(500).send({ error: "Failed to get historical data." });
    }
});


// --- 8. เริ่มรันเซิร์ฟเวอร์ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});