const fetch = require('node-fetch');

// --- !!! ขั้นตอนที่สำคัญที่สุด !!! ---
// ให้นำ "Token" ของ Device มาวางที่นี่
const TEST_DEVICE_TOKEN = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5UE03RkVRcyIsImlhdCI6MTc1OTM4NTcyMCwibmJmIjoxNzU5Mzg1NDIwLCJleHAiOjE3NTk0NzIxMjAsImV4cGlyZUluIjo4NjQwMCwiY3R4Ijp7ImNsaWVudGlkIjoiNWI0NGM0ZDRkMWMwODY5ZmE0YjNlZDkyZTFmNzgzYjgiLCJ1c2VyaWQiOiJVNTc1MDU4MTQyNjQzIn0sInNjb3BlIjpbIm93bmVyIl0sImlzcyI6ImNlcjp1c2VydG9rZW4ifQ.e71C1zN81__MDWkbnMbJgzbvSevzfJmsaTbfWdrUFmLu8X2K_sojBCZwnpRgyvoIX-8uPRGpNRvYkU1j3rAW0A';
// ------------------------------------

async function runTokenTest() {
    console.log('--- Starting NETPIE Connection Test (using TOKEN) ---');
    
    if (TEST_DEVICE_TOKEN === 'PASTE_YOUR_DEVICE_TOKEN_HERE') {
        console.error('!!! ERROR: Please paste your actual Device Token into the script.');
        return;
    }

    const API_URL = 'https://api.netpie.io/v2/device/shadow/data';
    // **สังเกต:** Header เปลี่ยนไปใช้ "Device" นำหน้า Token
    const authHeader = `Device ${TEST_DEVICE_TOKEN}`;

    console.log(`Attempting to connect with Token...`);
    
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: { 'Authorization': authHeader }
        });

        console.log(`\n--- TEST RESULT ---`);
        console.log(`Status Code: ${response.status}`);

        if (response.ok) {
            const data = await response.json();
            console.log('✅ SUCCESS! Connection successful. The TOKEN method works!');
            console.log(data);
        } else {
            console.log('❌ FAILED! Both Basic Auth and Token methods have failed.');
            console.log('This strongly indicates an issue on the NETPIE account/project side.');
        }

    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
}

runTokenTest();