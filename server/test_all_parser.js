const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVodGR3YXRjdGZpcXpyemNwem1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzUxOTMsImV4cCI6MjA5NTAxMTE5M30.Z-I3avq19VwWpxgqnmVYaEojoJ8dSnFFAgqZs6OH-YE';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uhtdwatctfiqzrzcpzmf.supabase.co';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const path = require('path');
const fs = require('fs');
const { parseResume } = require('./parser.js');

async function run() {
    try {
        const { data: files, error } = await supabaseAdmin
            .from('materials')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (error || !files || files.length === 0) {
            console.error("DB Error or no files:", error ? error.message : "No files");
            return;
        }

        // Find digital PDFs (usually have non-empty text, or we can just try all of them)
        const pdfFiles = files.filter(f => f.original_name.endsWith('.pdf'));

        for (const file of pdfFiles) {
            console.log("\n==========================================");
            console.log("Processing File:", file.original_name);
            console.log("URL:", file.file_url);
            
            try {
                const response = await fetch(file.file_url);
                if (!response.ok) {
                    console.error("Failed to download file:", response.statusText);
                    continue;
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const dataBuffer = Buffer.from(arrayBuffer);

                const tempPath = path.join(__dirname, 'temp_test.pdf');
                fs.writeFileSync(tempPath, dataBuffer);

                const result = await parseResume(tempPath, file.original_name);
                console.log("Name Candidate:", result.name);
                console.log("Email:", result.email);
                console.log("Phone:", result.phone);
                console.log("LinkedIn:", result.linkedin);
                console.log("GitHub:", result.github);
                console.log("\n--- Skill Section Preview ---");
                console.log(result.skills.substring(0, 300));
                console.log("\n--- Experience Section Preview ---");
                console.log(result.experience.substring(0, 300));

                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            } catch (fileErr) {
                console.error(`Error processing file ${file.original_name}:`, fileErr.message);
            }
        }
    } catch (e) {
        console.error("Outer execution failed:", e);
    }
}

run();
