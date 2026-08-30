const fs = require('fs');
const path = require('path');

async function upload() {
  const username = 'test_ats_user';
  const password = 'Password123!';
  
  console.log('Logging in as test_ats_user...');
  const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  
  if (!loginResponse.ok) {
    const errText = await loginResponse.text();
    console.error('Login failed:', errText);
    return;
  }
  
  const { token } = await loginResponse.json();
  console.log('Logged in successfully. Token obtained.');
  
  // Use native FormData and Blob to construct multipart form
  const form = new FormData();
  const filePath = path.join(__dirname, '..', 'server', 'multi.pdf');
  const fileBuffer = fs.readFileSync(filePath);
  const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
  
  form.append('materials', fileBlob, 'multi.pdf');
  form.append('paths', 'multi.pdf');
  
  console.log('Uploading multi.pdf to server...');
  const uploadResponse = await fetch('http://localhost:5000/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: form
  });
  
  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    console.error('Upload failed:', errText);
    return;
  }
  
  const result = await uploadResponse.json();
  console.log('Upload success:', result);
}

upload().catch(console.error);
