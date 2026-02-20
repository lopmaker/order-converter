import { NextRequest, NextResponse } from 'next/server';
import { saveOrderSchema } from '@/lib/schemas';
import { createOrderFromExtraction } from '@/services/order.service';
import { z } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Zod Validation
    const parsedData = saveOrderSchema.parse(body);

    // 2. Main Logic Execution via Service Layer
    const result = await createOrderFromExtraction(parsedData);

    // 3. Response
    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      totals: result.totals,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      // 400 Bad Request for validation failures
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Save Order Error:', error);
    // 500 Internal Server Error for execution failures
    return NextResponse.json({ error: `Failed to save order: ${message}` }, { status: 500 });
  }
}
