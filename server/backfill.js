const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function backfill() {
    console.log("Starting database backfill for extracted columns...");
    
    // Fetch all materials from database
    const { data: materials, error } = await supabaseAdmin
        .from('materials')
        .select('id, original_name, extracted_bio');
        
    if (error) {
        console.error("Error fetching materials:", error.message);
        process.exit(1);
    }
    
    console.log(`Found ${materials.length} records. Processing...`);
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (const record of materials) {
        const bio = record.extracted_bio;
        if (!bio) {
            console.log(`[SKIP] Record ID: ${record.id} (${record.original_name}) - No extracted_bio content.`);
            skipCount++;
            continue;
        }
        
        if (!bio.startsWith('{')) {
            console.log(`[SKIP] Record ID: ${record.id} (${record.original_name}) - extracted_bio is not a JSON string (contains: "${bio.substring(0, 30)}...")`);
            skipCount++;
            continue;
        }
        
        let data = {};
        let parseFailed = false;

        try {
            data = JSON.parse(bio);
        } catch (parseErr) {
            parseFailed = true;
            console.log(`[WARN] Standard JSON parsing failed for Record ID ${record.id} (${record.original_name}), attempting regex recovery...`);
        }

        // Regex extractor helper for truncated/invalid JSON strings
        const extractField = (key, fallbackValue) => {
            if (!parseFailed && data[key] !== undefined) {
                return data[key];
            }
            // Match "key": "value" allowing escaped quotes inside value
            const regex = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
            const match = bio.match(regex);
            if (match) {
                try {
                    // Try parsing just this value to unescape standard JSON characters
                    return JSON.parse(`"${match[1]}"`);
                } catch (e) {
                    return match[1];
                }
            }
            return fallbackValue;
        };

        try {
            // Map fields with fallback to regex extraction if JSON parsing failed
            const updatePayload = {
                candidate_name: extractField('name', 'Not found'),
                candidate_email: extractField('email', 'Not found'),
                candidate_phone: extractField('phone', 'Not found'),
                linkedin: extractField('linkedin', 'Not found'),
                github: extractField('github', 'Not found'),
                portfolio_link: extractField('portfolioLink', 'Not found'),
                summary: extractField('bio', 'No summary found.'),
                skills: extractField('skills', 'No skills section found.'),
                experience: extractField('experience', 'No experience section found.'),
                education: extractField('education', 'No education section found.'),
                projects: extractField('projects', 'No projects section found.'),
                certifications: extractField('certifications', 'No certifications section found.'),
                achievements: extractField('achievements', 'No achievements section found.'),
                languages: extractField('languages', 'No languages section found.'),
                extracurricular: extractField('extracurricular', 'No extra curricular activities section found.'),
                interests: extractField('interests', 'No interests section found.'),
                raw_text_preview: extractField('rawTextPreview', '')
            };
            
            console.log(`[UPDATING] Record ID: ${record.id} (${record.original_name}) with extracted fields...`);
            const { error: updateErr } = await supabaseAdmin
                .from('materials')
                .update(updatePayload)
                .eq('id', record.id);
                
            if (updateErr) {
                console.error(`[ERROR] Failed to update Record ID ${record.id}:`, updateErr.message);
                errorCount++;
            } else {
                console.log(`[SUCCESS] Record ID ${record.id} updated successfully.`);
                successCount++;
            }
        } catch (execErr) {
            console.error(`[ERROR] Execution failed for Record ID ${record.id}:`, execErr.message);
            errorCount++;
        }
    }
    
    console.log(`\nBackfill execution summary:`);
    console.log(`- Successfully backfilled: ${successCount}`);
    console.log(`- Skipped: ${skipCount}`);
    console.log(`- Errors encountered: ${errorCount}`);
}

backfill();
