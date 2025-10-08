const fetch = require('node-fetch');

// --- !!! ขั้นตอนที่สำคัญที่สุด !!! ---
// ให้นำ Client ID และ Secret Key ล่าสุดจาก NETPIE มาวางที่นี่ "โดยตรง"
const TEST_CLIENT_ID = '9585c7e4-97d7-4c50-b2f1-ea5fc1125e8a';
const TEST_SECRET_KEY = 'cJWyfo4EKij9AHzjtu3gJFYUKTiq1feA';
// ------------------------------------

async function runTest() {
    console.log('--- Starting NETPIE Connection Test ---');
    
    if (TEST_CLIENT_ID === 'PASTE_YOUR_CLIENT_ID_HERE' || TEST_SECRET_KEY === 'PASTE_YOUR_SECRET_KEY_HERE') {
        console.error('!!! ERROR: Please paste your actual Client ID and Secret Key into the script.');
        return;
    }

    const API_URL = 'https://api.netpie.io/v2/device/shadow/data';
    const authHeader = 'Basic ' + Buffer.from(`${TEST_CLIENT_ID}:${TEST_SECRET_KEY}`).toString('base64');

    console.log(`Attempting to connect with Client ID: ${TEST_CLIENT_ID}`);
    
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: { 'Authorization': authHeader }
        });

        console.log(`\n--- TEST RESULT ---`);
        console.log(`Status Code: ${response.status}`);

        if (response.ok) {
            const data = await response.json();
            console.log('✅ SUCCESS! Connection successful. Data received:');
            console.log(data);
        } else {
            console.log('❌ FAILED! The credentials are NOT correct.');
            console.log('Please double-check the Client ID and Secret Key on the NETPIE website.');
        }

    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
}

runTest();