import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
      "unitPrice": number,
      "totalQty": number,
      "extension": number,
      "sizeBreakdown": {"size_label": quantity} 
    }
  ]
}

IMPORTANT RULES:
1. Extract ALL line items across ALL pages. Do NOT duplicate items that appear on different pages because of repeated headers.
2. For assortment items (marked with *Assortment Detail), these are sub-items of a parent product. List each sub-item separately with the parent's price info.
3. Size breakdown should map size labels (XS, S, M, L, XL, 2XL, 3XL, 2T, 3T, 4T, 5, 6, 7, etc.) to their quantities.
4. If a field is not found, use null for strings and 0 for numbers.
5. Prices are typically per unit ("Ea").
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

        const body = await req.json();
        const { text } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json(
                { error: 'No text provided for AI parsing' },
                { status: 400 }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        // Model fallback strategy: Using latest model names
        // Strictly using 2.5 and 3.0 series per user instruction.
        const MODELS = ['gemini-3-flash', 'gemini-3-pro', 'gemini-2.5-flash', 'gemini-2.5-pro'];
        let result;
        let lastError;

        for (const modelName of MODELS) {
            try {
                // simple retry logic per model
                let retries = 2; // 2 retries per model
                let delay = 1000;
                const model = genAI.getGenerativeModel({ model: modelName });

                while (retries >= 0) {
                    try {
                        console.log(`Attempting with model: ${modelName}`);
                        result = await model.generateContent([SYSTEM_PROMPT, `Here is the raw text extracted from a VPO PDF. Parse it and return the structured JSON:\n\n${text}`]);
                        break; // Success
                    } catch (error: any) {
                        if (error.response?.status === 429 || error.message?.includes('429')) {
                            if (retries === 0) throw error;
                            console.log(`Gemini API 429 hit on ${modelName}. Retrying in ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            delay *= 2;
                            retries--;
                        } else {
                            throw error; // Fatal error for this model attempt
                        }
                    }
                }

                if (result) break; // If successful, stop trying other models

            } catch (error: any) {
                console.warn(`Model ${modelName} failed:`, error.message);
                lastError = error;
                // Continue to next model
            }
        }

        if (!result) {
            console.error("All models failed. Last error:", lastError);
            throw lastError || new Error('Failed to get response from Gemini API after trying all models');
        }

        const response = result.response;
        const responseText = response.text();

        // Try to parse the JSON from the response
        let parsed;
        try {
            // Remove potential markdown code fences
            const cleaned = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            parsed = JSON.parse(cleaned);
        } catch (parseError) {
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
    } catch (error: any) {
        console.error('AI Parse Error:', error);
        return NextResponse.json(
            { error: `AI parsing failed: ${error?.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}
