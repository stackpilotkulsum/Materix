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
            .eq('original_name', 'BhuvaneswariNSResume.pdf')
            .order('created_at', { ascending: false })
            .limit(1);
            
        if (error || !files || files.length === 0) {
            console.error("File not found or DB Error:", error ? error.message : "No files");
            return;
        }
        
        const file = files[0];
        console.log("Found resume in DB:", file.original_name);
        console.log("Downloading file content...");
        const response = await fetch(file.file_url);
        if (!response.ok) {
            console.error("Failed to download file:", response.statusText);
            return;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const dataBuffer = Buffer.from(arrayBuffer);

        const tempFilePath = path.join(__dirname, 'temp_test_resume.pdf');
        fs.writeFileSync(tempFilePath, dataBuffer);
        console.log("Saved PDF locally to temp_test_resume.pdf");

        console.log("\nRunning parseResume from parser.js...");
        const result = await parseResume(tempFilePath, file.original_name);
        
        console.log("\n--- INTEGRATED PARSER RESULT ---");
        console.log("Name:", result.name);
        console.log("Email:", result.email);
        console.log("Phone:", result.phone);
        console.log("LinkedIn:", result.linkedin);
        console.log("GitHub:", result.github);
        console.log("Portfolio:", result.portfolioLink);
        console.log("\nSkills (First 150 chars):\n", result.skills.substring(0, 150));
        console.log("\nExperience (First 300 chars):\n", result.experience.substring(0, 300));
        console.log("\nEducation (First 300 chars):\n", result.education.substring(0, 300));
        console.log("\nInterests:\n", result.interests);

        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    } catch (e) {
        console.error("Execution failed:", e);
    }
}

run();
