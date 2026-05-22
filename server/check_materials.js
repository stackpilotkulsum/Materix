const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
    const { data: materials, error } = await supabaseAdmin.from('materials').select('*').order('created_at', { ascending: false }).limit(10);
    console.log("Latest materials:");
    if (materials) {
        materials.forEach(m => console.log(`  File: ${m.original_name}, Username: ${m.username}, Extracted: ${m.extracted_bio ? m.extracted_bio.substring(0, 20) : 'None'}`));
    }
}
check();
