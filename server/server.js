const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const AdmZip = require('adm-zip');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Tesseract = require('tesseract.js');
const { OAuth2Client } = require('google-auth-library');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = '24h';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVodGR3YXRjdGZpcXpyemNwem1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzUxOTMsImV4cCI6MjA5NTAxMTE5M30.Z-I3avq19VwWpxgqnmVYaEojoJ8dSnFFAgqZs6OH-YE';

const getSupabaseRefFromKey = (key) => {
    try {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
        return payload.ref || null;
    } catch (error) {
        console.error('Unable to read Supabase anon key project ref:', error.message);
        return null;
    }
};

const normalizeSupabaseUrl = (url, key) => {
    const keyRef = getSupabaseRefFromKey(key);
    const configuredUrl = (url || '').replace(/\/+$/, '');

    if (!keyRef) {
        return configuredUrl || 'https://uhtdwatctfiqzrzcpzmf.supabase.co';
    }

    const keyUrl = `https://${keyRef}.supabase.co`;
    if (!configuredUrl || !configuredUrl.includes(keyRef)) {
        console.warn(`Supabase URL/key mismatch. Using anon key project URL: ${keyUrl}`);
        return keyUrl;
    }

    return configuredUrl;
};

const SUPABASE_URL = normalizeSupabaseUrl(
    process.env.SUPABASE_URL || 'https://uhtdwatctfiqzrzcpzmf.supabase.co',
    SUPABASE_ANON_KEY
);

// Initialize Google OAuth Client - get CLIENT_ID from environment
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '355356179432-ceotra0qt2ns8sur8lp1a6or9lgheslm.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Public client (anon key) - for regular reads/writes
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client (service role key) - for auto-creating tables on startup
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const supabaseAdmin = SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : supabase; // fallback to anon if service key not set

// Auto-verify database tables and storage buckets exist on startup
async function setupDatabase() {
    try {
        console.log('Verifying database tables...');

        // Verify profiles table
        const { error: profilesErr } = await supabaseAdmin.from('profiles').select('username').limit(1);
        if (profilesErr) {
            console.error('profiles table issue:', profilesErr.message, '— Please create it in Supabase SQL Editor');
        } else {
            console.log('profiles table OK');
        }

        // Verify materials table
        const { error: materialsErr } = await supabaseAdmin.from('materials').select('id').limit(1);
        if (materialsErr) {
            console.error('materials table issue:', materialsErr.message, '— Please create it in Supabase SQL Editor');
        } else {
            console.log('materials table OK');
        }

        // Verify/Create materials storage bucket
        console.log('Verifying storage buckets...');
        const { data: buckets, error: bucketsErr } = await supabaseAdmin.storage.listBuckets();
        if (bucketsErr) {
            console.error('Storage bucket verification error:', bucketsErr.message);
        } else {
            const hasMaterials = buckets.some(b => b.name === 'materials');
            if (!hasMaterials) {
                console.log('Creating "materials" storage bucket...');
                const { error: createErr } = await supabaseAdmin.storage.createBucket('materials', { public: true });
                if (createErr) {
                    console.error('Failed to auto-create "materials" storage bucket:', createErr.message);
                } else {
                    console.log('"materials" storage bucket auto-created successfully!');
                }
            } else {
                console.log('"materials" storage bucket OK');
            }
        }

        console.log('Database and storage verification complete!');
    } catch (err) {
        console.error('Database setup error:', err.message);
    }
}

// Global request logger
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Simple In-Memory Rate Limiter (Max 20 requests per minute)
const rateLimitMap = new Map();
app.use('/api/upload', (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 60 * 1000;

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
    }

    const record = rateLimitMap.get(ip);
    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + windowMs;
        return next();
    }

    record.count += 1;
    if (record.count > 20) {
        return res.status(429).json({ message: 'Too many upload requests. Please try again later.' });
    }
    next();
});

// Middleware
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:5173',
        'https://materix.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// User management helpers
const loadUsers = () => {
    const usersPath = path.join(__dirname, 'users.json');
    if (fs.existsSync(usersPath)) {
        try {
            return JSON.parse(fs.readFileSync(usersPath));
        } catch (e) {
            return {};
        }
    }
    return {};
};

const saveUsers = (users) => {
    const usersPath = path.join(__dirname, 'users.json');
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
};

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userDir = path.join(uploadDir, req.user.username);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const uuid = crypto.randomUUID();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuid}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

// Helper to load metadata for a user
const loadMetadata = (username) => {
    const userDir = path.join(uploadDir, username);
    const metadataPath = path.join(userDir, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
        try {
            return JSON.parse(fs.readFileSync(metadataPath));
        } catch (e) {
            return {};
        }
    }
    return {};
};

// Helper to save metadata for a user
const saveMetadata = (username, metadata) => {
    const userDir = path.join(uploadDir, username);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    const metadataPath = path.join(userDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
};

const sanitizeUsername = (value, fallback = 'user') => {
    const cleaned = String(value || '')
        .split('@')[0]
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 40);

    return cleaned || fallback;
};

const usernameFromSupabaseUser = (user) => {
    const base = sanitizeUsername(user.email || user.id);
    const suffix = String(user.id || crypto.randomUUID()).replace(/-/g, '').slice(0, 8);
    return `${base}_${suffix}`;
};

const findProfileByEmail = async (email) => {
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    if (error) {
        console.error('Profile lookup by email failed:', error.message);
        return null;
    }

    return data;
};

const createProfileForAuthUser = async ({ username, email, name, authMethod }) => {
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert([{
            username,
            email,
            name,
            auth_method: authMethod
        }])
        .select('*')
        .maybeSingle();

    if (!error) return data;

    console.error('Profile creation failed:', error.message);

    if (error.code === '23505') {
        return findProfileByEmail(email);
    }

    return null;
};

