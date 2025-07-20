// Ensure the runtime is set correctly for your Next.js environment
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer'; // Import Puppeteer
import { getMarkdown } from '@/lib/gemini'; // Assuming this is your markdown generation utility
import { Storage } from '@google-cloud/storage';
import fs from 'fs'; // Used for checking file existence
import path from 'path';

const BUCKET_NAME = 'citybreaker-downloads';
const storage = new Storage();

// Define font directory and logo path relative to the project root
const fontDir = path.join(process.cwd(), 'public', 'fonts');
const logoPath = path.join(process.cwd(), 'public', 'logo', 'citybreaker.png');

// Helper function to create a filename for the PDF
function createFilename(cityName: string, tripLength: number): string {
  return `${cityName.replace(/\s+/g, '_')}_${tripLength}d_Itinerary.pdf`;
}

// Function to upload PDF buffer to Google Cloud Storage
async function uploadPdfToGCS(buffer: Buffer, filename: string, sessionId: string): Promise<string> {
  const destination = `sessions/${sessionId}/${filename}`;
  const file = storage.bucket(BUCKET_NAME).file(destination);

  await file.save(buffer, {
    contentType: 'application/pdf',
    resumable: false,
  });

  // Get a signed URL for the uploaded file
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: new Date(Date.now() + 60 * 60 * 1000), // URL valid for 1 hour
  });
  return url;
}

