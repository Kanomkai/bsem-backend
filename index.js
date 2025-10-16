// --- [ใส่โค้ดนี้แทนที่ app.post ของเดิมทั้งหมด] ---
app.post("/netpie-webhook", express.text({ type: '*/*' }), async (req, res) => {
  console.log("========================================");
  console.log(`[DEBUG] Webhook received at: ${new Date().toISOString()}`);

  // --- [สำคัญ] ดูข้อมูลดิบและประเภทของมัน ---
  console.log("[DEBUG] Type of req.body:", typeof req.body);
  console.log("[DEBUG] RAW BODY:", req.body);

  try {
    let shadowData;

    // --- ลองเช็คว่า body เป็น string หรือ object อยู่แล้ว ---
    if (typeof req.body === 'string') {
      console.log("[DEBUG] Body is a string. Attempting JSON.parse()...");
      shadowData = JSON.parse(req.body);
    } else if (typeof req.body === 'object' && req.body !== null) {
      console.log("[DEBUG] Body is already an object. Using it directly.");
      shadowData = req.body;
    } else {
      throw new Error("Received body is not a string or a valid object.");
    }

    console.log("[DEBUG] Parsed data is:", shadowData);

    if (shadowData && Object.keys(shadowData).length > 0) {
      // --- ใช้ Device ID ที่ Hardcode ไว้ ---
      const deviceId = "9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a";
      const latestDataRef = db.ref(`devices/${deviceId}/latest_data`);
      const historyRef = db.ref(`devices/${deviceId}/history`);

      const dataWithTimestamp = {
        ...shadowData,
        timestamp: admin.database.ServerValue.TIMESTAMP
      };

      console.log("[DEBUG] Preparing to save to Firebase...");

      await Promise.all([
        latestDataRef.set(shadowData),
        historyRef.push(dataWithTimestamp)
      ]);

      console.log("[Firebase] ✅ SUCCESS! Data saved."); // <-- Log ที่เราอยากเห็น
      res.status(200).send("OK");

    } else {
      console.log('[Result] ⚠️ The parsed data is empty. Nothing to save.');
      res.status(400).send("Received empty data.");
    }
  } catch (error) {
    // --- [สำคัญ] แสดง Error ทั้งหมด ไม่ใช่แค่ message ---
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! [CRITICAL ERROR] An error occurred in the try block:");
    console.error(error); // <-- แสดง Error แบบเต็มๆ
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    res.status(500).send("Internal Server Error");
  }
});