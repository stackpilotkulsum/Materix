const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const AdmZip = require('adm-zip');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

const groupItemsIntoLines = (colItems) => {
    const lines = [];
    colItems.sort((a, b) => b.y - a.y);

    colItems.forEach(item => {
        let matchedLine = lines.find(line => Math.abs(line.y - item.y) < 4);
        if (matchedLine) {
            matchedLine.items.push(item);
        } else {
            lines.push({
                y: item.y,
                items: [item]
            });
        }
    });

    lines.sort((a, b) => b.y - a.y);
    lines.forEach(line => {
        line.items.sort((a, b) => a.x - b.x);
    });

    return lines
        .map(line => line.items.map(item => item.text).join(' '))
        .join('\n');
};

const extractPdfTextWithLayout = async (dataBuffer) => {
    try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) });
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const items = textContent.items;

            if (!items || items.length === 0) continue;

            const validItems = items
                .filter(item => item.str && item.str.trim().length > 0)
                .map(item => ({
                    text: item.str,
                    x: item.transform[4],
                    y: item.transform[5],
                    width: item.width || 0,
                    height: item.transform[3] || item.transform[0] || 10
                }));

            if (validItems.length === 0) continue;

            const xCoords = validItems.map(item => item.x);
            const minX = Math.min(...xCoords);
            const maxX = Math.max(...xCoords);
            const width = maxX - minX;

            if (width < 50) {
                const pageText = groupItemsIntoLines(validItems);
                fullText += pageText + '\n\n';
                continue;
            }

            const binCount = 10;
            const binWidth = width / binCount;
            const bins = Array(binCount).fill(0);
            
            validItems.forEach(item => {
                const relX = item.x - minX;
                let binIdx = Math.floor(relX / binWidth);
                if (binIdx >= binCount) binIdx = binCount - 1;
                if (binIdx < 0) binIdx = 0;
                bins[binIdx]++;
            });

            const midStart = Math.floor(binCount * 0.3);
            const midEnd = Math.floor(binCount * 0.7);
            
            let minMidBinIdx = midStart;
            let minMidBinVal = bins[midStart];
            for (let b = midStart + 1; b <= midEnd; b++) {
                if (bins[b] < minMidBinVal) {
                    minMidBinVal = bins[b];
                    minMidBinIdx = b;
                }
            }

            const totalItems = validItems.length;
            const leftCount = bins.slice(0, minMidBinIdx).reduce((a, b) => a + b, 0);
            const rightCount = bins.slice(minMidBinIdx + 1).reduce((a, b) => a + b, 0);

            const isTwoColumn = (minMidBinVal < totalItems * 0.08 || minMidBinVal <= 5) && 
                                (leftCount > totalItems * 0.2) && 
                                (rightCount > totalItems * 0.2);

            if (isTwoColumn) {
                const splitX = minX + (minMidBinIdx + 0.5) * binWidth;
                const leftItems = validItems.filter(item => item.x < splitX);
                const rightItems = validItems.filter(item => item.x >= splitX);

                const leftText = groupItemsIntoLines(leftItems);
                const rightText = groupItemsIntoLines(rightItems);

                fullText += `${leftText}\n\n${rightText}\n\n`;
            } else {
                const pageText = groupItemsIntoLines(validItems);
                fullText += pageText + '\n\n';
            }
        }

        return fullText.trim();
    } catch (err) {
        console.error("[LAYOUT PARSER] Error extracting layout text:", err.message);
        return '';
    }
};