// Helper to get the correct file URL for fonts/assets
function getFileUrl(fileName: string): string {
    const filePath = path.join(fontDir, fileName);
    // Convert to URL format, ensuring forward slashes for cross-platform compatibility
    const url = `file://${filePath.replace(/\\/g, '/')}`;
    // Basic check if file exists, log warning if not found but proceed
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Font file not found at expected path: ${filePath}. Font might not render correctly.`);
    }
    return url;
}


// Function to build the HTML content for the PDF
function buildHtmlContent(
    markdownContent: string,
    places: { name: string; photoUrl?: string }[],
    tripLength: number,
    cityName: string
): string {

    let dailySectionsHtml = '';
    const dayBlocks = markdownContent.split('###').slice(1); // Split by day headings

    if (dayBlocks.length === 0) {
        dailySectionsHtml = '<div class="day-section"><p>No itinerary details found for this trip.</p></div>';
    } else {
        for (const [i, block] of dayBlocks.entries()) {
            const lines = block.trim().split('\n');
            const headingRaw = lines.shift() || ''; // Get the first line as heading
            const heading = headingRaw.replace(/\[.*\]/, '').trim(); // Remove any bracketed text
            const photoSuggestion = headingRaw.match(/\[PHOTO_SUGGESTION: "([^"]+)"\]/)?.[1]; // Extract photo name
            // Find the place object for the photo suggestion (case-insensitive)
            const placeForPhoto = photoSuggestion ? places.find(p => p.name.toLowerCase() === photoSuggestion.toLowerCase()) : undefined;
            const photoUrl = placeForPhoto?.photoUrl; // Get the actual photo URL

            let imageHtml = '';
            if (photoUrl) {
                // Use onerror to display a fallback message if image fails to load
                imageHtml = `
                    <img src="${photoUrl}" alt="Suggested photo for ${heading}" class="itinerary-image" onerror="this.onerror=null; this.outerHTML='<div class=\'image-placeholder\'>Failed to load image for ${photoSuggestion || 'this day'}</div>'">
                `;
            } else if (photoSuggestion) {
                 // Display a placeholder if a suggestion was made but no URL is found
                 imageHtml = `<div class="image-placeholder">Suggested photo: "${photoSuggestion}" not available.</div>`;
            }

            // Map markdown list items to HTML list items
            const listItemsHtml = lines
                .map(line => {
                    const cleanLine = line.replace(/^[*-]\s*/, '').trim(); // Remove list markers
                    return cleanLine ? `<li>${cleanLine}</li>` : ''; // Create list item, skip empty ones
                })
                .filter(Boolean) // Remove any empty list items
                .join('');

            // Construct the HTML for each day
            dailySectionsHtml += `
                <div class="day-section ${i > 0 ? 'page-break' : ''}">
                    <h2 class="day-title">Day ${i + 1}: ${heading}</h2>
                    ${imageHtml}
                    <ul class="itinerary-list">
                        ${listItemsHtml}
                    </ul>
                </div>
            `;
        }
    }

    // Construct the final HTML document
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Trip Itinerary</title>
        <style>
            /* Font Definitions */
            @font-face { font-family: 'RobotoSerif'; src: url('${getFileUrl('RobotoSerif-Regular.ttf')}') format('truetype'); font-weight: normal; font-style: normal; }
            @font-face { font-family: 'RobotoSerif-Bold'; src: url('${getFileUrl('RobotoSerif-Bold.ttf')}') format('truetype'); font-weight: bold; font-style: normal; }
            @font-face { font-family: 'Roboto-Regular'; src: url('${getFileUrl('Roboto-Regular.ttf')}') format('truetype'); font-weight: normal; font-style: normal; }
            @font-face { font-family: 'RobotoCondensed-Bold'; src: url('${getFileUrl('Roboto_Condensed-Bold.ttf')}') format('truetype'); font-weight: bold; font-style: normal; }

            /* Base Styles */
            body { margin: 0; padding: 0; font-family: 'RobotoSerif', sans-serif; line-height: 1.6; color: #374151; font-size: 12px; }
            .page-container { margin: 50px; } /* Content margin */

            /* Header Styles */
            .header { position: relative; margin-bottom: 40px; }
            .logo { position: absolute; top: 0; right: 0; width: 90px; height: auto; }
            .main-title {
                font-family: 'RobotoCondensed-Bold', sans-serif;
                font-size: 28px;
                color: #1f2937;
                margin: 0;
                padding-right: 120px; /* Make space for the logo */
                text-align: left;
            }

            /* Daily Section Styles */
            .day-section {
                margin-bottom: 30px;
                page-break-inside: avoid; /* Try to keep content of a day together */
            }
            .day-title {
                font-family: 'RobotoSerif-Bold', sans-serif;
                font-size: 20px;
                color: #111827;
                text-decoration: underline;
                margin-bottom: 15px;
            }

            /* Image Styles */
            .itinerary-image {
                display: block; /* Center the image */
                margin: 0 auto 20px auto;
                max-width: 100%; /* Ensure image fits within page width */
                height: auto; /* Maintain aspect ratio */
                max-height: 300px; /* Limit image height if needed */
                object-fit: cover; /* Crop if aspect ratio doesn't match container */
            }
            .image-placeholder {
                display: block;
                margin: 0 auto 20px auto;
                text-align: center;
                color: #F87171; /* Reddish color for error */
                font-style: italic;
                font-size: 10px;
                padding: 10px;
                border: 1px dashed #F87171;
                border-radius: 4px;
            }

            /* List Styles */
            .itinerary-list {
                padding-left: 20px; /* Indent list items */
            }
            .itinerary-list li {
                margin-bottom: 8px;
            }

            /* Page Break */
            .page-break {
                page-break-before: always;
            }
        </style>
    </head>
    <body>
        <div class="page-container">
            <div class="header">
                ${fs.existsSync(logoPath) ? `<img src="file://${logoPath.replace(/\\/g, '/')}" alt="CityBreaker Logo" class="logo">` : ''}
                <h1 class="main-title">Your ${tripLength}-Day ${cityName} Adventure</h1>
            </div>
            ${dailySectionsHtml}
        </div>
    </body>
    </html>
    `;
}

