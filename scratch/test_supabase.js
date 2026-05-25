const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../server/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uhtdwatctfiqzrzcpzmf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log('Supabase URL:', SUPABASE_URL);
console.log('Anon Key Present:', !!SUPABASE_ANON_KEY);
console.log('Service Key Present:', !!SUPABASE_SERVICE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);

async function testConnection() {
    console.log('\n--- Testing Database ---');
    try {
        const { data: profiles, error: pError } = await supabaseAdmin.from('profiles').select('*').limit(1);
        if (pError) console.error('Profiles table error:', pError.message);
        else console.log('Profiles table connection: SUCCESS, rows:', profiles.length);

        const { data: materials, error: mError } = await supabaseAdmin.from('materials').select('*').limit(1);
        if (mError) console.error('Materials table error:', mError.message);
        else console.log('Materials table connection: SUCCESS, rows:', materials.length);
    } catch (e) {
        console.error('DB query exception:', e.message);
    }

    console.log('\n--- Testing Storage ---');
    try {
        const { data: buckets, error: bError } = await supabaseAdmin.storage.listBuckets();
        if (bError) {
            console.error('List buckets error:', bError.message);
        } else {
            console.log('Buckets list:', buckets.map(b => `${b.name} (public: ${b.public})`));
            const hasMaterials = buckets.some(b => b.name === 'materials');
            if (!hasMaterials) {
                console.error('CRITICAL: "materials" bucket does not exist!');
            } else {
                console.log('Bucket "materials" exists: YES');
                // Test simple upload
                console.log('Testing file upload...');
                const testBuffer = Buffer.from('test upload content');
                const testPath = `test-${Date.now()}.txt`;
                const { data: uploadData, error: uError } = await supabaseAdmin.storage.from('materials').upload(testPath, testBuffer, {
                    contentType: 'text/plain',
                    upsert: true
                });
                if (uError) {
                    console.error('Storage upload failed:', uError.message);
                } else {
                    console.log('Storage upload: SUCCESS!', uploadData);
                    // Cleanup
                    await supabaseAdmin.storage.from('materials').remove([testPath]);
                }
            }
        }
    } catch (e) {
        console.error('Storage exception:', e.message);
    }
}

testConnection();
