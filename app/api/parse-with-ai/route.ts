import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getErrorMessage } from '@/lib/api-helpers';

export const maxDuration = 60; // Max for Vercel Hobby plan

const SYSTEM_PROMPT = `You are a purchase order data extraction assistant. You receive raw text extracted from a Vendor Purchase Order (VPO) PDF and must return a structured JSON object.

The VPOs typically come from C-Life Group's ERP system. They are multi-page documents with repeated headers on each page. Extract the data from ALL pages and deduplicate.

Return ONLY valid JSON with this exact structure (no markdown, no code fences, just raw JSON):

{
  "vpoNumber": "string - the VPO document number, e.g. VPO-1138183",
  "orderDate": "string - order date, e.g. 3/3/2025",
  "expShipDate": "string - expected ship date",
  "cancelDate": "string or null - R Whs Date (Received to Warehouse / ETW / Estimated to Warehouse) or Cancel Date",
  "soReference": "string - SO reference number, e.g. So-1558761",
  "customerName": "string - the buying company, usually C-Life Group, Ltd.",
  "customerAddress": "string - buyer address",
  "supplierName": "string - the factory/supplier name",
  "supplierAddress": "string - supplier full address",
  "shipTo": "string - ship-to address (may be different from supplier)",
  "shipVia": "string - shipping method, e.g. Ocean Frt",
  "shipmentTerms": "string - e.g. Free On Board, Delivered Duty Paid",
  "paymentTerms": "string - e.g. Net 7 ROG, Net 30 Days ROG",
  "agent": "string - agent code, e.g. MJR, MJI, MJHK",
  "customerNotes": "string - Full text of the 'Notes' or 'Special Instructions' section. Include all lines like 'Customer:', 'Testing:', 'Packing:', 'Additional Information'. Preserve newlines.",
  "items": [
    {
      "productCode": "string - product code, e.g. 7VND2A6805TY",
      "description": "string - product description/name",
      "productClass": "string - e.g. R - Licensed",
      "collection": "string - e.g. Junior, Kids Mix",
      "material": "string - fabric composition",
      "color": "string - color name",
      "unitPrice": "string - unit price (e.g. '2.75')",
      "totalQty": number,
      "extension": "string - total value (e.g. '16,533.00')",
      "sizeBreakdown": {"size_label": quantity} 
    }
  ]
}

IMPORTANT RULES:
1. Extract ALL line items across ALL pages. Do NOT duplicate items that appear on different pages because of repeated headers.
2. For assortment items (marked with *Assortment Detail), these are sub-items of a parent product. List each sub-item separately with the parent's price info.
3. Size breakdown should map size labels (XS, S, M, L, XL, 2XL, 3XL, 2T, 3T, 4T, 5, 6, 7, etc.) to their quantities.
4. If a field is not found, use null for strings and 0 for numbers.
5. Prices (unitPrice, extension) MUST be strings. Remove currency symbols ($) but keep commas and decimals if present.
7. The "extension" is usually unitPrice × totalQty.
8. **IMPORTANT**: Capture the 'Notes:' or 'Special Instructions' section into 'customerNotes'. 
   - **EXCLUDE**: Standard legal disclaimers, forced labor warnings (e.g., Uzbekistan, Turkmenistan, XUAR), or "contracting terms" that are normally part of the generic PO footer.
   - **INCLUDE**: Specific operational notes like 'Customer: [Name]', 'Testing: [Requirements]', 'Packing: [Method]', or any unique 'Additional Information'. 
   - Preserve original formatting and newlines for the included parts.`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GOOGLE_API_KEY_HERE') {
      return NextResponse.json(
        { error: 'Google API Key not configured. Please set GOOGLE_API_KEY in .env.local' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as { text?: unknown };
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'No text provided for AI parsing' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Model fallback strategy: Using latest model names
    // Strictly using 2.5 and 3.0 series per user instruction.
    const MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
    let result: { response: { text: () => string } } | null = null;
    let lastError: unknown;

    for (const modelName of MODELS) {
      try {
        let retries = 2;
        let delay = 1000;
        const model = genAI.getGenerativeModel({ model: modelName });

        while (retries >= 0) {
          try {
            result = await model.generateContent([
              SYSTEM_PROMPT,
              `Here is the raw text extracted from a VPO PDF. Parse it and return the structured JSON:\n\n${text}`,
            ]);
            break;
          } catch (error: unknown) {
            const message = getErrorMessage(error);
            const status =
              typeof error === 'object' && error !== null && 'response' in error
                ? (error as { response?: { status?: number } }).response?.status
                : undefined;

            if (status === 429 || message.includes('429')) {
              if (retries === 0) throw error;
              await new Promise((resolve) => setTimeout(resolve, delay));
              delay *= 2;
              retries--;
            } else {
              throw error;
            }
          }
        }

        if (result) break;
      } catch (error: unknown) {
        console.warn(`Model ${modelName} failed:`, getErrorMessage(error));
        lastError = error;
      }
    }

    if (!result) {
      console.error('All models failed. Last error:', lastError);
      throw (
        lastError ?? new Error('Failed to get response from Gemini API after trying all models')
      );
    }

    const responseText = result.response.text();

    let parsed: unknown;
    try {
      const cleaned = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse AI response as JSON:', responseText);
      return NextResponse.json(
        { error: 'AI returned invalid JSON. Raw response saved.', rawResponse: responseText },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (error: unknown) {
    console.error('AI Parse Error:', error);
    return NextResponse.json(
      { error: `AI parsing failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