// Function to generate PDF using Puppeteer
async function generatePdfWithPuppeteer(
    places: { name: string; photoUrl?: string }[],
    tripLength: number,
    cityName: string,
    markdownContent: string
): Promise<Buffer> {

    let browser = null; // Initialize browser to null
    try {
        // Launch Puppeteer. Consider args for production environments.
        browser = await puppeteer.launch({
            headless: 'new', // Use new headless mode
            args: [
                '--no-sandbox', // Required for some environments like Docker
                '--disable-setuid-sandbox', // Required for some environments
                '--disable-gpu', // May help in some environments
                '--disable-dev-shm-usage', // Prevents crashing due to limited shared memory
                `--font-render-hinting=none` // Can help with font rendering consistency
            ],
        });
        const page = await browser.newPage();

        // Generate HTML content from markdown and places data
        const htmlContent = buildHtmlContent(markdownContent, places, tripLength, cityName);

        // Set the HTML content for the page
        await page.setContent(htmlContent, {
            waitUntil: 'networkidle0', // Wait until network connections are idle
            timeout: 60000 // Increase timeout for potential image loading
        });

        // Generate PDF from the page
        const pdfBuffer = await page.pdf({
            format: 'A4', // Standard paper size
            printBackground: true, // Crucial to render styles and images
            margin: { // Margins can also be controlled here if CSS isn't enough, but CSS is preferred for layout
                top: '0px',
                right: '0px',
                bottom: '0px',
                left: '0px',
            },
            scale: 1, // Default scale
            displayHeaderFooter: false, // We're using HTML for header/footer
            preferCSSPageSize: true, // Use CSS page size if defined
        });

        return pdfBuffer;

    } catch (error) {
        console.error('Error generating PDF with Puppeteer:', error);
        throw error; // Re-throw the error to be caught by the caller
    } finally {
        // Close the browser instance to free up resources
        if (browser) {
            await browser.close();
        }
    }
}

// POST endpoint handler for generating and serving/uploading PDFs
export async function POST(req: NextRequest) {
    let body;
    try {
        body = await req.json();
    } catch (error) {
        console.error('Failed to parse request body:', error);
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { places = [], tripLength = 3, cityName = 'CityBreaker', sessionId } = body;

    // Input validation
    if (!Array.isArray(places) || places.length === 0) {
        return NextResponse.json({ error: 'A non-empty "places" array is required.' }, { status: 400 });
    }
    if (typeof cityName !== 'string' || cityName.trim() === '') {
        return NextResponse.json({ error: 'A valid "cityName" is required.' }, { status: 400 });
    }
    if (typeof tripLength !== 'number' || tripLength < 1) {
        return NextResponse.json({ error: '"tripLength" must be a positive number.' }, { status: 400 });
    }

    // Sanitize tripLength to a reasonable range (e.g., 1 to 7 days)
    const days = Math.min(Math.max(tripLength, 1), 7);

    // Generate markdown content
    let markdownContent;
    try {
        markdownContent = await getMarkdown(places, days, cityName);
    } catch (error) {
        console.error('Error generating markdown:', error);
        return NextResponse.json({ error: 'Failed to generate itinerary details.' }, { status: 500 });
    }

    // Generate PDF buffer using Puppeteer
    let pdfBuffer;
    try {
        pdfBuffer = await generatePdfWithPuppeteer(places, days, cityName, markdownContent);
    } catch (error) {
        console.error('Error generating PDF:', error);
        return NextResponse.json({ error: 'Failed to create PDF document.' }, { status: 500 });
    }

    const filename = createFilename(cityName, days);

    // If sessionId is provided, upload to GCS
    if (sessionId) {
        try {
            const url = await uploadPdfToGCS(pdfBuffer, filename, sessionId);
            return NextResponse.json({ url });
        } catch (err) {
            console.error('Upload to GCS failed:', err);
            return NextResponse.json({ error: 'Failed to upload PDF to cloud storage.' }, { status: 500 });
        }
    } else {
        // If no sessionId, return the PDF directly as a download
        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`, // Suggests download filename
            },
        });
    }
}