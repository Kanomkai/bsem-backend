// --- 1. Import เครื่องมือที่จำเป็น (เหลือแค่ 2 อย่าง) ---
const admin = require("firebase-admin");
const mqtt = require("mqtt");

console.log("▶️ Starting the NETPIE-to-Firebase Data Pipeline...");

// --- 2. ตั้งค่าการเชื่อมต่อ Firebase ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();
console.log("✅ Firebase Firestore connected successfully!");


// --- 3. [สำคัญ!] ตั้งค่า Credentials สำหรับ MQTT ---
// *** คุณต้องนำ Client ID, Token, Secret ที่สร้างใหม่สำหรับ bsem-backend-server มาใส่ตรงนี้ ***
const MQTT_CLIENT_ID = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
const MQTT_USERNAME = "jiXFhjE4fgcmFtuYV16nv5Mbhpu9gLTv"; // Token คือ Username
const MQTT_PASSWORD = "cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA"; // Secret คือ Password
// ************************************************************************************

const MQTT_BROKER = "broker.netpie.io";
const MQTT_PORT = 8883;
const SUBSCRIBE_TOPIC = "@shadow/data/updated";

console.log("▶️ Attempting to connect to NETPIE MQTT Broker...");
const client = mqtt.connect(`mqtts://${MQTT_BROKER}`, { port: MQTT_PORT, clientId: MQTT_CLIENT_ID, username: MQTT_USERNAME, password: MQTT_PASSWORD });


// --- 4. ระบบดักฟังและบันทึกข้อมูล (หัวใจของท่อส่งข้อมูล) ---
client.on("connect", () => {
  console.log("✅ MQTT Client connected to NETPIE successfully!");
  client.subscribe(SUBSCRIBE_TOPIC, (err) => {
    if (!err) {
      console.log(`👂 Listening for messages on topic: ${SUBSCRIBE_TOPIC}`);
      console.log("--- The Data Pipeline is now active and waiting for data. ---");
    } else {
      console.error("!!! MQTT Subscribe Error:", err);
    }
  });
});

client.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    
    const alias = payload.alias;
    const dataFromDevice = payload.datadevice;
    const timestamp = payload.timestamp;

    // แค่เช็คว่ามีข้อมูลสำคัญครบหรือไม่
    if (alias && dataFromDevice && timestamp) {
      await db.collection("device_data").add({ alias, data: dataFromDevice, timestamp: new Date(timestamp) });
      console.log(`💾 [Data Pipeline] Successfully saved data for [${alias}] to Firestore.`);
    }
  } catch (error) {
    console.error("!!! [Data Pipeline] Error processing incoming message:", error);
  }
});

client.on("error", (error) => {
  console.error("!!! MQTT Client Error:", error.message);
  console.log("--- The Data Pipeline will attempt to reconnect. ---");
});