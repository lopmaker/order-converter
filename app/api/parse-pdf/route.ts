import { NextRequest, NextResponse } from 'next/server';
import PDFParser from 'pdf2json';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60; // Max for Vercel Hobby plan
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    return NextResponse.json({ status: 'ok', message: 'PDF Parser API is running (pdf2json)' });
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200, headers: { 'Allow': 'POST, GET, OPTIONS' } });
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
        const buffer = Buffer.from(arrayBuffer);

        // Parse using pdf2json (Pure JS, no native dependencies)
        const pdfParser = new PDFParser(null, 1); // 1 = text only

        const parsedText = await new Promise<string>((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
            pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
                try {
                    // Extract text from pages -> texts -> R -> T (URI encoded)
                    let fullText = "";
                    if (pdfData && pdfData.Pages) {
                        pdfData.Pages.forEach((page: any) => {
                            if (page.Texts) {
                                page.Texts.forEach((textItem: any) => {
                                    if (textItem.R && textItem.R.length > 0) {
                                        // Decode URI component (pdf2json encodes text)
                                        fullText += decodeURIComponent(textItem.R[0].T) + " ";
                                    }
                                });
                                fullText += "\n\n"; // Page break
                            }
                        });
                    }
                    resolve(fullText);
                } catch (e) {
                    reject(e);
                }
            });

            pdfParser.parseBuffer(buffer);
        });

        // Basic pages info mock (pdf2json focuses on text/json structure)
        // If we needed page count, we'd inspect pdfData.Pages.length

        return NextResponse.json({
            text: parsedText,
            pages: [], // pdf2json structure is different, we just need text for AI
            numpages: 0,
            info: {},
            tables: [],
        });

    } catch (error: any) {
        console.error('PDF Parse Error:', error);
        return NextResponse.json(
            { error: `Failed to parse PDF: ${error?.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}
