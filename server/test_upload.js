const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch'); // Using native fetch in node 18+ but form-data requires some wrapper or native

async function testUpload() {
    try {
        // Create a dummy image file
        const dummyPath = path.join(__dirname, 'test-image.png');
        fs.writeFileSync(dummyPath, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001e52722880000000049454e44ae426082', 'hex'));

        console.log("Logging in to get token...");
        const loginRes = await fetch('http://localhost:5000/api/auth/google-register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // We'll simulate a mock google credential? No, Google OAuth requires real token.
            // Let's use supabase login mock? No.
        });
        
    } catch(err) {
        console.error(err);
    }
}
testUpload();
