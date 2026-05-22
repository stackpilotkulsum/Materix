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

// Auto-verify database tables exist on startup
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

        console.log('Database verification complete!');
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

        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            try {
                const data = await pdfParse(dataBuffer);
                text = data.text || '';
                
                // OCR FALLBACK: If pdf-parse found almost no text, it's likely a scanned/image PDF
                if (text.trim().length < 50) {
                    console.log(`[OCR] Very little text found in ${originalName}, attempting OCR fallback...`);
                    try {
                        const fileBlob = new Blob([dataBuffer], { type: 'application/pdf' });
                        const formData = new FormData();
                        formData.append('apikey', process.env.OCR_API_KEY || 'helloworld');
                        formData.append('file', fileBlob, originalName);
                        formData.append('filetype', 'pdf');
                        formData.append('isOverlayRequired', 'false');
                        formData.append('OCREngine', '1'); 
                        
                        const resOcr = await fetch('https://api.ocr.space/parse/image', { 
                            method: 'POST', 
                            body: formData 
                        });
                        
                        const ocrData = await resOcr.json();
                        if (ocrData && ocrData.ParsedResults && ocrData.ParsedResults.length > 0) {
                            text = ocrData.ParsedResults.map(p => p.ParsedText).join('\n');
                            console.log(`[OCR] Successfully extracted ${text.length} characters.`);
                        } else if (ocrData && (ocrData.IsErroredOnProcessing || ocrData.ErrorMessage)) {
                            console.error('[OCR] API Error:', ocrData.ErrorMessage || 'Unknown error');
                        }
                    } catch (ocrErr) {
                        console.error('[OCR] Fallback failed:', ocrErr.message);
                    }
                }
            } catch (pdfErr) {
                console.error('pdf-parse error:', pdfErr.message);
                return { email: 'Not found', phone: 'Not found', bio: 'Could not parse PDF: ' + pdfErr.message };
            }
        } else if (ext === '.docx') {
            text = readDocxText(filePath);
        } else if (ext === '.txt') {
            text = fs.readFileSync(filePath, 'utf8');
        } else {
            return { email: 'Not found', phone: 'Not found', bio: 'Not supported' };
        }

        text = normalizeText(text);
        if (!text) {
            return { email: 'Not found', phone: 'Not found', bio: 'Could not parse file: no readable resume text found.' };
        }

        const lines = text
            .split('\n')
            .map(line => line.replace(/^[\s\-*•●▪▫]+/, '').trim())
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
            .replace(/[:|]/g, '')
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
        const phoneMatches = [...new Set(text.match(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{4,6}/g) || [])]
            .map(phone => phone.trim())
            .filter(phone => phone.replace(/\D/g, '').length >= 10);
        const portfolioLinks = lines
            .filter(line => /portfolio|website/i.test(line))
            .flatMap(line => line.match(/(?:https?:\/\/|www\.)\S+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/\S*)?/g) || []);
        const labeledProjectLinks = lines
            .filter(line => /project link|project url|demo link|live link/i.test(line))
            .flatMap(line => line.match(/(?:https?:\/\/|www\.)\S+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/\S*)?/g) || []);
        const isMailLink = (link) => /(^mailto:|gmail\.com|googlemail\.com|mail\.google\.com)/i.test(link);
        const rawLinkedinMatches = (text.match(/(?:linkedin\.com\/\S*)/gi) || []).map(l => l.replace(/[),.;]+$/, ''));
        const rawGithubMatches = (text.match(/(?:github\.com\/\S*)/gi) || []).map(l => l.replace(/[),.;]+$/, ''));
        const links = [...new Set([
            ...(text.match(/(?:https?:\/\/|www\.)\S+|(?:linkedin\.com|github\.com|portfolio\.)\S*/gi) || []),
            ...rawLinkedinMatches,
            ...rawGithubMatches,
            ...portfolioLinks,
            ...labeledProjectLinks
        ])]
            .map(link => link.replace(/[),.;]+$/, ''))
            .filter(link => link && !isMailLink(link));
        const isFakeLink = (link) => /\.(js|ts|jsx|tsx|py|java|css|html|md|pdf|png|jpg|svg|zip|rb|go|rs|cpp|c)$/i.test(link);
        const isRealUrl = (link) => /^https?:\/\//i.test(link) || /^www\./i.test(link) || /\.(com|io|app|dev|net|org|co|in)(\/|$)/i.test(link);
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

        const headerLines = sections.header || lines.slice(0, 8);
        const nameCandidate = headerLines.find(line => {
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
        for (const [index, f] of processedFiles.entries()) {
            const safeOriginalName = path.basename(f.originalname);
            const relPath = pathsArr[index] || '';
            let folderName = f.folder_name;
            if (!folderName && relPath && relPath.includes('/')) {
                folderName = relPath.split('/')[0];
                f.folder_name = folderName;
            }

            const extractedData = await parseResume(f.path, safeOriginalName);

            // Upload to Supabase Storage
            const fileBuffer = fs.readFileSync(f.path);
            const bucketPath = `${req.user.username}/${f.filename}`;
            
            const { error: uploadError } = await supabaseAdmin.storage.from('materials').upload(bucketPath, fileBuffer, {
                contentType: f.mimetype || 'application/octet-stream'
            });
            
            if (uploadError) {
                console.error("Storage upload error:", uploadError);
                continue; // Skip db insert if storage fails
            }

            const { data: publicUrlData } = supabaseAdmin.storage.from('materials').getPublicUrl(bucketPath);
            const publicUrl = publicUrlData.publicUrl;

            console.log(`[UPLOAD] Inserting into DB: ${safeOriginalName}`);
            // Insert into Supabase DB
            const { error: insertError } = await supabaseAdmin.from('materials').insert([{
                username: req.user.username,
                email: email,
                original_name: safeOriginalName,
                file_url: publicUrl,
                file_size: f.size,
                folder: folderName,
                file_count: processedFiles.length,
                extracted_bio: extractedData.bio
            }]);

            if (insertError) {
                console.error("[UPLOAD] DB Insert Error:", insertError);
            }

            uploadedFilesResp.push({
                name: safeOriginalName,
                size: f.size,
                path: publicUrl
            });

            // Delete local file to save space!
            try {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
            } catch (e) {}
        }

        console.log(`Received ${processedFiles.length} files securely`);
        return res.status(200).json({
            message: `${processedFiles.length} file(s) uploaded securely!`,
            files: uploadedFilesResp
        });
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
            .select('*')
            .eq('username', req.user.username)
            .order('created_at', { ascending: false });
            
        console.log(`[FILES API] Query for username "${req.user?.username}" completed. Found ${files?.length || 0} files. Error:`, error);
        
        if (error) throw error;


        const fileList = files.map(f => ({
            id: f.id,
            name: f.original_name,
            size: f.file_size,
            url: f.file_url,
            uploadedAt: f.created_at,
            extracted: { bio: f.extracted_bio },
            folder: f.folder
        }));
        
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

        for (const file of files) {
            const ext = path.extname(file.original_name || '').toLowerCase();
            const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'];
            if (!['.pdf', '.docx', '.txt', ...imageExts].includes(ext) || !file.file_url) {
                failed += 1;
                continue;
            }

            const tempPath = path.join(uploadDir, `${crypto.randomUUID()}${ext}`);

            try {
                const response = await fetch(file.file_url);
                if (!response.ok) throw new Error(`Download failed with status ${response.status}`);

                const arrayBuffer = await response.arrayBuffer();
                fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));

                const extractedData = await parseResume(tempPath, file.original_name);
                const { error: updateError } = await supabaseAdmin
                    .from('materials')
                    .update({ extracted_bio: extractedData.bio })
                    .eq('id', file.id)
                    .eq('username', req.user.username);

                if (updateError) throw updateError;
                updated += 1;
            } catch (refreshError) {
                failed += 1;
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
            failed
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
