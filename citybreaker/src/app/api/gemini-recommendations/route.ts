// File: src/app/api/gemini-recommendations/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit/js/pdfkit.standalone';
import { getMarkdown } from '@/lib/gemini';

/** Build PDF from markdown */
async function buildPDF(
  markdown: string,
  tripLength: number,
  cityName: string
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  // Header
  doc.fontSize(20)
     .text(`Itinerary: ${cityName}`, { align: 'center' })
     .moveDown();

  // Days: split off each "### Day N: Title" block
  markdown.split('###').slice(1).forEach((blk, i) => {
    if (i > 0) doc.addPage();
    const lines = blk.trim().split('\n');
    const heading = lines.shift()!.replace(/\[.*\]/, '').trim();
    doc.fontSize(16)
       .text(`Day ${i + 1}: ${heading}`)
       .moveDown();
    lines.forEach((l) => doc.text(`• ${l.replace(/^[*-]\s*/, '')}`));
    doc.moveDown();
  });

  doc.end();
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  const { places = [], tripLength = 3, cityName = 'CityBreaker' } = await req.json();

  if (!Array.isArray(places) || places.length === 0) {
    return NextResponse.json({ error: 'places array required' }, { status: 400 });
  }

  // Constrain days between 3 and 7
  const days = Math.min(Math.max(tripLength, 3), 7);

  // Generate markdown via shared Gemini helper
  const markdown = await getMarkdown(places, days, cityName);

  // Build PDF buffer
  const pdfBuffer = await buildPDF(markdown, days, cityName);

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${cityName.replace(
        /\s+/g,
        '_'
      )}_${days}d_Itinerary.pdf"`,
    },
  });
}