// Helper to parse material text
const parseResume = async (filePath, originalName) => {
    const ext = path.extname(originalName).toLowerCase();

    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'];
    const urlPattern = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:linkedin\.com|github\.com|portfolio\.)[^\s<>"']*|(?:[a-zA-Z0-9-]+\.)+(?:com|io|app|dev|net|org|co|in|me|ai|xyz|site|tech|cloud|jobs|work|page|pages\.dev|vercel\.app|netlify\.app)(?:\/[^\s<>"']*)?/gi;

    const normalizeText = (value) => value
        .replace(/\r/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const stripXml = (value) => value
        .replace(/<w:tab\/>/g, ' ')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");

    const readDocxText = (targetPath) => {
        const zip = new AdmZip(targetPath);
        const documentEntry = zip.getEntry('word/document.xml');
        if (!documentEntry) return '';
        return stripXml(documentEntry.getData().toString('utf8'));
    };

    const readDocxLinks = (targetPath) => {
        try {
            const zip = new AdmZip(targetPath);
            const relsEntry = zip.getEntry('word/_rels/document.xml.rels');
            if (!relsEntry) return [];
            const relsXml = relsEntry.getData().toString('utf8');
            return [...relsXml.matchAll(/<Relationship\b[^>]*Type="[^"]*\/hyperlink"[^>]*Target="([^"]+)"/gi)]
                .map(match => match[1].replace(/&amp;/g, '&'))
                .filter(Boolean);
        } catch (error) {
            console.warn(`[DOCX] Could not read hyperlink relationships for ${originalName}:`, error.message);
            return [];
        }
    };

    const readPdfLinks = async (dataBuffer) => {
        try {
            const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) });
            const pdf = await loadingTask.promise;
            const annotationLinks = [];

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const annotations = await page.getAnnotations();
                annotations.forEach(annotation => {
                    if (annotation?.url) annotationLinks.push(annotation.url);
                    if (annotation?.unsafeUrl) annotationLinks.push(annotation.unsafeUrl);
                });
            }

            return annotationLinks;
        } catch (error) {
            console.warn(`[PDF] Could not read hyperlink annotations for ${originalName}:`, error.message);
            return [];
        }
    };

    const compact = (value, fallback = 'Not found') => {
        if (!value) return fallback;
        const cleaned = Array.isArray(value) ? value.filter(Boolean).join('\n') : String(value);
        return cleaned.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() || fallback;
    };

    const clip = (value, limit = 1400) => {
        const cleaned = compact(value, '');
        return cleaned.length > limit ? `${cleaned.substring(0, limit).trim()}...` : cleaned;
    };

    try {
        let text = '';
        let embeddedLinks = [];

        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            embeddedLinks = await readPdfLinks(dataBuffer);
            
            try {
                console.log(`[PDF] Attempting standard text extraction using pdf-parse: ${originalName}`);
                const data = await pdfParse(dataBuffer);
                text = normalizeText(data.text || '');
                console.log(`[PDF] Text extraction complete. Characters found: ${text.length}`);
            } catch (pdfParseErr) {
                console.error('[PDF] pdf-parse error:', pdfParseErr.message);
                text = ''; // Trigger OCR fallback
            }
            
            // Fallback to OCR if extracted text is empty or too short (under 50 chars)
            if (text.length < 50) {
                try {
                    console.log(`[PDF] Extracted text too short (${text.length} chars). Attempting PDF image extraction & OCR...`);
                    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
                    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) });
                    const pdf = await loadingTask.promise;
                    const { OPS } = pdfjsLib;
                    const images = [];
                    
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const ops = await page.getOperatorList();
                        
                        for (let j = 0; j < ops.fnArray.length; j++) {
                            if (ops.fnArray[j] === OPS.paintImageXObject) {
                                const args = ops.argsArray[j];
                                const imgName = args[0];
                                const imgObj = page.objs.get(imgName);
                                if (!imgObj) continue;
                                
                                const { width, height, data: imgData } = imgObj;
                                if (!(imgData instanceof Uint8ClampedArray) || typeof width !== 'number' || typeof height !== 'number') {
                                    continue;
                                }
                                
                                const { PNG } = require('pngjs');
                                const png = new PNG({ width, height });
                                
                                if (imgData.length === width * height * 3) {
                                    const rgbaData = new Uint8ClampedArray(width * height * 4);
                                    for (let k = 0; k < imgData.length; k += 3) {
                                        const rgbaIndex = (k * 4) / 3;
                                        rgbaData[rgbaIndex] = imgData[k];
                                        rgbaData[rgbaIndex + 1] = imgData[k + 1];
                                        rgbaData[rgbaIndex + 2] = imgData[k + 2];
                                        rgbaData[rgbaIndex + 3] = 255;
                                    }
                                    png.data = Buffer.from(rgbaData);
                                } else {
                                    png.data = Buffer.from(imgData);
                                }
                                
                                images.push(PNG.sync.write(png));
                            }
                        }
                    }
                    
                    console.log(`[PDF] Extracted ${images.length} images from scanned PDF. Running OCR...`);
                    if (images.length > 0) {
                        let ocrText = '';
                        for (let idx = 0; idx < images.length; idx++) {
                            const buffer = images[idx];
                            console.log(`[OCR] Running Tesseract on PDF page-image ${idx + 1}/${images.length}...`);
                            try {
                                const { data: { text: pageText } } = await Tesseract.recognize(buffer, 'eng');
                                ocrText += (pageText || '') + '\n';
                            } catch (ocrPageErr) {
                                console.error(`[OCR] Error recognizing PDF page-image ${idx + 1}:`, ocrPageErr.message);
                            }
                        }
                        
                        const normalizedOcrText = normalizeText(ocrText);
                        if (normalizedOcrText.length > 50) {
                            text = normalizedOcrText;
                            console.log(`[PDF] OCR successful. Extracted ${text.length} characters.`);
                        }
                    }
                } catch (ocrErr) {
                    console.error('[PDF] OCR fallback error:', ocrErr.message);
                    return { 
                        email: 'Not found', 
                        phone: 'Not found', 
                        bio: 'Could not parse PDF file: ' + ocrErr.message
                    };
                }
            }
        } else if (ext === '.docx') {
            text = readDocxText(filePath);
            embeddedLinks = readDocxLinks(filePath);
        } else if (ext === '.txt') {
            text = fs.readFileSync(filePath, 'utf8');
        } else if (imageExts.includes(ext)) {
            try {
                console.log(`[OCR] Running Tesseract on image: ${originalName}`);
                const { data: { text: extractedText } } = await Tesseract.recognize(filePath, 'eng');
                text = extractedText || '';
            } catch (ocrErr) {
                console.error('Tesseract error:', ocrErr.message);
            }
        } else {
            return { email: 'Not found', phone: 'Not found', bio: 'Not supported' };
        }

        text = normalizeText(text);
        if (!text) {
            if (imageExts.includes(ext)) {
                const extName = ext.replace('.', '').toUpperCase();
                const extractedData = {
                    name: originalName.replace(/\.[^/.]+$/, ''),
                    email: 'N/A',
                    emails: [],
                    phone: 'N/A',
                    phones: [],
                    links: [],
                    linkedin: 'Not found',
                    github: 'Not found',
                    portfolioLink: 'Not found',
                    projectLinks: [],
                    bio: `${extName} image file securely stored in Materix. Full thumbnail and details are available in the archives.`,
                    skills: 'No specific skills section found.',
                    experience: 'No experience section found.',
                    education: 'No education section found.',
                    projects: 'No projects section found.',
                    certifications: 'No certifications section found.',
                    achievements: 'No achievements section found.',
                    languages: 'No languages section found.',
                    extracurricular: 'No extra curricular activities section found.',
                    interests: 'No interests section found.',
                    rawTextPreview: 'Image file uploaded.'
                };
                return {
                    ...extractedData,
                    bio: JSON.stringify(extractedData)
                };
            }
            return { email: 'Not found', phone: 'Not found', bio: 'Could not parse file: no readable text found.' };
        }

        const lines = text
            .split('\n')
            .map(line => line.replace(/^[\s\-*•●▪▫◆]+/, '').trim())
            .filter(Boolean);

        const sectionMap = {
            summary: ['summary', 'professional summary', 'profile', 'career objective', 'objective', 'about me'],
            skills: ['skills', 'technical skills', 'key skills', 'core competencies', 'technologies', 'tools'],
            experience: ['experience', 'work experience', 'professional experience', 'employment history', 'work history', 'internship', 'internships'],
            education: ['education', 'academic background', 'academics', 'qualification', 'qualifications'],
            projects: ['projects', 'academic projects', 'personal projects', 'portfolio'],
            certifications: ['certifications', 'certificates', 'licenses', 'training'],
            achievements: ['achievements', 'awards', 'honors', 'accomplishments'],
            languages: ['languages', 'language proficiency'],
            extracurricular: ['extracurricular', 'extra curricular', 'extra-curricular', 'extracurricular activities', 'extra curricular activities', 'extra-curricular activities', 'co-curricular activities', 'co curricular activities', 'cocurricular activities', 'activities', 'leadership', 'volunteering', 'volunteer experience'],
            interests: ['interests', 'hobbies', 'activities']
        };

        const headingLookup = Object.entries(sectionMap).flatMap(([section, headings]) =>
            headings.map(heading => ({ section, heading }))
        );

        const normalizeHeading = (line) => line
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ') // Strip special symbols like ◆, ●, [, ], etc.
            .replace(/\b\d+\b/g, '')      // Strip standalone list numbers like "1." or "2."
            .replace(/\s+/g, ' ')
            .trim();

        const findHeading = (line) => {
            const normalized = normalizeHeading(line);
            return headingLookup.find(({ heading }) =>
                normalized === heading || normalized.startsWith(`${heading} `)
            );
        };

        const sections = {};
        let currentSection = 'header';
        sections[currentSection] = [];

        for (const line of lines) {
            const heading = line.length <= 60 ? findHeading(line) : null;
            if (heading) {
                currentSection = heading.section;
                if (!sections[currentSection]) sections[currentSection] = [];

                const remainder = line
                    .replace(new RegExp(`^${heading.heading}\\s*[:|-]?\\s*`, 'i'), '')
                    .trim();
                if (remainder && normalizeHeading(remainder) !== heading.heading) {
                    sections[currentSection].push(remainder);
                }
                continue;
            }

            sections[currentSection].push(line);
        }

        const sectionText = (section, fallback = 'Not found') => clip(sections[section], 1600) || fallback;
        const emailMatches = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];
        
        // Improved phone number extraction: supports local, international, and ignores date ranges (2018-2022) or zip codes
        const phoneRegexes = [
            /(?:\+?\d{1,3}[-.\s()]{0,3})?\(?\d{3}\)?[-.\s()]{0,3}\d{3}[-.\s()]{0,3}\d{4}/g,
            /\b\d{10}\b/g,
            /(?:\+\d{1,3}[-.\s]?)?\d{5}[-.\s]?\d{5}/g
        ];
        let phoneMatches = [];
        for (const regex of phoneRegexes) {
            const matches = text.match(regex) || [];
            phoneMatches.push(...matches);
        }
        phoneMatches = [...new Set(phoneMatches)]
            .map(phone => phone.trim())
            .filter(phone => {
                const digits = phone.replace(/\D/g, '');
                if (digits.length < 10 || digits.length > 15) return false;
                // Exclude matches that consist of year ranges (e.g., contains two 4-digit years like 2018 and 2022)
                if (phone.includes('201') || phone.includes('202')) {
                    if (/\b(19|20)\d{2}\b.*?\b(19|20)\d{2}\b/.test(phone)) return false;
                }
                return true;
            });

        const portfolioLinks = lines
            .filter(line => /portfolio|website/i.test(line))
            .flatMap(line => line.match(urlPattern) || []);
        const labeledProjectLinks = lines
            .filter(line => /project link|project url|demo link|live link/i.test(line))
            .flatMap(line => line.match(urlPattern) || []);
        const isMailLink = (link) => /(^mailto:|gmail\.com|googlemail\.com|mail\.google\.com)/i.test(link);
        const rawLinkedinMatches = (text.match(/(?:linkedin\.com\/\S*)/gi) || []).map(l => l.replace(/[),.;]+$/, ''));
        const rawGithubMatches = (text.match(/(?:github\.com\/\S*)/gi) || []).map(l => l.replace(/[),.;]+$/, ''));
        const links = [...new Set([
            ...(text.match(urlPattern) || []),
            ...rawLinkedinMatches,
            ...rawGithubMatches,
            ...portfolioLinks,
            ...labeledProjectLinks,
            ...embeddedLinks
        ])]
            .map(link => link.replace(/^[([<{]+/, '').replace(/[)\],.;}>]+$/, ''))
            .filter(link => link && !isMailLink(link));
        const isFakeLink = (link) => /\.(js|ts|jsx|tsx|py|java|css|html|md|pdf|png|jpg|svg|zip|rb|go|rs|cpp|c)$/i.test(link);
        const isRealUrl = (link) => /^https?:\/\//i.test(link) || /^www\./i.test(link) || /\.(com|io|app|dev|net|org|co|in|me|ai|xyz|site|tech|cloud|jobs|work|page)(\/|$)/i.test(link);
        const linkedin = links.find(link => /linkedin\.com/i.test(link)) || 'Not found';
        const github = links.find(link => /github\.com/i.test(link)) || 'Not found';
        const portfolioLink = links.find(link =>
            !(/linkedin\.com|github\.com/i.test(link)) &&
            portfolioLinks.some(portfolio => portfolio.replace(/[),.;]+$/, '') === link)
        ) || 'Not found';
        const projectLinks = links.filter(link =>
            !/linkedin\.com|github\.com/i.test(link) &&
            link !== portfolioLink &&
            isRealUrl(link) &&
            !isFakeLink(link)
        );

        // Improved name candidate algorithm: filters out common title words, address markers, and formats
        const headerLines = sections.header || lines.slice(0, 8);
        const isValidName = (line) => {
            const trimmed = line.trim();
            if (trimmed.length < 2 || trimmed.length > 50) return false;
            if (/\d/.test(trimmed)) return false; // Ignore lines with digits
            
            const lower = trimmed.toLowerCase();
            const blacklist = [
                'email', 'phone', 'mobile', 'address', 'resume', 'curriculum', 'vitae',
                'engineer', 'developer', 'designer', 'analyst', 'manager', 'consultant',
                'student', 'graduate', 'profile', 'contact', 'summary', 'experience',
                'education', 'skills', 'projects', 'links', 'page', 'portfolio', 'website',
                'github', 'linkedin', 'gmail', 'yahoo', 'outlook', 'hotmail', 'cv', 'india',
                'usa', 'dallas', 'texas', 'california', 'university', 'college', 'school'
            ];
            if (blacklist.some(word => lower.includes(word))) return false;
            
            const words = trimmed.split(/\s+/);
            if (words.length < 2 || words.length > 4) return false;
            
            const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
            const isCapitalized = words.every(w => /^[A-Z][a-zA-Z]*$/.test(w));
            
            return isAllCaps || isCapitalized;
        };

        let nameCandidate = headerLines.find(isValidName);

        // Fallback to old name finder if the strict Capitalized Word filter didn't match anything
        if (!nameCandidate) {
            nameCandidate = headerLines.find(line => {
                const lower = line.toLowerCase();
                return line.length >= 2 &&
                    line.length <= 70 &&
                    !line.includes('@') &&
                    !links.some(link => line.includes(link)) &&
                    !/\d{4,}/.test(line) &&
                    !findHeading(line) &&
                    !lower.includes('resume') &&
                    !lower.includes('curriculum vitae');
            });
        }

        const summary = sectionText('summary', lines.find(line => line.length > 70 && !line.includes('@')) || 'No summary found.');
        const extractedData = {
            name: nameCandidate || 'Not found',
            email: emailMatches[0] || 'Not found',
            emails: emailMatches,
            phone: phoneMatches[0] || 'Not found',
            phones: phoneMatches,
            links,
            linkedin,
            github,
            portfolioLink,
            projectLinks,
            bio: summary,
            skills: sectionText('skills', 'No skills section found.'),
            experience: sectionText('experience', 'No experience section found.'),
            education: sectionText('education', 'No education section found.'),
            projects: sectionText('projects', 'No projects section found.'),
            certifications: sectionText('certifications', 'No certifications section found.'),
            achievements: sectionText('achievements', 'No achievements section found.'),
            languages: sectionText('languages', 'No languages section found.'),
            extracurricular: sectionText('extracurricular', 'No extra curricular activities section found.'),
            interests: sectionText('interests', 'No interests section found.'),
            rawTextPreview: clip(text, 2200)
        };

        return {
            ...extractedData,
            bio: JSON.stringify(extractedData)
        };
    } catch (e) {
        console.error("Parsing error detail:", e);
        return { email: 'Not found', phone: 'Not found', bio: 'Could not parse file: ' + e.message };
    }
};

