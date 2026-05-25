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
        
        try {
            const data = JSON.parse(bio);
            
            // Map the parsed JSON fields to the database columns
            const updatePayload = {
                candidate_name: data.name || 'Not found',
                candidate_email: data.email || 'Not found',
                candidate_phone: data.phone || 'Not found',
                linkedin: data.linkedin || 'Not found',
                github: data.github || 'Not found',
                portfolio_link: data.portfolioLink || 'Not found',
                summary: data.bio || 'No summary found.',
                skills: data.skills || 'No skills section found.',
                experience: data.experience || 'No experience section found.',
                education: data.education || 'No education section found.',
                projects: data.projects || 'No projects section found.',
                certifications: data.certifications || 'No certifications section found.',
                achievements: data.achievements || 'No achievements section found.',
                languages: data.languages || 'No languages section found.',
                extracurricular: data.extracurricular || 'No extra curricular activities section found.',
                interests: data.interests || 'No interests section found.',
                raw_text_preview: data.rawTextPreview || ''
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
        } catch (parseErr) {
            console.error(`[ERROR] Parsing failed for Record ID ${record.id}:`, parseErr.message);
            errorCount++;
        }
    }
    
    console.log(`\nBackfill execution summary:`);
    console.log(`- Successfully backfilled: ${successCount}`);
    console.log(`- Skipped: ${skipCount}`);
    console.log(`- Errors encountered: ${errorCount}`);
}

backfill();
