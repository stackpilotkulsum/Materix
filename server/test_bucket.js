const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testBucketUpload() {
    const fileBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001e52722880000000049454e44ae426082', 'hex');
    const bucketPath = `testuser/test_image.png`;
    
    console.log("Attempting to upload PNG to materials bucket...");
    const { data, error } = await supabaseAdmin.storage.from('materials').upload(bucketPath, fileBuffer, {
        contentType: 'image/png'
    });
    
    if (error) {
        console.error("Upload failed! Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Upload succeeded! Data:", data);
        // Clean it up
        await supabaseAdmin.storage.from('materials').remove([bucketPath]);
    }
}
testBucketUpload();