const splitText = (text) => {
    if (!text || typeof text !== 'string' || text.match(/^No .* section found.$/i)) return [];
    return text.split(/[\n•\-\*]+/).map(s => s.trim()).filter(s => s.length > 2);
};

const parseStoredExtraction = (value) => {
    if (!value || typeof value !== 'string' || !value.trim().startsWith('{')) return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const extractLinksFromText = (value) => {
    if (!value || typeof value !== 'string') return [];
    const matches = value.match(/(?:https?:\/\/|www\.)[^\s<>"']+|(?:linkedin\.com|github\.com|portfolio\.)[^\s<>"']*|(?:[a-zA-Z0-9-]+\.)+(?:com|io|app|dev|net|org|co|in|me|ai|xyz|site|tech|cloud|jobs|work|page|pages\.dev|vercel\.app|netlify\.app)(?:\/[^\s<>"']*)?/gi) || [];
    return normalizeExtractedLinks(matches);
};

const normalizeExtractedLinks = (links) => {
    if (!Array.isArray(links)) return [];
    return [...new Set(links
        .map(link => typeof link === 'string' ? link.replace(/^[([<{]+/, '').replace(/[)\],.;}>]+$/, '').trim() : '')
        .filter(link =>
            link &&
            !/(^mailto:|gmail\.com|googlemail\.com|mail\.google\.com)/i.test(link) &&
            (/^(https?:\/\/|www\.)/i.test(link) || /(?:linkedin|github)\.com/i.test(link) || /\.(com|io|app|dev|net|org|co|in|me|ai|xyz|site|tech|cloud|jobs|work|page)(\/|$)/i.test(link))
        )
    )];
};

