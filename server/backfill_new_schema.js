const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient('https://uhtdwatctfiqzrzcpzmf.supabase.co', process.env.SUPABASE_SERVICE_KEY);

const splitText = (text) => {
    if (!text || typeof text !== 'string' || text.match(/^No .* section found.$/i)) return [];
    return text.split(/[\n•\-\*]+/).map(s => s.trim()).filter(s => s.length > 2);
};

async function backfillNewSchema() {
    console.log("Starting database backfill for NEW schema tables...");
    
    // Fetch all materials from database that have an extracted_bio
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
        
        let data = {};
        try {
            if (bio.startsWith('{')) {
                data = JSON.parse(bio);
            } else {
                continue;
            }
        } catch (parseErr) {
            console.log(`[SKIP] Could not parse bio for Record ID ${record.id}`);
            skipCount++;
            continue;
        }

        const extractField = (key, fallbackValue) => {
            return data[key] !== undefined ? data[key] : fallbackValue;
        };

        try {
            console.log(`[UPSERTING PROFILE] Record ID: ${record.id} (${record.original_name})...`);
            const { data: profileData, error: profileError } = await supabaseAdmin
                .from('candidate_profiles')
                .upsert({ 
                    material_id: record.id,
                    candidate_name: extractField('name', 'Not found'),
                    candidate_email: extractField('email', 'Not found'),
                    candidate_phone: extractField('phone', 'Not found'),
                    linkedin: extractField('linkedin', 'Not found'),
                    github: extractField('github', 'Not found'),
                    portfolio_link: extractField('portfolioLink', 'Not found'),
                    summary: extractField('bio', 'No summary found.'),
                    certifications: extractField('certifications', 'No certifications section found.'),
                    achievements: extractField('achievements', 'No achievements section found.'),
                    languages: extractField('languages', 'No languages section found.'),
                    extracurricular: extractField('extracurricular', 'No extra curricular activities section found.'),
                    interests: extractField('interests', 'No interests section found.'),
                    raw_text_preview: extractField('rawTextPreview', '')
                }, { onConflict: 'material_id' })
                .select('id')
                .single();
                
            if (profileError) {
                console.error(`[ERROR] Failed to upsert profile for Record ID ${record.id}:`, profileError.message);
                errorCount++;
                continue;
            } 
            
            if (profileData) {
                // Delete existing relationships to prevent duplicates on rerun
                await supabaseAdmin.from('candidate_skills').delete().eq('profile_id', profileData.id);
                await supabaseAdmin.from('candidate_experience').delete().eq('profile_id', profileData.id);
                await supabaseAdmin.from('candidate_education').delete().eq('profile_id', profileData.id);
                await supabaseAdmin.from('candidate_projects').delete().eq('profile_id', profileData.id);
                
                const skillsText = extractField('skills', '');
                const experienceText = extractField('experience', '');
                const educationText = extractField('education', '');
                const projectsText = extractField('projects', '');

                const skills = splitText(skillsText);
                if (skills.length) await supabaseAdmin.from('candidate_skills').insert(skills.map(s => ({ profile_id: profileData.id, skill_name: s })));
                
                const experience = splitText(experienceText);
                if (experience.length) await supabaseAdmin.from('candidate_experience').insert(experience.map(s => ({ profile_id: profileData.id, description: s })));
                
                const education = splitText(educationText);
                if (education.length) await supabaseAdmin.from('candidate_education').insert(education.map(s => ({ profile_id: profileData.id, description: s })));
                
                const projects = splitText(projectsText);
                if (projects.length) await supabaseAdmin.from('candidate_projects').insert(projects.map(s => ({ profile_id: profileData.id, description: s })));
                
                console.log(`[SUCCESS] Record ID ${record.id} updated successfully.`);
                successCount++;
            }
        } catch (execErr) {
            console.error(`[ERROR] Execution failed for Record ID ${record.id}:`, execErr.message);
            errorCount++;
        }
    }
    
    console.log(`\nBackfill execution summary:`);
    console.log(`- Successfully backfilled into new tables: ${successCount}`);
    console.log(`- Skipped: ${skipCount}`);
    console.log(`- Errors encountered: ${errorCount}`);
}

backfillNewSchema();
