// --- 1. Import เครื่องมือที่จำเป็น ---
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// อ่านค่า Service Account จาก Environment Variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

// --- 3. เริ่มการเชื่อมต่อกับ Firebase ---
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://bsem-5e4c1-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
console.log("▶️ Starting Firebase Bridge Server...");

// --- 4. สร้าง Server ---
const app = express(); // <--- 🚨 THIS LINE WAS MISSING!
app.use(cors());

// --- [ใส่โค้ดนี้แทนที่ app.post ของเดิมทั้งหมด] ---
app.post("/netpie-webhook", async (req, res) => {
    // บรรทัดแรกสุดของโค้ดที่จะทำงานทันทีที่ถูกเรียก
    console.log(`[ENTRY] Webhook ถูกเรียก ณ เวลา ${new Date().toISOString()}`);

    try {
        let shadowData = req.body; // ถ้าใช้ express.json() สำเร็จ ข้อมูลอาจจะกลายเป็น object มาแล้ว

        console.log(`[DEBUG] ประเภทของ req.body เริ่มต้น: ${typeof shadowData}`);
        console.log(`[DEBUG] เนื้อหาของ req.body เริ่มต้น:`, shadowData);

        // ถ้าข้อมูลยังเป็น string อยู่ แปลว่า express.json() ล้มเหลว และ express.text() ทำงานแทน
        if (typeof shadowData === 'string') {
            console.log("[DEBUG] ข้อมูลเป็น string, กำลังจะลอง JSON.parse() ด้วยตัวเอง");
            shadowData = JSON.parse(shadowData);
        }

        if (shadowData && Object.keys(shadowData).length > 0) {
            const deviceId = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a"; // ใช้ ID ที่ระบุตายตัว
            const latestDataRef = db.ref(`devices/${deviceId}/latest_data`);
            const historyRef = db.ref(`devices/${deviceId}/history`);

            const dataWithTimestamp = {
                ...shadowData,
                timestamp: admin.database.ServerValue.TIMESTAMP
            };

            await Promise.all([
                latestDataRef.set(shadowData),
                historyRef.push(dataWithTimestamp)
            ]);

            console.log("[Firebase] ✅ SUCCESS! บันทึกข้อมูลเรียบร้อย");
            res.status(200).send("OK");
        } else {
            console.log('[Result] ⚠️ ข้อมูลว่างเปล่า ไม่มีการบันทึก');
            res.status(400).send("Received empty data.");
        }
    } catch (error) {
        console.error("!!! [CRITICAL ERROR] เกิดข้อผิดพลาดร้ายแรง:", error);
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