const parseResume = async (filePath, originalName) => {
    const ext = path.extname(originalName).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
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

    // 1. Attempt Gemini-powered extraction if GEMINI_API_KEY is available
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        try {
            console.log(`[GEMINI] Attempting structured extraction for ${originalName}...`);
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

            let parts = [];
            if (ext === '.pdf' || imageExts.includes(ext)) {
                const fileBuffer = fs.readFileSync(filePath);
                let geminiMime = ext === '.pdf' ? 'application/pdf' : 'image/png';
                if (ext === '.jpg' || ext === '.jpeg') geminiMime = 'image/jpeg';
                else if (ext === '.png') geminiMime = 'image/png';
                else if (ext === '.webp') geminiMime = 'image/webp';

                parts.push({
                    inlineData: {
                        data: fileBuffer.toString('base64'),
                        mimeType: geminiMime
                    }
                });
                parts.push({
                    text: "Extract structured information from the provided resume file. " +
                          "Make sure to extract and classify all sections accurately. " +
                          "Identify name, email, phone, linkedin, github, portfolio/website links, " +
                          "professional summary/bio, skills, experience, education, projects, certifications, " +
                          "achievements, languages, extracurricular activities, and interests. " +
                          "Separate multiple items in fields like 'skills', 'experience', 'education', 'projects', 'certifications', 'achievements', 'languages', 'extracurricular', and 'interests' using newlines."
                });
            } else {
                let localText = '';
                if (ext === '.docx') localText = readDocxText(filePath);
                else if (ext === '.txt') localText = fs.readFileSync(filePath, 'utf8');
                else if (ext === '.svg') {
                    try {
                        const svgContent = fs.readFileSync(filePath, 'utf8');
                        localText = svgContent
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                            .replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                    } catch (e) {
                        console.error("SVG read error for Gemini:", e);
                    }
                }
                parts.push({
                    text: `Extract structured information from the following resume text. Separate multiple items in fields using newlines:\n\n${localText}`
                });
            }

            const response = await model.generateContent({
                contents: [{ role: 'user', parts }],
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

            const parsedData = JSON.parse(response.response.text());
            let previewText = '';
            if (ext === '.pdf' || imageExts.includes(ext)) {
                previewText = `[Gemini Extracted Resume]\nName: ${parsedData.name}\nEmail: ${parsedData.email}\nPhone: ${parsedData.phone}\n\nSummary:\n${parsedData.summary}\n\nSkills:\n${parsedData.skills}\n\nExperience:\n${parsedData.experience}\n\nEducation:\n${parsedData.education}\n\nProjects:\n${parsedData.projects}`;
            } else {
                if (ext === '.docx') previewText = readDocxText(filePath);
                else if (ext === '.txt') previewText = fs.readFileSync(filePath, 'utf8');
                else if (ext === '.svg') {
                    try {
                        const svgContent = fs.readFileSync(filePath, 'utf8');
                        previewText = svgContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    } catch (e) {}
                }
            }

            const links = [...new Set([
                parsedData.linkedin,
                parsedData.github,
                parsedData.portfolioLink
            ])].filter(link => link && link !== 'Not found');

            const extractedData = {
                name: parsedData.name || 'Not found',
                email: parsedData.email || 'Not found',
                emails: parsedData.email && parsedData.email !== 'Not found' ? [parsedData.email] : [],
                phone: parsedData.phone || 'Not found',
                phones: parsedData.phone && parsedData.phone !== 'Not found' ? [parsedData.phone] : [],
                links,
                linkedin: parsedData.linkedin || 'Not found',
                github: parsedData.github || 'Not found',
                portfolioLink: parsedData.portfolioLink || 'Not found',
                projectLinks: [],
                bio: parsedData.summary || 'No summary found.',
                skills: parsedData.skills || 'No skills section found.',
                experience: parsedData.experience || 'No experience section found.',
                education: parsedData.education || 'No education section found.',
                projects: parsedData.projects || 'No projects section found.',
                certifications: parsedData.certifications || 'No certifications section found.',
                achievements: parsedData.achievements || 'No achievements section found.',
                languages: parsedData.languages || 'No languages section found.',
                extracurricular: parsedData.extracurricular || 'No extra curricular activities section found.',
                interests: parsedData.interests || 'No interests section found.',
                rawTextPreview: previewText
            };

            console.log(`[GEMINI] Successfully extracted structured resume data for: ${originalName}`);
            return {
                ...extractedData,
                bio: JSON.stringify(extractedData)
            };
        } catch (geminiErr) {
            console.error(`[GEMINI] Gemini extraction failed. Falling back to local parser. Error:`, geminiErr.message);
        }
    }

    try {
        let text = '';
        let embeddedLinks = [];

        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            embeddedLinks = await readPdfLinks(dataBuffer);
            
            try {
                console.log(`[PDF] Attempting layout-aware text extraction: ${originalName}`);
                text = await extractPdfTextWithLayout(dataBuffer);
                text = normalizeText(text || '');
                console.log(`[PDF] Layout text extraction complete. Characters found: ${text.length}`);
            } catch (pdfLayoutErr) {
                console.error('[PDF] Layout-aware extraction error, falling back to pdf-parse:', pdfLayoutErr.message);
                try {
                    const data = await pdfParse(dataBuffer);
                    text = normalizeText(data.text || '');
                } catch (pdfParseErr) {
                    console.error('[PDF] pdf-parse fallback error:', pdfParseErr.message);
                    text = '';
                }
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
                            if (
                                ops.fnArray[j] === OPS.paintImageXObject ||
                                ops.fnArray[j] === OPS.paintInlineImageXObject ||
                                ops.fnArray[j] === OPS.paintImageMaskXObject
                            ) {
                                const args = ops.argsArray[j];
                                const imgName = args[0];
                                const imgObj = page.objs.get(imgName) || page.commonObjs.get(imgName);
                                if (!imgObj) continue;
                                
                                const { width, height, data: imgData } = imgObj;
                                if (!imgData || typeof width !== 'number' || typeof height !== 'number') {
                                    continue;
                                }
                                
                                const { PNG } = require('pngjs');
                                const png = new PNG({ width, height });
                                
                                let rgbaData;
                                if (imgData.length === width * height * 4) {
                                    rgbaData = imgData;
                                } else if (imgData.length === width * height * 3) {
                                    rgbaData = new Uint8ClampedArray(width * height * 4);
                                    for (let k = 0; k < width * height; k++) {
                                        rgbaData[k * 4] = imgData[k * 3];
                                        rgbaData[k * 4 + 1] = imgData[k * 3 + 1];
                                        rgbaData[k * 4 + 2] = imgData[k * 3 + 2];
                                        rgbaData[k * 4 + 3] = 255;
                                    }
                                } else if (imgData.length === width * height) {
                                    rgbaData = new Uint8ClampedArray(width * height * 4);
                                    for (let k = 0; k < width * height; k++) {
                                        const val = imgData[k];
                                        rgbaData[k * 4] = val;
                                        rgbaData[k * 4 + 1] = val;
                                        rgbaData[k * 4 + 2] = val;
                                        rgbaData[k * 4 + 3] = 255;
                                    }
                                } else {
                                    rgbaData = imgData;
                                }
                                
                                png.data = Buffer.from(rgbaData);
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
        } else if (ext === '.svg') {
            try {
                console.log(`[SVG] Reading text content from SVG file: ${originalName}`);
                const svgContent = fs.readFileSync(filePath, 'utf8');
                text = svgContent
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                console.log(`[SVG] Extracted ${text.length} characters.`);
            } catch (svgErr) {
                console.error('[SVG] Error reading SVG:', svgErr.message);
                text = '';
            }
        } else if (imageExts.includes(ext)) {
            try {
                console.log(`[OCR] Running enhanced multi-strategy Tesseract on image: ${originalName}`);
                
                // Get image metadata for smart preprocessing
                const imgMetadata = await sharp(filePath).metadata();
                const imgWidth = imgMetadata.width || 1000;
                const imgHeight = imgMetadata.height || 1000;
                console.log(`[OCR] Image dimensions: ${imgWidth}x${imgHeight}, format: ${imgMetadata.format}`);

                // Target width: upscale small images aggressively for better OCR
                const targetWidth = Math.max(3200, imgWidth * 2);

                // Strategy 1: High-contrast greyscale with moderate threshold
                const makeStrategy1 = () => sharp(filePath)
                    .resize({ width: targetWidth, withoutEnlargement: false })
                    .greyscale()
                    .normalize()
                    .sharpen({ sigma: 1.0 })
                    .threshold(128)
                    .png()
                    .toBuffer();

                // Strategy 2: Normalized greyscale WITHOUT threshold (preserves gradient text)
                const makeStrategy2 = () => sharp(filePath)
                    .resize({ width: targetWidth, withoutEnlargement: false })
                    .greyscale()
                    .normalize()
                    .sharpen({ sigma: 0.5 })
                    .png()
                    .toBuffer();

                // Strategy 3: High threshold for light backgrounds
                const makeStrategy3 = () => sharp(filePath)
                    .resize({ width: targetWidth, withoutEnlargement: false })
                    .greyscale()
                    .normalize()
                    .sharpen({ sigma: 2.0 })
                    .threshold(180)
                    .png()
                    .toBuffer();

                // Strategy 4: Inverted colors (for dark background resumes)
                const makeStrategy4 = () => sharp(filePath)
                    .resize({ width: targetWidth, withoutEnlargement: false })
                    .greyscale()
                    .normalize()
                    .negate()
                    .threshold(140)
                    .png()
                    .toBuffer();

                // Strategy 5: Raw upscaled image with no processing
                const makeStrategy5 = () => sharp(filePath)
                    .resize({ width: targetWidth, withoutEnlargement: false })
                    .png()
                    .toBuffer();

                const strategies = [
                    { name: 'Normalized (no threshold)', make: makeStrategy2 },
                    { name: 'Moderate threshold (128)', make: makeStrategy1 },
                    { name: 'High threshold (180)', make: makeStrategy3 },
                    { name: 'Raw upscaled', make: makeStrategy5 },
                    { name: 'Inverted (dark bg)', make: makeStrategy4 },
                ];

                let bestText = '';
                let bestConfidence = 0;
                let bestStrategy = '';

                for (const strategy of strategies) {
                    try {
                        console.log(`[OCR] Trying strategy: ${strategy.name}...`);
                        const buffer = await strategy.make();

                        const { data: { text: ocrText, confidence: ocrConf } } = await Tesseract.recognize(buffer, 'eng', {
                            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
                            tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
                            preserve_interword_spaces: '1',
                        });

                        const cleaned = (ocrText || '').trim();
                        const conf = ocrConf || 0;
                        console.log(`[OCR]   -> ${strategy.name}: ${cleaned.length} chars, ${conf.toFixed(1)}% confidence`);

                        // Pick the strategy that yields the most text with decent confidence
                        // Weight: longer text is strongly preferred, confidence is secondary
                        const score = cleaned.length * (1 + conf / 100);
                        const bestScore = bestText.length * (1 + bestConfidence / 100);

                        if (score > bestScore) {
                            bestText = cleaned;
                            bestConfidence = conf;
                            bestStrategy = strategy.name;
                        }

                        // If we got really good results, stop early
                        if (cleaned.length > 500 && conf > 75) {
                            console.log(`[OCR]   -> Good enough result, skipping remaining strategies.`);
                            break;
                        }
                    } catch (stratErr) {
                        console.warn(`[OCR]   -> Strategy "${strategy.name}" failed:`, stratErr.message);
                    }
                }

                // Also try PSM.SINGLE_BLOCK mode on the best strategy if text is still short
                if (bestText.length < 200) {
                    try {
                        console.log(`[OCR] Text still short, trying SINGLE_BLOCK mode...`);
                        const buffer = await makeStrategy2();
                        const { data: { text: blockText } } = await Tesseract.recognize(buffer, 'eng', {
                            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
                            tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
                            preserve_interword_spaces: '1',
                        });
                        if ((blockText || '').trim().length > bestText.length) {
                            bestText = (blockText || '').trim();
                            bestStrategy = 'SINGLE_BLOCK fallback';
                        }
                    } catch (e) {
                        console.warn('[OCR] SINGLE_BLOCK fallback failed:', e.message);
                    }
                }

                console.log(`[OCR] Best strategy: "${bestStrategy}" — ${bestText.length} chars, ${bestConfidence.toFixed(1)}% confidence`);

                // Post-process OCR text to fix common misreads
                text = bestText
                    // Fix common OCR misreads of @ symbol
                    .replace(/\s*\(at\)\s*/gi, '@')
                    .replace(/\s*\[at\]\s*/gi, '@')
                    .replace(/(\w)©(\w)/g, '$1@$2')
                    .replace(/(\w)\s*@\s*(\w)/g, '$1@$2')
                    // Fix common OCR misreads of dots in emails/URLs  
                    .replace(/(\w)\s*\.\s*com\b/gi, '$1.com')
                    .replace(/(\w)\s*\.\s*org\b/gi, '$1.org')
                    .replace(/(\w)\s*\.\s*net\b/gi, '$1.net')
                    .replace(/(\w)\s*\.\s*io\b/gi, '$1.io')
                    // Fix phone number OCR artifacts
                    .replace(/[oO](\d{2,})/g, '0$1')
                    .replace(/(\d)[lI](\d)/g, '$11$2')
                    // Clean up OCR noise characters
                    .replace(/[|]{2,}/g, '')
                    .replace(/[~`]{2,}/g, '')
                    .replace(/_{3,}/g, '');

            } catch (ocrErr) {
                console.error('Tesseract error:', ocrErr.message);
                try {
                    const { data: { text: fallbackText } } = await Tesseract.recognize(filePath, 'eng');
                    text = fallbackText || '';
                } catch (fallbackErr) {
                    console.error('Tesseract fallback error:', fallbackErr.message);
                }
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
            summary: ['summary', 'professional summary', 'profile', 'career objective', 'objective', 'about me', 'personal profile', 'executive summary'],
            skills: ['skills', 'technical skills', 'key skills', 'core competencies', 'technologies', 'tools', 'it skills', 'skills tools', 'skills expertise', 'expertise', 'specializations', 'proficiencies', 'programming languages'],
            experience: ['experience', 'work experience', 'professional experience', 'employment history', 'work history', 'internship', 'internships', 'employment', 'career history', 'experience history', 'organisational experience', 'organizational experience', 'professional background', 'work background'],
            education: ['education', 'academic background', 'academics', 'qualification', 'qualifications', 'academic profile', 'academic details', 'educational background', 'educational details'],
            projects: ['projects', 'academic projects', 'personal projects', 'portfolio', 'key projects', 'featured projects', 'project details'],
            certifications: ['certifications', 'certificates', 'licenses', 'training', 'courses', 'coursework'],
            achievements: ['achievements', 'awards', 'honors', 'accomplishments', 'recognition'],
            languages: ['languages', 'language proficiency', 'languages spoken'],
            extracurricular: ['extracurricular', 'extra curricular', 'extra-curricular', 'extracurricular activities', 'extra curricular activities', 'extra-curricular activities', 'co-curricular activities', 'co curricular activities', 'cocurricular activities', 'activities', 'leadership', 'volunteering', 'volunteer experience', 'community service'],
            interests: ['interests', 'hobbies', 'activities', 'personal interests']
        };

        const headingLookup = Object.entries(sectionMap).flatMap(([section, headings]) =>
            headings.map(heading => ({ section, heading }))
        );

        const normalizeHeading = (line) => line
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\b\d+\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const findHeading = (line) => {
            const normalized = normalizeHeading(line);
            if (normalized.length > 40) return null;
            const compressed = normalized.replace(/\s+/g, '');
            return headingLookup.find(({ heading }) => {
                const headingCompressed = heading.replace(/\s+/g, '');
                return normalized === heading ||
                       normalized.startsWith(`${heading} `) ||
                       normalized.endsWith(` ${heading}`) ||
                       compressed === headingCompressed ||
                       normalized.includes(` ${heading} `);
            });
        };

        const sections = {};
        let currentSection = 'header';
        sections[currentSection] = [];

        const makeSpacedRegex = (headingWord) => {
            const pattern = headingWord
                .split('')
                .map(char => char.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&'))
                .join('\\s*');
            return new RegExp(`\\b${pattern}\\b`, 'i');
        };

        for (const line of lines) {
            let matchedHeading = null;
            let matchedIndex = -1;
            let matchedText = '';
            
            for (const { section, heading } of headingLookup) {
                const regex = makeSpacedRegex(heading);
                const match = line.match(regex);
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

        const sectionText = (section, fallback = 'Not found') => clip(sections[section], 1600) || fallback;
        const emailMatches = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])];
        
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
        const projectLinks = [...new Set(labeledProjectLinks)]
            .map(link => link.replace(/^[([<{]+/, '').replace(/[)\],.;}>]+$/, ''))
            .filter(link => link && isRealUrl(link) && !isFakeLink(link));

        const headerLines = sections.header || lines.slice(0, 8);
        const isValidName = (line) => {
            const trimmed = line.trim();
            if (trimmed.length < 2 || trimmed.length > 50) return false;
            if (/\d/.test(trimmed)) return false;
            
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

        const titleRegex = /^(associate professor|professor|lecturer|principal|director|assistant|head|dean|president|software engineer|developer|manager|consultant|engineer|analyst|designer)$/i;
        if (nameCandidate && (titleRegex.test(nameCandidate) || nameCandidate.toLowerCase().includes('professor') || nameCandidate.toLowerCase().includes('lecturer') || nameCandidate.toLowerCase().includes('principal'))) {
            nameCandidate = null;
        }

        if (!nameCandidate || nameCandidate === 'Not found') {
            const linkedinMatch = linkedin !== 'Not found' ? linkedin.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i) : null;
            if (linkedinMatch && linkedinMatch[1]) {
                nameCandidate = linkedinMatch[1]
                    .replace(/-[0-9a-fA-F]+$/, '')
                    .replace(/[-_]+/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());
            }
        }
        if (!nameCandidate || nameCandidate === 'Not found') {
            const emailMatch = emailMatches[0] ? emailMatches[0].split('@')[0] : null;
            if (emailMatch) {
                nameCandidate = emailMatch
                    .replace(/[0-9]+/g, '')
                    .replace(/[._-_]+/g, ' ')
                    .trim()
                    .replace(/\b\w/g, c => c.toUpperCase());
            }
        }
        if (!nameCandidate || nameCandidate === 'Not found') {
            nameCandidate = originalName
                .replace(/\.[^/.]+$/, '')
                .replace(/resume|cv|file/gi, '')
                .replace(/[-_]+/g, ' ')
                .replace(/([A-Z])/g, ' $1')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/\b\w/g, c => c.toUpperCase());
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

module.exports = {
    extractPdfTextWithLayout,
    parseResume,
    splitText
};
