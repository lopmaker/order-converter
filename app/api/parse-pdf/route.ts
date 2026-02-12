import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
import path from 'path';

// Fix for "Setting up fake worker failed" in Next.js
const workerPath = path.resolve(process.cwd(), 'node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs');
PDFParse.setWorker(workerPath);

export const maxDuration = 60; // Max for Vercel Hobby plan
export const dynamic = 'force-dynamic'; // Prevent static generation

export async function GET() {
    return NextResponse.json({ status: 'ok', message: 'PDF Parser API is running' });
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.type !== 'application/pdf') {
            return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        const parser = new PDFParse({
            data: uint8,
            verbosity: 0,
        });

        // Extract text
        const textResult = await parser.getText();

        // Extract info/metadata
        let info = null;
        try {
            const infoResult = await parser.getInfo();
            info = infoResult.info;
        } catch {
            // Metadata extraction is optional
        }

        // Try to extract tables (useful for structured orders)
        let tables: any[] = [];
        try {
            const tableResult = await parser.getTable();
            tables = tableResult.pages.map(p => ({
                pageNum: p.num,
                tables: p.tables,
            }));
        } catch {
            // Table extraction is optional
        }

        await parser.destroy();

        return NextResponse.json({
            text: textResult.text,
            pages: textResult.pages,
            numpages: textResult.total,
            info,
            tables,
        });
    } catch (error: any) {
        console.error('PDF Parse Error:', error);
        return NextResponse.json(
            { error: `Failed to parse PDF: ${error?.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}
