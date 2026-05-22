const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let code = fs.readFileSync(serverPath, 'utf8');

// 1. Add Supabase Client
code = code.replace(
  "const { OAuth2Client } = require('google-auth-library');",
  "const { OAuth2Client } = require('google-auth-library');\nconst { createClient } = require('@supabase/supabase-js');"
);

code = code.replace(
  "const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);",
  "const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);\nconst supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);"
);

// 2. Remove loadUsers, saveUsers, loadMetadata, saveMetadata
// We will just not use them, but we can leave the functions there to avoid breaking random things, 
// and just replace their usage. Actually, it's safer to leave the functions defined.

// 3. Register Auth Route
code = code.replace(
  /const users = loadUsers\(\);[\s\S]*?res\.status\(201\)\.json\(\{ message: 'User registered successfully' \}\);/m,
  `const { data: existingUser } = await supabase.from('profiles').select('username').eq('username', username).single();
    if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabase.from('profiles').insert([{
            username,
            password: hashedPassword,
            auth_method: 'local'
        }]);
        
        if (error) throw error;
        res.status(201).json({ message: 'User registered successfully' });`
);

// 4. Login Auth Route
code = code.replace(
  /const users = loadUsers\(\);\s*const user = users\[username\];\s*if \(!user\) \{[\s\S]*?res\.json\(\{ token, username \}\);/m,
  `const { data: user } = await supabase.from('profiles').select('*').eq('username', username).single();
    if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' });
    }

    try {
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token, username });`
);

// 5. Supabase Login Auth Route
code = code.replace(
  /const users = loadUsers\(\);[\s\S]*?res\.json\(\{ token, username \}\);/m,
  `const { data: existingUser } = await supabase.from('profiles').select('*').eq('email', email).single();
        let username;
        
        if (existingUser) {
            username = existingUser.username;
        } else {
            const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '') || 'user';
            username = emailPrefix;
            
            // Just assume username is unique enough for now, or append random string
            username = username + Math.floor(Math.random() * 1000);
            
            await supabase.from('profiles').insert([{
                username,
                email,
                name,
                auth_method: 'supabase'
            }]);
        }

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token, username });`
);

// 6. Google Login Auth Route
code = code.replace(
  /const users = loadUsers\(\);[\s\S]*?res\.json\(\{ token, username \}\);/m,
  `const { data: existingUser } = await supabase.from('profiles').select('*').eq('email', email).single();
        let username;

        if (existingUser) {
            username = existingUser.username;
        } else {
            username = email.split('@')[0] + Math.floor(Math.random() * 1000);
            await supabase.from('profiles').insert([{
                username,
                email,
                name,
                auth_method: 'google'
            }]);
        }

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.json({ token, username });`
);

// 7. Google Register Auth Route (simplifying to just login logic since they overlap)
code = code.replace(
  /const users = loadUsers\(\);[\s\S]*?res\.status\(201\)\.json\(\{ token, username, message: 'Registration successful' \}\);/m,
  `const { data: existingUser } = await supabase.from('profiles').select('*').eq('email', email).single();
        let username;

        if (existingUser) {
            return res.status(400).json({ message: 'This Google account is already registered' });
        } else {
            username = email.split('@')[0] + Math.floor(Math.random() * 1000);
            await supabase.from('profiles').insert([{
                username,
                email,
                name,
                auth_method: 'google'
            }]);
        }

        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        res.status(201).json({ token, username, message: 'Registration successful' });`
);

// 8. API Upload Route
code = code.replace(
  /\/\/ Load existing metadata[\s\S]*?res\.status\(200\)\.json\(\{/m,
  `// Get user email
        const { data: userProfile } = await supabase.from('profiles').select('email').eq('username', req.user.username).single();
        const email = userProfile ? userProfile.email : '';

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
            const bucketPath = \`\${req.user.username}/\${f.filename}\`;
            
            const { error: uploadError } = await supabase.storage.from('materials').upload(bucketPath, fileBuffer, {
                contentType: f.mimetype || 'application/octet-stream'
            });
            
            if (uploadError) {
                console.error("Storage upload error:", uploadError);
                continue; // Skip db insert if storage fails
            }

            const { data: publicUrlData } = supabase.storage.from('materials').getPublicUrl(bucketPath);
            const publicUrl = publicUrlData.publicUrl;

            // Insert into Supabase DB
            await supabase.from('materials').insert([{
                username: req.user.username,
                email: email,
                original_name: safeOriginalName,
                file_url: publicUrl,
                file_size: f.size,
                folder: folderName,
                file_count: processedFiles.length,
                extracted_bio: extractedData.bio
            }]);

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

        console.log(\`Received \${processedFiles.length} files securely\`);
        return res.status(200).json({`
);

code = code.replace(
  /files: processedFiles\.map\(f => \(\{[\s\S]*?\}\)\)/,
  `files: uploadedFilesResp`
);


// 9. API Files Route (GET)
code = code.replace(
  /app\.get\('\/api\/files', authenticateToken, \(req, res\) => \{[\s\S]*?\}\);/m,
  `app.get('/api/files', authenticateToken, async (req, res) => {
    try {
        const { data: files, error } = await supabase
            .from('materials')
            .select('*')
            .eq('username', req.user.username)
            .order('created_at', { ascending: false });
            
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
});`
);

// 10. API Files Route (DELETE)
code = code.replace(
  /app\.delete\('\/api\/files\/:id', authenticateToken, \(req, res\) => \{[\s\S]*?\}\);/m,
  `app.delete('/api/files/:id', authenticateToken, async (req, res) => {
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
            await supabase.storage.from('materials').remove([bucketPath]);
        }

        // Delete from Database
        await supabase.from('materials').delete().eq('id', id);

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (err) {
        console.error('Delete Error:', err.message);
        res.status(500).json({ message: 'Error deleting file' });
    }
});`
);

fs.writeFileSync(serverPath, code);
console.log('Successfully patched server.js!');
