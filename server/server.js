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
const sharp = require('sharp');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

// Process crash protection handlers
process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = '24h';

// Initialize Google OAuth Client - get CLIENT_ID from environment
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '355356179432-ceotra0qt2ns8sur8lp1a6or9lgheslm.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

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
    fs.mkdirSync(uploadDir, { recursive: true });
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

// User management helpers (local JSON storage)
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

// Friends and Chat helpers (local JSON storage)
const loadFriends = () => {
    const friendsPath = path.join(__dirname, 'friends.json');
    if (fs.existsSync(friendsPath)) {
        try {
            return JSON.parse(fs.readFileSync(friendsPath));
        } catch (e) {
            return [];
        }
    }
    return [];
};

const saveFriends = (friends) => {
    const friendsPath = path.join(__dirname, 'friends.json');
    fs.writeFileSync(friendsPath, JSON.stringify(friends, null, 2));
};

const loadMessages = () => {
    const messagesPath = path.join(__dirname, 'messages.json');
    if (fs.existsSync(messagesPath)) {
        try {
            return JSON.parse(fs.readFileSync(messagesPath));
        } catch (e) {
            return [];
        }
    }
    return [];
};

const saveMessages = (messages) => {
    const messagesPath = path.join(__dirname, 'messages.json');
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
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

const { parseResume, splitText } = require('./parser.js');

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

    const users = loadUsers();
    if (users[username]) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        users[username] = {
            password: hashedPassword,
            auth_method: 'local',
            createdAt: new Date().toISOString()
        };
        saveUsers(users);
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

    const users = loadUsers();
    const user = users[username];
    if (!user || !user.password) {
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
    res.status(400).json({ message: 'Supabase authentication is discontinued. Please log in with username/password.' });
});

