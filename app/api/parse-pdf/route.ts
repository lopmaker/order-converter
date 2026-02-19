import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { getErrorMessage } from '@/lib/api-helpers';
import { pdfParseRateLimiter } from '@/lib/rate-limiter'; // Import the rate limiter

let parserInitPromise: Promise<void> | null = null;

async function initParserRuntime() {
  if (parserInitPromise) return parserInitPromise;

  parserInitPromise = (async () => {
    // Polyfill DOMMatrix for PDF.js in Node.js environment.
    if (typeof globalThis.DOMMatrix === 'undefined') {
      try {
        const domMatrixModule = await import('dommatrix');
        const domMatrixCtor = (domMatrixModule as { default?: unknown }).default;

        if (typeof domMatrixCtor === 'function') {
          globalThis.DOMMatrix = domMatrixCtor as unknown as typeof DOMMatrix;
        }
      } catch (error: unknown) {
        console.warn('Failed to polyfill DOMMatrix', error);
      }
    }

    // Ensure Canvas is available for PDF.js.
    try {
      await import('@napi-rs/canvas');
    } catch (error: unknown) {
      console.warn('Failed to load @napi-rs/canvas', error);
    }

    // Point worker to installed module path.
    const workerPath = path.resolve(
      process.cwd(),
      'node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs'
    );
    PDFParse.setWorker(workerPath);
  })();

  return parserInitPromise;
}

export const maxDuration = 60; // Max for Vercel Hobby plan
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Ensure Node.js runtime (not Edge)

export async function GET() {
  await initParserRuntime();
  return NextResponse.json({ status: 'ok', message: 'PDF Parser API is running (pdf-parse v2)' });
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: { Allow: 'POST, GET, OPTIONS' } });
}

export async function POST(req: NextRequest) {
  // Get client IP for rate limiting
  const ip = (req as any).ip || req.headers.get('x-forwarded-for') || 'anonymous';

  // Check rate limit
  if (!pdfParseRateLimiter.check(ip)) {
    const retryAfter = pdfParseRateLimiter.getResetTime(ip);
    return new NextResponse(JSON.stringify({
      error: `Too many requests. Please try again after ${retryAfter} seconds.`,
      retryAfter: retryAfter,
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': pdfParseRateLimiter['options'].maxRequests.toString(),
        'X-RateLimit-Remaining': pdfParseRateLimiter.getRemaining(ip).toString(),
        'X-RateLimit-Reset': retryAfter.toString(),
        'Retry-After': retryAfter.toString(),
      },
    });
  }

  try {
    await initParserRuntime();

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
    const buffer = Buffer.from(uint8);

    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo();

    if (!textResult.text) {
      console.warn('PDF Parse WARNING: Extracted text is empty or null');
    }

    return NextResponse.json({
      text: textResult.text || '',
      pages: [],
      numpages: infoResult.total,
      info: infoResult.info,
      tables: [],
    });
  } catch (error: unknown) {
    console.error('PDF Parse Error (Full):', error);

    let errorMessage = getErrorMessage(error);
    if (errorMessage.includes('Invalid PDF structure')) {
      errorMessage =
        'Failed to parse PDF: Invalid PDF structure. The file may be corrupted, encrypted, or not a valid PDF.';
    } else if (errorMessage.includes('PasswordException')) {
      errorMessage = 'Failed to parse PDF: The file is password protected.';
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
