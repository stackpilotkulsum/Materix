const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVodGR3YXRjdGZpcXpyemNwem1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzUxOTMsImV4cCI6MjA5NTAxMTE5M30.Z-I3avq19VwWpxgqnmVYaEojoJ8dSnFFAgqZs6OH-YE';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uhtdwatctfiqzrzcpzmf.supabase.co';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const path = require('path');
const fs = require('fs');

async function run() {
    const { data: files } = await supabaseAdmin
        .from('materials')
        .select('*')
        .eq('original_name', 'BhuvaneswariNSResume.pdf')
        .order('created_at', { ascending: false })
        .limit(1);
        
    if (!files || files.length === 0) {
        console.log("No file found.");
        return;
    }
    
    const f = files[0];
    const parsedBio = JSON.parse(f.extracted_bio);
    const rawText = parsedBio.rawTextPreview;
    
    const tempPath = path.join(__dirname, 'temp_raw.txt');
    fs.writeFileSync(tempPath, rawText);
    
    const { parseResume } = require('./server_mock_parse.js');
    const result = await parseResume(tempPath, 'temp_raw.txt');
    
    console.log("\n--- PARSED RESULT WITH LINE SPLITTING ---");
    console.log("Skills:", result.skills);
    console.log("Experience:", result.experience);
    console.log("Education:", result.education);
    console.log("Interests:", result.interests);
}

const mockParseCode = `
const fs = require('fs');
const path = require('path');

const parseResume = async (filePath, originalName) => {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text
        .split('\\n')
        .map(line => line.trim())
        .filter(Boolean);

    const sectionMap = {
        summary: ['summary', 'professional summary', 'profile', 'career objective', 'objective', 'about me', 'personal profile', 'executive summary'],
        skills: ['skills', 'technical skills', 'key skills', 'core competencies', 'technologies', 'tools', 'it skills', 'skills tools', 'skills expertise', 'expertise', 'specializations', 'proficiencies', 'programming languages'],
        experience: ['experience', 'work experience', 'professional experience', 'employment history', 'work history', 'internship', 'internships', 'employment', 'career history', 'experience history', 'organisational experience', 'organizational experience', 'professional background', 'work background'],
        education: ['education', 'academic background', 'academics', 'qualification', 'qualifications', 'academic profile', 'academic details', 'educational background', 'educational details'],
        projects: ['projects', 'academic projects', 'personal projects', 'portfolio', 'key projects', 'featured projects', 'project details'],
        certifications: ['certifications', 'certificates', 'licenses', 'training', 'courses', 'coursework'],
        achievements: ['achievements', 'awards', 'honors', 'accomplishments', 'recognition'],
        languages: ['languages', 'language proficiency', 'languages spoken'],
        extracurricular: ['extracurricular', 'extra curricular', 'extra-curricular', 'extracurricular activities', 'extra curricular activities', 'extra-curricular activities', 'co-curricular activities', 'co curricular activities', 'cocurricular activities', 'activities', 'leadership', 'volunteering', 'volunteer experience', 'community service'],
        interests: ['interests', 'hobbies', 'activities', 'personal interests', 'strengths', 'key strengths']
    };

    const headingLookup = Object.entries(sectionMap).flatMap(([section, headings]) =>
        headings.map(heading => ({ section, heading }))
    );

    const makeSpacedRegex = (headingWord) => {
        const pattern = headingWord
            .split('')
            .map(char => char.replace(/[-[\\\\\\]{}()*+?.,\\\\^$|#]/g, '\\\\$&'))
            .join('\\\\s*');
        return new RegExp(\`\\\\b\${pattern}\\\\b\`, 'i');
    };

    const sections = {};
    let currentSection = 'header';
    sections[currentSection] = [];

    for (const line of lines) {
        let matchedHeading = null;
        let matchedIndex = -1;
        let matchedText = '';
        
        for (const { section, heading } of headingLookup) {
            const regex = makeSpacedRegex(heading);
            const match = line.match(regex);
            // Ensure we don't match short words (like 'it') inside longer words unless it's a word boundary
            if (match) {
                matchedHeading = { section, heading };
                matchedIndex = match.index;
                matchedText = match[0];
                break;
            }
        }
        
        if (matchedHeading) {
            const beforeText = line.substring(0, matchedIndex).trim();
            const afterText = line.substring(matchedIndex + matchedText.length).trim();
            
            if (beforeText) {
                sections[currentSection].push(beforeText);
            }
            
            currentSection = matchedHeading.section;
            if (!sections[currentSection]) sections[currentSection] = [];
            
            if (afterText) {
                sections[currentSection].push(afterText);
            }
        } else {
            sections[currentSection].push(line);
        }
    }

    const sectionText = (section, fallback = 'Not found') => {
        const val = sections[section];
        if (!val || val.length === 0) return fallback;
        return val.join('\\n');
    };

    return {
        skills: sectionText('skills'),
        experience: sectionText('experience'),
        education: sectionText('education'),
        interests: sectionText('interests')
    };
};

module.exports = { parseResume };
`;

fs.writeFileSync(path.join(__dirname, 'server_mock_parse.js'), mockParseCode);
run();
