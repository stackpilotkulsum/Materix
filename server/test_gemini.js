const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVodGR3YXRjdGZpcXpyemNwem1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzUxOTMsImV4cCI6MjA5NTAxMTE5M30.Z-I3avq19VwWpxgqnmVYaEojoJ8dSnFFAgqZs6OH-YE';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uhtdwatctfiqzrzcpzmf.supabase.co';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const parseWithGemini = async (dataBuffer) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not defined in server/.env");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = 
        "Extract structured information from the provided PDF resume. " +
        "Make sure to extract and classify all sections accurately. " +
        "Separate multiple items in fields like 'skills', 'experience', 'education', 'projects', 'certifications', 'achievements', 'languages', 'extracurricular', and 'interests' using newlines. " +
        "If a section is not found, use 'No [section] section found.' or 'Not found' where appropriate.";

    console.log("Calling Gemini API with PDF buffer...");
    const response = await model.generateContent({
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            data: dataBuffer.toString('base64'),
                            mimeType: 'application/pdf'
                        }
                    },
                    { text: prompt }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Candidate's full name" },
                    email: { type: "string", description: "Primary email address" },
                    phone: { type: "string", description: "Primary phone number" },
                    linkedin: { type: "string", description: "LinkedIn profile URL (or 'Not found')" },
                    github: { type: "string", description: "GitHub profile URL (or 'Not found')" },
                    portfolioLink: { type: "string", description: "Personal portfolio or website URL (or 'Not found')" },
                    summary: { type: "string", description: "Professional summary or bio" },
                    skills: { type: "string", description: "Newline-separated list of skills" },
                    experience: { type: "string", description: "Newline-separated list of work experiences" },
                    education: { type: "string", description: "Newline-separated list of educational qualifications" },
                    projects: { type: "string", description: "Newline-separated list of projects" },
                    certifications: { type: "string", description: "Newline-separated list of certifications" },
                    achievements: { type: "string", description: "Newline-separated list of achievements" },
                    languages: { type: "string", description: "Newline-separated list of languages spoken" },
                    extracurricular: { type: "string", description: "Newline-separated list of extracurricular activities" },
                    interests: { type: "string", description: "Newline-separated list of interests/hobbies" }
                },
                required: [
                    "name", "email", "phone", "linkedin", "github", "portfolioLink",
                    "summary", "skills", "experience", "education", "projects",
                    "certifications", "achievements", "languages", "extracurricular", "interests"
                ]
            }
        }
    });

    const textResult = response.response.text();
    return JSON.parse(textResult);
};

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

        if (!process.env.GEMINI_API_KEY) {
            console.log("\n[INFO] GEMINI_API_KEY is not defined in server/.env.");
            console.log("Please populate GEMINI_API_KEY in server/.env to run the Gemini parsing test.");
            return;
        }

        const parsed = await parseWithGemini(dataBuffer);
        console.log("\n--- GEMINI PARSING SUCCESS ---");
        console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
        console.error("Gemini test execution failed:", e.message);
    }
}

run();
