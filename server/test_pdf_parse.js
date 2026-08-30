const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVodGR3YXRjdGZpcXpyemNwem1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzUxOTMsImV4cCI6MjA5NTAxMTE5M30.Z-I3avq19VwWpxgqnmVYaEojoJ8dSnFFAgqZs6OH-YE';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uhtdwatctfiqzrzcpzmf.supabase.co';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
    const { data: files, error } = await supabaseAdmin
        .from('materials')
        .select('*')
        .eq('original_name', 'BhuvaneswariNSResume.pdf')
        .order('created_at', { ascending: false })
        .limit(1);
        
    if (error) {
        console.error("DB Error:", error.message);
        return;
    }
    
    if (files && files.length > 0) {
        const f = files[0];
        console.log("File Name:", f.original_name);
        try {
            const parsed = JSON.parse(f.extracted_bio);
            console.log("\n--- RAW TEXT PREVIEW ---");
            console.log(parsed.rawTextPreview);
        } catch (e) {
            console.log("Raw bio parse error:", e);
        }
    } else {
        console.log("BhuvaneswariNSResume.pdf not found in DB.");
    }
}

run();