const getMaterialStoragePath = (fileUrl) => {
    if (!fileUrl || typeof fileUrl !== 'string') return null;
    const marker = '/materials/';
    const markerIndex = fileUrl.indexOf(marker);
    if (markerIndex >= 0) {
        return decodeURIComponent(fileUrl.slice(markerIndex + marker.length).split('?')[0]);
    }
    return null;
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: 'Invalid registration data' });
    }

    if (username.trim().length < 3) {
        return res.status(400).json({ message: 'Username must be at least 3 characters long' });
    }

    if (password.length < 4) {
        return res.status(400).json({ message: 'Password must be at least 4 characters long' });
    }

    const { data: existingUser } = await supabaseAdmin.from('profiles').select('username').eq('username', username).single();
    if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabaseAdmin.from('profiles').insert([{
            username,
            password: hashedPassword,
            auth_method: 'local'
        }]);
        
        if (error) throw error;
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    const { data: user } = await supabaseAdmin.from('profiles').select('*').eq('username', username).single();
    if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' });
    }

    try {
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token, username });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Login failed' });
    }
});

app.post('/api/auth/supabase-login', async (req, res) => {
    try {
        const { accessToken } = req.body;

        if (!accessToken) {
            return res.status(400).json({ message: 'Supabase access token is required' });
        }

        const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
        if (authError || !authData?.user) {
            console.error('Supabase token verification failed:', authError?.message || 'No user returned');
            return res.status(401).json({ message: 'Invalid Supabase session' });
        }

        const supabaseUser = authData.user;
        const email = supabaseUser.email;
        const supabaseId = supabaseUser.id;
        const name = supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || email;

        if (!email || !supabaseId) {
            return res.status(400).json({ message: 'Supabase user profile is incomplete' });
        }

        let profile = await findProfileByEmail(email);
        let username = profile?.username;

        if (!username) {
            username = usernameFromSupabaseUser(supabaseUser);
            profile = await createProfileForAuthUser({
                username,
                email,
                name,
                authMethod: 'supabase'
            });
            username = profile?.username || username;
        }

        const token = jwt.sign(
            { username, email, supabaseId, auth_method: 'supabase' },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        res.json({ token, username });
    } catch (error) {
        console.error('Supabase login error:', error);
        res.status(500).json({ message: 'Supabase authentication failed. Check backend logs for details.' });
    }
});

// Google OAuth Login Route
app.post('/api/auth/google-login', async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({ message: 'Google credential is required' });
        }

        // Verify the token with Google
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload['sub'];
        const email = payload['email'];
        const name = payload['name'];

        const { data: existingUser } = await supabaseAdmin.from('profiles').select('*').eq('email', email).maybeSingle();
        let username;

        if (existingUser) {
            username = existingUser.username;
        } else {
            username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
            await supabaseAdmin.from('profiles').insert([{
                username,
                email,
                name,
                auth_method: 'google'
            }]);
        }

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token, username });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(401).json({ message: 'Google authentication failed' });
    }
});

