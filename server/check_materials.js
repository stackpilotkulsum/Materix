const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL || 'https://uhtdwatctfiqzrzcpzmf.supabase.co', process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVodGR3YXRjdGZpcXpyemNwem1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzUxOTMsImV4cCI6MjA5NTAxMTE5M30.Z-I3avq19VwWpxgqnmVYaEojoJ8dSnFFAgqZs6OH-YE');

async function check() {
    const { data: materials, error } = await supabaseAdmin.from('materials').select('*').order('created_at', { ascending: false }).limit(10);
    console.log("Latest materials:");
    if (materials) {
        materials.forEach(m => console.log(`  File: ${m.original_name}, Username: ${m.username}, Extracted: ${m.extracted_bio ? m.extracted_bio.substring(0, 20) : 'None'}`));
    }
}
check();