// Google OAuth Login Route
app.post('/api/auth/google-login', async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({ message: 'Google credential is required' });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const email = payload['email'];
        const name = payload['name'];

        const users = loadUsers();
        let username = Object.keys(users).find(u => users[u].email === email);

        if (!username) {
            username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
            if (users[username]) {
                username = `${username}_${Date.now().toString().slice(-4)}`;
            }
            users[username] = {
                email,
                name,
                auth_method: 'google',
                createdAt: new Date().toISOString()
            };
            saveUsers(users);
        }

        const token = jwt.sign({ username, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
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

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const email = payload['email'];
        const name = payload['name'];

        const users = loadUsers();
        let existingUsername = Object.keys(users).find(u => users[u].email === email);

        if (existingUsername) {
            return res.status(400).json({ message: 'This Google account is already registered' });
        }

        let username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
        if (users[username]) {
            username = `${username}_${Date.now().toString().slice(-4)}`;
        }

        users[username] = {
            email,
            name,
            auth_method: 'google',
            createdAt: new Date().toISOString()
        };
        saveUsers(users);

        const token = jwt.sign({ username, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
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

            // File Type and Deep Binary Inspection
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
                        const userDir = path.join(uploadDir, req.user.username);

                        zipEntries.forEach(zipEntry => {
                            if (!zipEntry.isDirectory) {
                                const entryExt = path.extname(zipEntry.entryName).toLowerCase();
                                const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'];
                                if (['.pdf', '.docx', '.txt', ...imageExts].includes(entryExt)) {
                                    const uuid = crypto.randomUUID();
                                    const newFilename = `${uuid}${entryExt}`;
                                    const newPath = path.join(userDir, newFilename);
                                    
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
                        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
                    }
                } else {
                    processedFiles.push({
                        ...f,
                        folder_name: null
                    });
                }
            }

            // Parse paths from request body
            let pathsArr = [];
            if (req.body.paths) {
                pathsArr = Array.isArray(req.body.paths) ? req.body.paths : [req.body.paths];
            }

            const metadata = loadMetadata(req.user.username);
            let uploadedFilesResp = [];
            let failedFiles = [];
            let errors = {};

            for (const [index, f] of processedFiles.entries()) {
                const safeOriginalName = path.basename(f.originalname);
                const relPath = pathsArr[index] || '';
                let folderName = f.folder_name;
                if (!folderName && relPath && relPath.includes('/')) {
                    folderName = relPath.split('/')[0];
                    f.folder_name = folderName;
                }

                try {
                    console.log(`[UPLOAD] Processing file locally: ${safeOriginalName}`);
                    const extractedData = await parseResume(f.path, safeOriginalName);
                    
                    let bioData = extractedData.bio || '';
                    let summaryText = 'No summary found.';
                    try {
                        const parsed = JSON.parse(bioData);
                        summaryText = parsed.bio || 'No summary found.';
                    } catch (jsonErr) {}

                    const fileId = crypto.randomUUID();
                    const relativeUrl = `/uploads/${req.user.username}/${f.filename}`;
                    
                    const record = {
                        id: fileId,
                        username: req.user.username,
                        original_name: safeOriginalName,
                        filename: f.filename,
                        file_url: relativeUrl,
                        file_size: f.size,
                        folder: folderName,
                        created_at: new Date().toISOString(),
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
                    };

                    metadata[fileId] = record;
                    console.log(`[UPLOAD] Saved local material record: ${safeOriginalName}`);
                    
                    uploadedFilesResp.push({
                        name: safeOriginalName,
                        size: f.size,
                        path: relativeUrl
                    });
                } catch (error) {
                    console.error(`[UPLOAD] Error processing ${safeOriginalName}:`, error.message);
                    failedFiles.push(safeOriginalName);
                    errors[safeOriginalName] = error.message;
                }
            }

            saveMetadata(req.user.username, metadata);

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

// API Route to list uploaded files from local metadata
app.get("/", (req, res) => {
    res.send("Materix Backend Running (Local Storage Mode)");
});

app.get('/api/files', authenticateToken, async (req, res) => {
    console.log(`[FILES API] Request received for user: ${req.user.username}`);
    try {
        const metadata = loadMetadata(req.user.username);
        const fileList = Object.values(metadata).map(f => {
            const bioJsonString = f.extracted_bio;
            return {
                id: f.id || f.filename,
                name: f.original_name,
                size: f.file_size,
                url: f.file_url,
                uploadedAt: f.created_at,
                extracted: { bio: bioJsonString },
                folder: f.folder
            };
        }).sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        
        res.status(200).json(fileList);
    } catch (err) {
        console.error('Metadata Fetch Error:', err.message);
        res.status(500).json({ message: 'Unable to fetch files from local storage' });
    }
});

app.post('/api/files/reprocess', authenticateToken, async (req, res) => {
    try {
        const metadata = loadMetadata(req.user.username);
        const fileRecords = Object.values(metadata);

        if (!fileRecords || fileRecords.length === 0) {
            return res.status(200).json({ message: 'No stored resumes found to refresh.', updated: 0 });
        }

        let updated = 0;
        let failed = 0;
        const failures = [];

        for (const fileRecord of fileRecords) {
            const filePath = path.join(uploadDir, req.user.username, fileRecord.filename);
            if (!fs.existsSync(filePath)) {
                failed += 1;
                failures.push({ file: fileRecord.original_name, reason: 'File missing on local disk' });
                continue;
            }

            try {
                const extractedData = await parseResume(filePath, fileRecord.original_name);
                const bioData = extractedData.bio || '';
                let summaryText = 'No summary found.';
                try {
                    const parsed = JSON.parse(bioData);
                    summaryText = parsed.bio || 'No summary found.';
                } catch (jsonErr) {}

                fileRecord.extracted_bio = bioData;
                fileRecord.candidate_name = extractedData.name || 'Not found';
                fileRecord.candidate_email = extractedData.email || 'Not found';
                fileRecord.candidate_phone = extractedData.phone || 'Not found';
                fileRecord.linkedin = extractedData.linkedin || 'Not found';
                fileRecord.github = extractedData.github || 'Not found';
                fileRecord.portfolio_link = extractedData.portfolioLink || 'Not found';
                fileRecord.summary = summaryText;
                fileRecord.skills = extractedData.skills || 'No skills section found.';
                fileRecord.experience = extractedData.experience || 'No experience section found.';
                fileRecord.education = extractedData.education || 'No education section found.';
                fileRecord.projects = extractedData.projects || 'No projects section found.';
                fileRecord.certifications = extractedData.certifications || 'No certifications section found.';
                fileRecord.achievements = extractedData.achievements || 'No achievements section found.';
                fileRecord.languages = extractedData.languages || 'No languages section found.';
                fileRecord.extracurricular = extractedData.extracurricular || 'No extra curricular activities section found.';
                fileRecord.interests = extractedData.interests || 'No interests section found.';
                fileRecord.raw_text_preview = extractedData.rawTextPreview || '';

                metadata[fileRecord.id] = fileRecord;
                updated += 1;
            } catch (refreshError) {
                failed += 1;
                failures.push({ file: fileRecord.original_name, reason: refreshError.message });
            }
        }

        saveMetadata(req.user.username, metadata);

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
        const metadata = loadMetadata(req.user.username);
        const fileRecord = metadata[id] || Object.values(metadata).find(f => f.id === id || f.filename === id);

        if (!fileRecord) {
            return res.status(404).json({ message: 'File not found' });
        }

        const filePath = path.join(uploadDir, req.user.username, fileRecord.filename || id);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) { console.error('Unlink error:', e.message); }
        }

        const recordId = fileRecord.id || id;
        delete metadata[recordId];
        saveMetadata(req.user.username, metadata);

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (err) {
        console.error('Delete Error:', err.message);
        res.status(500).json({ message: 'Error deleting file' });
    }
});

// ==========================================
// FRIENDS & CHAT API ROUTES (Local JSON Storage)
// ==========================================

// Search for other users by username
app.get('/api/friends/search', authenticateToken, async (req, res) => {
    const { username } = req.query;
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ message: 'Username query parameter is required' });
    }
    try {
        const users = loadUsers();
        const searchLower = username.toLowerCase();
        const results = Object.keys(users)
            .filter(u => u !== req.user.username && u.toLowerCase().includes(searchLower))
            .slice(0, 10)
            .map(u => ({ username: u, email: users[u].email || '', name: users[u].name || u }));

        res.json(results);
    } catch (err) {
        console.error('Error searching friends:', err.message);
        res.status(500).json({ message: 'Error searching profiles' });
    }
});

// Send friend request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
    const { friend_username } = req.body;
    const user_username = req.user.username;

    if (!friend_username || user_username === friend_username) {
        return res.status(400).json({ message: 'Invalid friend username' });
    }

    try {
        const users = loadUsers();
        if (!users[friend_username]) {
            return res.status(404).json({ message: 'Target user does not exist' });
        }

        const friendships = loadFriends();
        const existing = friendships.find(f => 
            (f.user_username === user_username && f.friend_username === friend_username) ||
            (f.user_username === friend_username && f.friend_username === user_username)
        );

        if (existing) {
            if (existing.status === 'accepted') {
                return res.status(400).json({ message: 'You are already friends' });
            } else if (existing.user_username === user_username) {
                return res.status(400).json({ message: 'Friend request already sent' });
            } else {
                return res.status(400).json({ message: 'You have a pending friend request from this user.' });
            }
        }

        const newFriendship = {
            id: crypto.randomUUID(),
            user_username,
            friend_username,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        friendships.push(newFriendship);
        saveFriends(friendships);

        res.status(201).json({ message: 'Friend request sent successfully' });
    } catch (err) {
        console.error('Error sending friend request:', err.message);
        res.status(500).json({ message: 'Error sending friend request' });
    }
});

// Get pending friend requests
app.get('/api/friends/requests', authenticateToken, async (req, res) => {
    const username = req.user.username;
    try {
        const friendships = loadFriends();
        const incoming = friendships.filter(f => f.friend_username === username && f.status === 'pending');
        const outgoing = friendships.filter(f => f.user_username === username && f.status === 'pending');

        res.json({ incoming, outgoing });
    } catch (err) {
        console.error('Error fetching friend requests:', err.message);
        res.status(500).json({ message: 'Error fetching requests' });
    }
});

// Accept or decline friend request
app.post('/api/friends/respond', authenticateToken, async (req, res) => {
    const { id, action } = req.body;
    const username = req.user.username;

    if (!id || !['accept', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Invalid response data' });
    }

    try {
        let friendships = loadFriends();
        const index = friendships.findIndex(f => f.id === id && f.friend_username === username);

        if (index === -1) {
            return res.status(404).json({ message: 'Friend request not found or unauthorized' });
        }

        if (action === 'accept') {
            friendships[index].status = 'accepted';
            saveFriends(friendships);
            res.json({ message: 'Friend request accepted' });
        } else {
            friendships.splice(index, 1);
            saveFriends(friendships);
            res.json({ message: 'Friend request rejected/deleted' });
        }
    } catch (err) {
        console.error('Error responding to friend request:', err.message);
        res.status(500).json({ message: 'Error responding to friend request' });
    }
});

// Get list of friends (accepted relationships)
app.get('/api/friends', authenticateToken, async (req, res) => {
    const username = req.user.username;
    try {
        const friendships = loadFriends();
        const accepted = friendships.filter(f => f.status === 'accepted' && (f.user_username === username || f.friend_username === username));
        const friends = accepted.map(f => f.user_username === username ? f.friend_username : f.user_username);

        res.json(friends);
    } catch (err) {
        console.error('Error fetching friends:', err.message);
        res.status(500).json({ message: 'Error fetching friends list' });
    }
});

// Get list of active chats
app.get('/api/chat/active-chats', authenticateToken, async (req, res) => {
    const username = req.user.username;
    try {
        const messages = loadMessages();
        const activeUsernames = new Set();
        messages.forEach(msg => {
            if (msg.sender_username === username) activeUsernames.add(msg.receiver_username);
            if (msg.receiver_username === username) activeUsernames.add(msg.sender_username);
        });

        res.json(Array.from(activeUsernames));
    } catch (err) {
        console.error('Error fetching active chats:', err.message);
        res.status(500).json({ message: 'Error fetching active chats' });
    }
});

// Get messages between current user and a friend
app.get('/api/chat/messages/:friend_username', authenticateToken, async (req, res) => {
    const user_username = req.user.username;
    const { friend_username } = req.params;

    try {
        const friendships = loadFriends();
        const isFriend = friendships.some(f => 
            f.status === 'accepted' &&
            ((f.user_username === user_username && f.friend_username === friend_username) ||
             (f.user_username === friend_username && f.friend_username === user_username))
        );

        if (!isFriend) {
            return res.status(403).json({ message: 'You can only chat with accepted friends' });
        }

        const messages = loadMessages();
        const chatHistory = messages.filter(msg => 
            (msg.sender_username === user_username && msg.receiver_username === friend_username) ||
            (msg.sender_username === friend_username && msg.receiver_username === user_username)
        ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        res.json(chatHistory);
    } catch (err) {
        console.error('Error fetching chat history:', err.message);
        res.status(500).json({ message: 'Error fetching chat history' });
    }
});

// Send a chat message
app.post('/api/chat/messages', authenticateToken, async (req, res) => {
    const sender_username = req.user.username;
    const { receiver_username, content, file_url, file_name, file_size } = req.body;

    if (!receiver_username) {
        return res.status(400).json({ message: 'Receiver username is required' });
    }

    if (!content && !file_url) {
        return res.status(400).json({ message: 'Message content or attachment is required' });
    }

    try {
        const friendships = loadFriends();
        const isFriend = friendships.some(f => 
            f.status === 'accepted' &&
            ((f.user_username === sender_username && f.friend_username === receiver_username) ||
             (f.user_username === receiver_username && f.friend_username === sender_username))
        );

        if (!isFriend) {
            return res.status(403).json({ message: 'You can only send messages to accepted friends' });
        }

        const messages = loadMessages();
        const newMessage = {
            id: crypto.randomUUID(),
            sender_username,
            receiver_username,
            content: content || null,
            file_url: file_url || null,
            file_name: file_name || null,
            file_size: file_size || null,
            created_at: new Date().toISOString()
        };
        messages.push(newMessage);
        saveMessages(messages);

        res.status(201).json(newMessage);
    } catch (err) {
        console.error('Error sending message:', err.message);
        res.status(500).json({ message: 'Error sending message' });
    }
});

// Chat file upload endpoint (Local file storage)
app.post('/api/chat/upload', authenticateToken, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('Chat upload Multer Error:', err.message);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'File too large. Max limit is 10MB.' });
            }
            return res.status(400).json({ message: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No file received.' });
        }

        const safeOriginalName = path.basename(req.file.originalname);
        
        try {
            const fd = fs.openSync(req.file.path, 'r');
            const buffer = Buffer.alloc(4);
            fs.readSync(fd, buffer, 0, 4, 0);
            fs.closeSync(fd);
            if ((buffer[0] === 0x4D && buffer[1] === 0x5A) ||
                (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46)) {
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                return res.status(403).json({ message: 'Security Block: Executables are strictly prohibited.' });
            }
        } catch (e) {
            console.error("Error checking chat file header:", e.message);
        }

        try {
            const relativeUrl = `/uploads/${req.user.username}/${req.file.filename}`;
            res.json({
                file_url: relativeUrl,
                file_name: safeOriginalName,
                file_size: req.file.size
            });
        } catch (uploadErr) {
            console.error('[CHAT UPLOAD] General error:', uploadErr.message);
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.status(500).json({ message: 'Upload failed' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running in Local Storage Mode on port ${PORT}`);
});
