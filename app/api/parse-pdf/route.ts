import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';

// NOTE: We are NOT setting worker manually. Relying on default behavior + runtime='nodejs'
// const workerPath = path.resolve(process.cwd(), 'node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs');
// PDFParse.setWorker(workerPath);

export const maxDuration = 60; // Max for Vercel Hobby plan
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Ensure Node.js runtime (not Edge)

export async function GET() {
    return NextResponse.json({ status: 'ok', message: 'PDF Parser API is running (pdf-parse v2)' });
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200, headers: { 'Allow': 'POST, GET, OPTIONS' } });
}

export async function POST(req: NextRequest) {
    console.log("PDF Parse: Processing started...");
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        console.log(`PDF Parse: File received: ${file.name} (${file.size} bytes)`);

        if (file.type !== 'application/pdf') {
            return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const buffer = Buffer.from(uint8); // pdf-parse prefers Buffer

        console.log("PDF Parse: buffer created, starting parser...");

        // Standard pdf-parse usage
        const data = await PDFParse(buffer);

        console.log("PDF Parse: Success!");
        console.log(`PDF Parse: Pages: ${data.numpages}, Info: ${JSON.stringify(data.info)}`);
        console.log(`PDF Parse: Text Length: ${data.text?.length}`);

        // Debug: Log first 100 chars
        if (data.text) {
            console.log(`PDF Parse: Preview: ${data.text.substring(0, 100)}...`);
        } else {
            console.warn("PDF Parse WARNING: Extracted text is empty or null");
        }

        return NextResponse.json({
            text: data.text || "",
            pages: [], // pdf-parse doesn't return per-page text easily in default mode without deeper config, but main text is what we need
            numpages: data.numpages,
            info: data.info,
            tables: [],
        });

    } catch (error: any) {
        console.error('PDF Parse Error (Full):', error);
        return NextResponse.json(
            { error: `Failed to parse PDF: ${error?.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}