// Google OAuth Register Route
app.post('/api/auth/google-register', async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({ message: 'Google credential is required' });
        }

        // Verify the token with Google
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload['sub'];
        const email = payload['email'];
        const name = payload['name'];

        const { data: existingUser } = await supabaseAdmin.from('profiles').select('*').eq('email', email).maybeSingle();
        let username;

        if (existingUser) {
            return res.status(400).json({ message: 'This Google account is already registered' });
        } else {
            username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
            await supabaseAdmin.from('profiles').insert([{
                username,
                email,
                name,
                auth_method: 'google'
            }]);
        }

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.status(201).json({ token, username, message: 'Registration successful' });
    } catch (error) {
        console.error('Google register error:', error);
        res.status(400).json({ message: 'Google registration failed' });
    }
});

// API Route for uploading materials
app.post('/api/upload', authenticateToken, (req, res) => {
    upload.array('materials')(req, res, async (err) => {
        try {
            if (err) {
                console.error('Multer/Upload Error:', err.message);
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ message: 'File too large. Max limit is 10MB.' });
                }
                return res.status(400).json({ message: err.message });
            }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files received.' });
        }

        // Check for empty files
        const emptyFiles = req.files.filter(f => f.size === 0);
        if (emptyFiles.length > 0) {
            req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
            return res.status(400).json({ message: 'Upload blocked. One or more files are empty (0 bytes).' });
        }

        // File Type and Deep Binary Inspection (Block non-PDF/DOCX/ZIP/Images and MZ/ELF executables)
        let hasMalware = false;
        let invalidType = null;
        const allowedExtensions = ['.pdf', '.docx', '.txt', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'];

        req.files.forEach(f => {
            if (!fs.existsSync(f.path)) return;
            
            const ext = path.extname(f.originalname).toLowerCase();
            if (!allowedExtensions.includes(ext)) {
                invalidType = f.originalname;
            }

            try {
                const fd = fs.openSync(f.path, 'r');
                const buffer = Buffer.alloc(4);
                fs.readSync(fd, buffer, 0, 4, 0);
                fs.closeSync(fd);
                if ((buffer[0] === 0x4D && buffer[1] === 0x5A) ||
                    (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46)) {
                    hasMalware = true;
                }
            } catch (e) {
                console.error("Error reading file header:", e);
            }
        });

        if (invalidType) {
            req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
            return res.status(400).json({ message: `Access Blocked: "${invalidType}" is an unsupported format. Supported formats: PDF, DOCX, TXT, ZIP, and Images (PNG, JPG, WEBP, GIF, SVG, BMP).` });
        }

        if (hasMalware) {
            req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
            return res.status(403).json({ message: 'Security Block: Executable files are strictly prohibited.' });
        }

        // Process ZIP files
        let processedFiles = [];
        for (let f of req.files) {
            const ext = path.extname(f.originalname).toLowerCase();
            if (ext === '.zip') {
                try {
                    const zip = new AdmZip(f.path);
                    const zipEntries = zip.getEntries();
                    const zipFolderName = path.basename(f.originalname, '.zip');

                    zipEntries.forEach(zipEntry => {
                        if (!zipEntry.isDirectory) {
                            const entryExt = path.extname(zipEntry.entryName).toLowerCase();
                            const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'];
                            if (['.pdf', '.docx', '.txt', ...imageExts].includes(entryExt)) {
                                const uuid = crypto.randomUUID();
                                const newFilename = `${uuid}${entryExt}`;
                                const newPath = path.join(uploadDir, newFilename);
                                
                                // Extract file directly to uploadDir with new UUID name
                                const content = zipEntry.getData();
                                fs.writeFileSync(newPath, content);
                                
                                const imageMimetypes = {
                                    '.png': 'image/png',
                                    '.gif': 'image/gif',
                                    '.svg': 'image/svg+xml',
                                    '.bmp': 'image/bmp',
                                    '.jpg': 'image/jpeg',
                                    '.jpeg': 'image/jpeg',
                                    '.webp': 'image/webp'
                                };
                                
                                processedFiles.push({
                                    originalname: zipEntry.name,
                                    filename: newFilename,
                                    path: newPath,
                                    mimetype: entryExt === '.pdf'
                                        ? 'application/pdf'
                                        : entryExt === '.docx'
                                            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                            : entryExt === '.txt'
                                                ? 'text/plain'
                                                : (imageMimetypes[entryExt] || 'application/octet-stream'),
                                    size: zipEntry.header.size,
                                    folder_name: zipFolderName
                                });
                            }
                        }
                    });
                } catch (e) {
                    console.error('Error extracting ZIP:', e);
                } finally {
                    // Delete the original ZIP file
                    if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
                }
            } else {
                processedFiles.push({
                    ...f,
                    folder_name: null // Standard single file uploads
                });
            }
        }

        // Parse paths from request body
        let pathsArr = [];
        if (req.body.paths) {
            pathsArr = Array.isArray(req.body.paths) ? req.body.paths : [req.body.paths];
        }

        // Get user email
        const { data: userProfile } = await supabaseAdmin.from('profiles').select('email').eq('username', req.user.username).maybeSingle();
        const email = userProfile?.email || req.user.email || '';

        // Process each file and build metadata
        let uploadedFilesResp = [];
        let failedFiles = [];
        let errors = {}; // Track detailed errors
        
        for (const [index, f] of processedFiles.entries()) {
            const safeOriginalName = path.basename(f.originalname);
            const relPath = pathsArr[index] || '';
            let folderName = f.folder_name;
            if (!folderName && relPath && relPath.includes('/')) {
                folderName = relPath.split('/')[0];
                f.folder_name = folderName;
            }

            try {
                console.log(`[UPLOAD] Processing file: ${safeOriginalName}`);
                const extractedData = await parseResume(f.path, safeOriginalName);
                
                // Ensure bio doesn't exceed database limits (truncate to 8000 chars)
                let bioData = extractedData.bio || '';
                if (bioData.length > 8000) {
                    console.log(`[UPLOAD] Truncating bio from ${bioData.length} to 8000 chars for ${safeOriginalName}`);
                    bioData = bioData.substring(0, 8000);
                }
                console.log(`[UPLOAD] Extracted data - Name: ${extractedData.name}, Bio size: ${bioData.length} chars`);

                // Upload to Supabase Storage
                const fileBuffer = fs.readFileSync(f.path);
                const bucketPath = `${req.user.username}/${f.filename}`;
                
                console.log(`[UPLOAD] Uploading to storage: ${bucketPath}`);
                const { error: uploadError } = await supabaseAdmin.storage.from('materials').upload(bucketPath, fileBuffer, {
                    contentType: f.mimetype || 'application/octet-stream'
                });
                
                if (uploadError) {
                    console.error(`[UPLOAD] Storage error for ${safeOriginalName}:`, uploadError);
                    failedFiles.push(safeOriginalName);
                    errors[safeOriginalName] = `Storage upload failed: ${uploadError.message}`;
                    continue;
                }

                const { data: publicUrlData } = supabaseAdmin.storage.from('materials').getPublicUrl(bucketPath);
                const publicUrl = publicUrlData.publicUrl;

                console.log(`[UPLOAD] Inserting into DB: ${safeOriginalName}`);
                
                let summaryText = 'No summary found.';
                try {
                    const parsed = JSON.parse(bioData);
                    summaryText = parsed.bio || 'No summary found.';
                } catch (jsonErr) {
                    console.log(`[UPLOAD] Not a JSON bio or failed to parse for summary:`, jsonErr.message);
                }

                 // Insert into Supabase DB
                 const { data: insertData, error: insertError } = await supabaseAdmin.from('materials').insert([{
                     username: req.user.username,
                     email: email,
                     original_name: safeOriginalName,
                     file_url: publicUrl,
                     file_size: f.size,
                     folder: folderName,
                     file_count: processedFiles.length,
                     extracted_bio: bioData,
                     candidate_name: extractedData.name || 'Not found',
                     candidate_email: extractedData.email || 'Not found',
                     candidate_phone: extractedData.phone || 'Not found',
                     linkedin: extractedData.linkedin || 'Not found',
                     github: extractedData.github || 'Not found',
                     portfolio_link: extractedData.portfolioLink || 'Not found',
                     summary: summaryText,
                     skills: extractedData.skills || 'No skills section found.',
                     experience: extractedData.experience || 'No experience section found.',
                     education: extractedData.education || 'No education section found.',
                     projects: extractedData.projects || 'No projects section found.',
                     certifications: extractedData.certifications || 'No certifications section found.',
                     achievements: extractedData.achievements || 'No achievements section found.',
                     languages: extractedData.languages || 'No languages section found.',
                     extracurricular: extractedData.extracurricular || 'No extra curricular activities section found.',
                     interests: extractedData.interests || 'No interests section found.',
                     raw_text_preview: extractedData.rawTextPreview || ''
                 }]).select('id').single();
 
                 if (insertError) {
                     console.error(`[UPLOAD] DB Insert Error for ${safeOriginalName}:`, insertError);
                     failedFiles.push(safeOriginalName);
                     errors[safeOriginalName] = `Database error: ${insertError.message}`;
                 } else {
                     // Insert into candidate_profiles table
                     if (insertData) {
                         const { data: profileData, error: profileError } = await supabaseAdmin.from('candidate_profiles').insert([{
                             material_id: insertData.id,
                             candidate_name: extractedData.name || 'Not found',
                             candidate_email: extractedData.email || 'Not found',
                             candidate_phone: extractedData.phone || 'Not found',
                             linkedin: extractedData.linkedin || 'Not found',
                             github: extractedData.github || 'Not found',
                             portfolio_link: extractedData.portfolioLink || 'Not found',
                             summary: summaryText,
                             certifications: extractedData.certifications || 'No certifications section found.',
                             achievements: extractedData.achievements || 'No achievements section found.',
                             languages: extractedData.languages || 'No languages section found.',
                             extracurricular: extractedData.extracurricular || 'No extra curricular activities section found.',
                             interests: extractedData.interests || 'No interests section found.',
                             raw_text_preview: extractedData.rawTextPreview || ''
                         }]).select('id').single();
                         
                         if (profileError) {
                             console.error(`[UPLOAD] candidate_profiles Insert Error for ${safeOriginalName}:`, profileError);
                         } else if (profileData) {
                             const skills = splitText(extractedData.skills);
                             if (skills.length) await supabaseAdmin.from('candidate_skills').insert(skills.map(s => ({ profile_id: profileData.id, skill_name: s })));
                             
                             const experience = splitText(extractedData.experience);
                             if (experience.length) await supabaseAdmin.from('candidate_experience').insert(experience.map(s => ({ profile_id: profileData.id, description: s })));
                             
                             const education = splitText(extractedData.education);
                             if (education.length) await supabaseAdmin.from('candidate_education').insert(education.map(s => ({ profile_id: profileData.id, description: s })));
                             
                             const projects = splitText(extractedData.projects);
                             if (projects.length) await supabaseAdmin.from('candidate_projects').insert(projects.map(s => ({ profile_id: profileData.id, description: s })));
                         }
                     }
                    console.log(`[UPLOAD] Success: ${safeOriginalName}`);
                    uploadedFilesResp.push({
                        name: safeOriginalName,
                        size: f.size,
                        path: publicUrl
                    });
                }
            } catch (error) {
                console.error(`[UPLOAD] Error processing ${safeOriginalName}:`, error.message);
                failedFiles.push(safeOriginalName);
                errors[safeOriginalName] = error.message;
            } finally {
                // Delete local file to save space
                if (fs.existsSync(f.path)) {
                    try {
                        fs.unlinkSync(f.path);
                    } catch (e) {
                        console.error(`[UPLOAD] Failed to delete local file ${f.path}:`, e.message);
                    }
                }
            }
        }

        const successCount = uploadedFilesResp.length;
        const failedCount = failedFiles.length;
        
        console.log(`[UPLOAD] Upload complete: ${successCount} succeeded, ${failedCount} failed`);
        if (failedCount > 0) {
            console.log(`[UPLOAD] Failed files and errors:`, errors);
        }
        
        if (successCount === 0 && failedCount > 0) {
            const errorDetails = Object.entries(errors).map(([file, err]) => `${file}: ${err}`).join(' | ');
            return res.status(400).json({
                message: `Failed to upload ${failedFiles.length} file(s)`,
                details: errorDetails,
                files: []
            });
        }
        
        let message = `${successCount} file(s) uploaded successfully!`;
        if (failedCount > 0) {
            message += ` (${failedCount} failed)`;
        }
        
        return res.status(200).json({
            message,
            files: uploadedFilesResp
        });
        } catch (error) {
            console.error('[UPLOAD] Unhandled endpoint error:', error);
            return res.status(400).json({
                message: 'Upload failed',
                details: error.message
            });
        }
    });
});

