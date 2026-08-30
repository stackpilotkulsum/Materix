const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVodGR3YXRjdGZpcXpyemNwem1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzUxOTMsImV4cCI6MjA5NTAxMTE5M30.Z-I3avq19VwWpxgqnmVYaEojoJ8dSnFFAgqZs6OH-YE';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uhtdwatctfiqzrzcpzmf.supabase.co';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const fs = require('fs');
const path = require('path');

const extractPdfTextWithLayout = async (dataBuffer) => {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(dataBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';
    console.log("PDF loaded. Total pages:", pdf.numPages);

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const items = textContent.items;
        console.log(`Page ${i}: fetched ${items.length} items`);

        if (items.length === 0) continue;

        // 1. Filter out empty items and spaces
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

        // Find min and max X coordinates
        const xCoords = validItems.map(item => item.x);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        const width = maxX - minX;

        console.log(`Page ${i}: width range: [${minX.toFixed(2)}, ${maxX.toFixed(2)}], total items: ${validItems.length}`);

        // 2. Column detection.
        // We'll partition the page width range into 10 bins.
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

        console.log(`Page ${i} Bin Counts:`, bins);

        // Check if there is a gutter in the middle (bins 3, 4, 5, or 6) that is mostly empty,
        // while the left (bins 0, 1, 2) and right (bins 7, 8, 9) are populated.
        // Let's identify the bin with the minimum count in the middle region [binCount*0.3, binCount*0.7]
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

        // We determine a two-column layout if:
        // - There is a bin in the middle region that has very few items (e.g. < 5% of total items or < 10 items)
        // - The sum of items on the left is substantial (> 15% of total)
        // - The sum of items on the right is substantial (> 15% of total)
        const totalItems = validItems.length;
        const leftCount = bins.slice(0, minMidBinIdx).reduce((a, b) => a + b, 0);
        const rightCount = bins.slice(minMidBinIdx + 1).reduce((a, b) => a + b, 0);

        const isTwoColumn = (minMidBinVal < totalItems * 0.08 || minMidBinVal <= 5) && 
                            (leftCount > totalItems * 0.2) && 
                            (rightCount > totalItems * 0.2);

        let pageText = '';

        if (isTwoColumn) {
            const splitX = minX + (minMidBinIdx + 0.5) * binWidth;
            console.log(`Page ${i}: Detected 2-column layout. Gutter split X: ${splitX.toFixed(2)}`);

            const leftItems = validItems.filter(item => item.x < splitX);
            const rightItems = validItems.filter(item => item.x >= splitX);

            const readColumn = (colItems) => {
                // Group items into lines by Y coordinate (descending).
                // We'll group items whose Y difference is small (e.g., < 4 units).
                const lines = [];
                // Sort by Y descending first
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

                // Sort lines by Y descending (already done, but sort again to be sure)
                lines.sort((a, b) => b.y - a.y);

                // Sort items within each line by X ascending
                lines.forEach(line => {
                    line.items.sort((a, b) => a.x - b.x);
                });

                // Join lines
                return lines
                    .map(line => line.items.map(item => item.text).join(' '))
                    .join('\n');
            };

            const leftText = readColumn(leftItems);
            const rightText = readColumn(rightItems);

            pageText = `${leftText}\n\n${rightText}`;
        } else {
            console.log(`Page ${i}: Detected single-column layout.`);
            // Group all items into lines
            const lines = [];
            validItems.sort((a, b) => b.y - a.y);

            validItems.forEach(item => {
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

            pageText = lines
                .map(line => line.items.map(item => item.text).join(' '))
                .join('\n');
        }

        fullText += pageText + '\n\n';
    }

    return fullText.trim();
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
        console.log("Downloading file:", file.original_name, "Url:", file.file_url);
        const response = await fetch(file.file_url);
        if (!response.ok) {
            console.error("Failed to download file:", response.statusText);
            return;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const dataBuffer = Buffer.from(arrayBuffer);
        
        console.log("Parsing PDF using layout-aware extractor...");
        try {
            const text = await extractPdfTextWithLayout(dataBuffer);
            console.log("\n--- EXTRACTED TEXT ---");
            console.log("Extracted text length:", text.length);
            console.log(text.substring(0, 1500));
            console.log("...");
        } catch (parseErr) {
            console.error("Layout parse error:", parseErr);
        }
    } catch (e) {
        console.error("Outer run error:", e);
    }
}

run();
