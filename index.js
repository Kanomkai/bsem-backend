// --- 1. Import เครื่องมือที่จำเป็น ---
const admin = require("firebase-admin");
const mqtt = require("mqtt");
const express = require("express");
const cors = require("cors");

// --- 2. ตั้งค่าการเชื่อมต่อ Firebase (เวอร์ชันสำหรับ Render) ---
// อ่าน "บัตร VIP" จาก "ตู้เซฟลับ" (Environment Variable)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();
console.log("Firebase Firestore connected successfully!");


// ... (โค้ดส่วน MQTT และ โรงไฟฟ้าทิพย์ เหมือนเดิมเป๊ะๆ) ...
// [REAL DATA]
const MQTT_BROKER = "broker.netpie.io";
const MQTT_PORT = 1883;
const MQTT_CLIENT_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const MQTT_USERNAME = "jiXFhjE4fgcmFtuYV16nv5Mbhpu9gLTv";
const MQTT_PASSWORD = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA";
const SUBSCRIBE_TOPIC = "@shadow/data/updated";
const client = mqtt.connect(`mqtt://${MQTT_BROKER}`, {
  port: MQTT_PORT,
  clientId: MQTT_CLIENT_ID,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
});
client.on("connect", () => {
  console.log("[REAL DATA] Connected to NETPIE MQTT Broker successfully!");
  client.subscribe(SUBSCRIBE_TOPIC, (err) => {
    if (!err) {
      console.log(`[REAL DATA] Subscribed to topic: ${SUBSCRIBE_TOPIC}`);
    } else {
      console.error("[REAL DATA] Subscription failed:", err);
    }
  });
});
client.on("message", (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    if (payload.data && payload.data.deviceId) {
      const deviceIdFromPayload = payload.data.deviceId;
      const sensorData = { ...payload.data };
      delete sensorData.deviceId;
      const dataToSave = {
        ...sensorData,
        alias: deviceIdFromPayload,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      };
      db.collection("device_data").add(dataToSave);
      console.log(
        `[REAL DATA] Saved for alias: ${deviceIdFromPayload}`
      );
    }
  } catch (error) {
    console.error("[REAL DATA] Error processing message:", error.message);
  }
});
client.on("error", (err) => {
  console.error("MQTT Client Error:", err);
});

// [FAKE DATA]
function createCalibratedDataGenerator(deviceId, averagePa, maxPa, fluctuationRange, intervalMinutes) {
  console.log(`Starting Calibrated Fake Data Generator for ${deviceId}...`);
  let lastPa = averagePa;
  let total_pkWh = 0.0;
  const intervalSeconds = intervalMinutes * 60;
  setInterval(() => {
    const fluctuation = Math.random() * (fluctuationRange * 2) - fluctuationRange;
    let Pa = lastPa + fluctuation;
    if (Pa < 100) Pa = 100 + Math.random() * 50;
    if (Pa > maxPa) Pa = maxPa - Math.random() * 20;
    lastPa = Pa;
    const Ua = 233 + (Math.random() * 4 - 2);
    const Hza = 50.0 + (Math.random() * 0.2 - 0.1);
    const Pfa = 0.9 + (Math.random() * 0.1 - 0.05);
    const Ia = Pa / (Ua * Pfa);
    const Sa = Ua * Ia;
    const Qa = Math.sqrt(Math.pow(Sa, 2) - Math.pow(Pa, 2));
    const kWh_in_this_interval = (Pa / 1000) * (intervalSeconds / 3600);
    total_pkWh += kWh_in_this_interval;
    const dataToSave = {
      Hza: parseFloat(Hza.toFixed(1)), Ia: parseFloat(Ia.toFixed(3)), Pa: parseFloat(Pa.toFixed(2)),
      Pfa: parseFloat(Pfa.toFixed(2)), Qa: parseFloat(Qa.toFixed(2)), Sa: parseFloat(Sa.toFixed(2)),
      Ua: parseFloat(Ua.toFixed(1)), pkWh: parseFloat(total_pkWh.toFixed(4)), ePkWh: 0, eQkVarh: 0,
      nkWh: 0, pkVarh: 0, alias: deviceId, timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };
    db.collection("device_data").add(dataToSave);
    console.log(`[FAKE CALIBRATED DATA] Generated for ${deviceId}: ${Pa.toFixed(0)}W`);
  }, intervalSeconds * 1000);
}
createCalibratedDataGenerator("air_cond_02", 1200, 1400, 50, 1);
createCalibratedDataGenerator("air_cond_03", 800, 1000, 40, 1.2);
createCalibratedDataGenerator("air_cond_04", 400, 600, 30, 1.5);


// --- 6. Express App (เวอร์ชันสำหรับ Render) ---
const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: 'https://bsem-5e4c1.web.app', 
  optionsSuccessStatus: 200 
};
app.use(cors(corsOptions));
app.use(express.json());

// ... (โค้ด API ทั้งหมดเหมือนเดิมเป๊ะๆ) ...
app.get("/get-latest-data/:alias", async (req, res) => {
  try {
    const { alias } = req.params;
    const snapshot = await db.collection("device_data").where('alias', '==', alias).orderBy("timestamp", "desc").limit(1).get();
    if (snapshot.empty) return res.status(404).send({ error: "No data found for this alias" });
    const docData = snapshot.docs[0].data();
    if (docData.timestamp && typeof docData.timestamp.toDate === 'function') {
        docData.timestamp = docData.timestamp.toDate().toISOString();
    }
    res.status(200).json(docData);
  } catch (error) {
    res.status(500).send({ error: "Failed to get latest data." });
  }
});
app.get("/check-alias/:alias", async (req, res) => {
  try {
    const { alias } = req.params;
    if (alias.startsWith('air_cond')) {
       res.status(200).send({ message: 'Alias is valid.' });
    } else {
       res.status(404).send({ error: 'Alias not found.' });
    }
  } catch (error) {
    res.status(500).send({ error: "Internal server error." });
  }
});
// --- [เพิ่มโค้ดส่วนนี้เข้าไป] Endpoint สำหรับดึงข้อมูลล่าสุด ---
app.get("/get-latest-data/:alias", async (req, res) => {
  try {
    const { alias } = req.params;
    
    // ค้นหาข้อมูลล่าสุดโดยเรียงตาม timestamp จากมากไปน้อย (ล่าสุดก่อน) และเอามาแค่ 1 รายการ
    const snapshot = await db.collection("device_data")
      .where('alias', '==', alias)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      // ถ้าไม่เจอข้อมูลเลย ให้ส่ง response ว่างๆ กลับไป
      return res.status(404).send({ error: 'No data found for this alias.' });
    }

    // จัดรูปแบบข้อมูล timestamp ให้อยู่ในรูปแบบที่อ่านง่าย (ISO String)
    const latestData = snapshot.docs[0].data();
    if (latestData.timestamp && typeof latestData.timestamp.toDate === 'function') {
        latestData.timestamp = latestData.timestamp.toDate().toISOString();
    }
    
    res.status(200).json(latestData);

  } catch (error) {
    console.error("!!! INTERNAL SERVER ERROR !!! in /get-latest-data:", error);
    res.status(500).send({ error: "Internal server error." });
  }
});
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

app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
  console.log("Now listening for REAL data from NETPIE and generating FAKE data...");
});