// API Route to list uploaded files from metadata
app.get("/", (req, res) => {
  res.send("Materix Backend Running");
});
app.get('/api/files', authenticateToken, async (req, res) => {
    console.log(`[FILES API] Request received. User from token:`, req.user);
    try {
        const { data: files, error } = await supabaseAdmin
            .from('materials')
            .select('*, candidate_profiles(*, candidate_skills(*), candidate_experience(*), candidate_education(*), candidate_projects(*))')
            .eq('username', req.user.username)
            .order('created_at', { ascending: false });
            
        console.log(`[FILES API] Query for username "${req.user?.username}" completed. Found ${files?.length || 0} files. Error:`, error);
        
        if (error) throw error;

        const fileList = files.map(f => {
            const profile = (Array.isArray(f.candidate_profiles) ? f.candidate_profiles[0] : f.candidate_profiles) || {};
            const storedExtraction = parseStoredExtraction(f.extracted_bio);
            const storedLinks = normalizeExtractedLinks(storedExtraction.links);
            const storedProjectLinks = normalizeExtractedLinks(storedExtraction.projectLinks);
            let bioJsonString = null;
            
            if (profile.material_id) {
                // Source 1: Normalized candidate_profiles tables
                const skillsStr = (profile.candidate_skills || []).map(s => s.skill_name).join('\n');
                const expStr = (profile.candidate_experience || []).map(e => e.description).join('\n\n');
                const eduStr = (profile.candidate_education || []).map(e => e.description).join('\n\n');
                const projStr = (profile.candidate_projects || []).map(p => p.description).join('\n\n');
                
                const fallbackLinks = storedLinks.length ? storedLinks : extractLinksFromText([
                    profile.linkedin,
                    profile.github,
                    profile.portfolio_link,
                    profile.summary,
                    skillsStr,
                    expStr,
                    eduStr,
                    projStr,
                    profile.raw_text_preview
                ].filter(Boolean).join('\n'));
                const fallbackProjectLinks = storedProjectLinks.length
                    ? storedProjectLinks
                    : fallbackLinks.filter(link => !/linkedin\.com|github\.com/i.test(link) && link !== profile.portfolio_link);

                const constructedBio = {
                    name: profile.candidate_name,
                    email: profile.candidate_email,
                    phone: profile.candidate_phone,
                    linkedin: profile.linkedin,
                    github: profile.github,
                    portfolioLink: profile.portfolio_link,
                    links: fallbackLinks,
                    projectLinks: fallbackProjectLinks,
                    bio: profile.summary,
                    skills: skillsStr || 'No skills section found.',
                    experience: expStr || 'No experience section found.',
                    education: eduStr || 'No education section found.',
                    projects: projStr || 'No projects section found.',
                    certifications: profile.certifications,
                    achievements: profile.achievements,
                    languages: profile.languages,
                    extracurricular: profile.extracurricular,
                    interests: profile.interests,
                    rawTextPreview: profile.raw_text_preview
                };
                bioJsonString = JSON.stringify(constructedBio);
            } else if (f.candidate_name && f.candidate_name !== 'Not found') {
                // Source 2: Flat columns on materials table
                const fallbackLinks = storedLinks.length ? storedLinks : extractLinksFromText([
                    f.linkedin,
                    f.github,
                    f.portfolio_link,
                    f.summary,
                    f.skills,
                    f.experience,
                    f.education,
                    f.projects,
                    f.raw_text_preview
                ].filter(Boolean).join('\n'));
                const fallbackProjectLinks = storedProjectLinks.length
                    ? storedProjectLinks
                    : fallbackLinks.filter(link => !/linkedin\.com|github\.com/i.test(link) && link !== f.portfolio_link);

                const constructedBio = {
                    name: f.candidate_name || 'Not found',
                    email: f.candidate_email || 'Not found',
                    phone: f.candidate_phone || 'Not found',
                    linkedin: f.linkedin || 'Not found',
                    github: f.github || 'Not found',
                    portfolioLink: f.portfolio_link || 'Not found',
                    links: fallbackLinks,
                    projectLinks: fallbackProjectLinks,
                    bio: f.summary || 'No summary found.',
                    skills: f.skills || 'No skills section found.',
                    experience: f.experience || 'No experience section found.',
                    education: f.education || 'No education section found.',
                    projects: f.projects || 'No projects section found.',
                    certifications: f.certifications || 'No certifications section found.',
                    achievements: f.achievements || 'No achievements section found.',
                    languages: f.languages || 'No languages section found.',
                    extracurricular: f.extracurricular || 'No extra curricular activities section found.',
                    interests: f.interests || 'No interests section found.',
                    rawTextPreview: f.raw_text_preview || ''
                };
                bioJsonString = JSON.stringify(constructedBio);
            } else {
                // Source 3: Raw extracted_bio JSON string
                bioJsonString = f.extracted_bio;
            }

            return {
                id: f.id,
                name: f.original_name,
                size: f.file_size,
                url: f.file_url,
                uploadedAt: f.created_at,
                extracted: { bio: bioJsonString },
                folder: f.folder
            };
        });
        
        res.status(200).json(fileList);
    } catch (err) {
        console.error('Metadata Fetch Error:', err.message);
        res.status(500).json({ message: 'Unable to fetch files from database' });
    }
});

