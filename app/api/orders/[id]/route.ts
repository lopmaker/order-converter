
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq } from 'drizzle-orm';

// DELETE: Remove an order
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

        await db.delete(orders).where(eq(orders.id, id));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Delete Order Error:', error);
        return NextResponse.json(
            { error: `Failed to delete order: ${error?.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}

// PATCH: Update status
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { status } = body;

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        if (!status) return NextResponse.json({ error: 'Status is required' }, { status: 400 });

        await db.update(orders)
            .set({ status })
            .where(eq(orders.id, id));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Update Order Error:', error);
        return NextResponse.json(
            { error: `Failed to update order: ${error?.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}