app.post('/api/files/reprocess', authenticateToken, async (req, res) => {
    try {
        const { data: files, error } = await supabaseAdmin
            .from('materials')
            .select('id, original_name, file_url')
            .eq('username', req.user.username);

        if (error) throw error;
        if (!files || files.length === 0) {
            return res.status(200).json({ message: 'No stored resumes found to refresh.', updated: 0 });
        }

        let updated = 0;
        let failed = 0;
        const failures = [];

        for (const file of files) {
            const ext = path.extname(file.original_name || '').toLowerCase();
            const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'];
            if (!['.pdf', '.docx', '.txt', ...imageExts].includes(ext) || !file.file_url) {
                failed += 1;
                failures.push({ file: file.original_name, reason: !file.file_url ? 'Missing stored file URL' : `Unsupported file type: ${ext || 'unknown'}` });
                continue;
            }

            const tempPath = path.join(uploadDir, `${crypto.randomUUID()}${ext}`);

            try {
                let fileBuffer = null;
                try {
                    const response = await fetch(file.file_url);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        fileBuffer = Buffer.from(arrayBuffer);
                    } else {
                        console.warn(`[REPROCESS] Public download failed for ${file.original_name}: ${response.status}`);
                    }
                } catch (downloadError) {
                    console.warn(`[REPROCESS] Public download error for ${file.original_name}: ${downloadError.message}`);
                }

                if (!fileBuffer) {
                    const bucketPath = getMaterialStoragePath(file.file_url);
                    if (!bucketPath) throw new Error('Could not determine Supabase storage path');

                    const { data: storageData, error: storageError } = await supabaseAdmin.storage.from('materials').download(bucketPath);
                    if (storageError) throw storageError;

                    const arrayBuffer = await storageData.arrayBuffer();
                    fileBuffer = Buffer.from(arrayBuffer);
                }

                fs.writeFileSync(tempPath, fileBuffer);

                 const extractedData = await parseResume(tempPath, file.original_name);
                 const bioData = extractedData.bio || '';
                 let summaryText = 'No summary found.';
                 try {
                     const parsed = JSON.parse(bioData);
                     summaryText = parsed.bio || 'No summary found.';
                 } catch (jsonErr) {
                     console.log(`[REPROCESS] Not a JSON bio or failed to parse for summary:`, jsonErr.message);
                 }

                 // Update materials table with extracted data
                 const { error: materialUpdateError } = await supabaseAdmin.from('materials').update({
                     extracted_bio: bioData,
                     candidate_name: extractedData.name || 'Not found',
                     candidate_email: extractedData.email || 'Not found',
                     candidate_phone: extractedData.phone || 'Not found',
                     linkedin: extractedData.linkedin || 'Not found',
                     github: extractedData.github || 'Not found',
                     portfolio_link: extractedData.portfolioLink || 'Not found',
                     summary: summaryText,
                     skills: extractedData.skills || 'No skills section found.',
                     experience: extractedData.experience || 'No experience section found.',
                     education: extractedData.education || 'No education section found.',
                     projects: extractedData.projects || 'No projects section found.',
                     certifications: extractedData.certifications || 'No certifications section found.',
                     achievements: extractedData.achievements || 'No achievements section found.',
                     languages: extractedData.languages || 'No languages section found.',
                     extracurricular: extractedData.extracurricular || 'No extra curricular activities section found.',
                     interests: extractedData.interests || 'No interests section found.',
                     raw_text_preview: extractedData.rawTextPreview || ''
                 }).eq('id', file.id);
                 if (materialUpdateError) throw materialUpdateError;

                 const { data: profileData, error: updateError } = await supabaseAdmin
                     .from('candidate_profiles')
                     .upsert({ 
                         material_id: file.id,
                         candidate_name: extractedData.name || 'Not found',
                         candidate_email: extractedData.email || 'Not found',
                         candidate_phone: extractedData.phone || 'Not found',
                         linkedin: extractedData.linkedin || 'Not found',
                         github: extractedData.github || 'Not found',
                         portfolio_link: extractedData.portfolioLink || 'Not found',
                         summary: summaryText,
                         certifications: extractedData.certifications || 'No certifications section found.',
                         achievements: extractedData.achievements || 'No achievements section found.',
                         languages: extractedData.languages || 'No languages section found.',
                         extracurricular: extractedData.extracurricular || 'No extra curricular activities section found.',
                         interests: extractedData.interests || 'No interests section found.',
                         raw_text_preview: extractedData.rawTextPreview || ''
                     }, { onConflict: 'material_id' }).select('id').single();

                if (updateError) throw updateError;
                
                if (profileData) {
                    await supabaseAdmin.from('candidate_skills').delete().eq('profile_id', profileData.id);
                    await supabaseAdmin.from('candidate_experience').delete().eq('profile_id', profileData.id);
                    await supabaseAdmin.from('candidate_education').delete().eq('profile_id', profileData.id);
                    await supabaseAdmin.from('candidate_projects').delete().eq('profile_id', profileData.id);
                    
                    const skills = splitText(extractedData.skills);
                    if (skills.length) await supabaseAdmin.from('candidate_skills').insert(skills.map(s => ({ profile_id: profileData.id, skill_name: s })));
                    
                    const experience = splitText(extractedData.experience);
                    if (experience.length) await supabaseAdmin.from('candidate_experience').insert(experience.map(s => ({ profile_id: profileData.id, description: s })));
                    
                    const education = splitText(extractedData.education);
                    if (education.length) await supabaseAdmin.from('candidate_education').insert(education.map(s => ({ profile_id: profileData.id, description: s })));
                    
                    const projects = splitText(extractedData.projects);
                    if (projects.length) await supabaseAdmin.from('candidate_projects').insert(projects.map(s => ({ profile_id: profileData.id, description: s })));
                }
                updated += 1;
            } catch (refreshError) {
                failed += 1;
                failures.push({ file: file.original_name, reason: refreshError.message });
                console.error(`Reprocess error for ${file.original_name}:`, refreshError.message);
            } finally {
                try {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch (cleanupError) {
                    console.error('Temp cleanup error:', cleanupError.message);
                }
            }
        }

        res.status(200).json({
            message: `Refreshed ${updated} resume(s).${failed ? ` ${failed} file(s) could not be refreshed.` : ''}`,
            updated,
            failed,
            failures: failures.slice(0, 10)
        });
    } catch (err) {
        console.error('Reprocess Error:', err.message);
        res.status(500).json({ message: 'Unable to refresh existing resume extractions' });
    }
});

app.delete('/api/files/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const { data: file, error: fetchErr } = await supabase
            .from('materials')
            .select('*')
            .eq('id', id)
            .eq('username', req.user.username)
            .single();

        if (fetchErr || !file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Delete from Storage
        const urlParts = file.file_url.split('/materials/');
        if (urlParts.length > 1) {
            const bucketPath = urlParts[1];
            await supabaseAdmin.storage.from('materials').remove([bucketPath]);
        }

        // Delete from Database
        await supabaseAdmin.from('materials').delete().eq('id', id);

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (err) {
        console.error('Delete Error:', err.message);
        res.status(500).json({ message: 'Error deleting file' });
    }
});

app.listen(PORT, () => {
    console.log(`Server v3.0 (Strict Security) running on port ${PORT}`);
    setupDatabase();
});
