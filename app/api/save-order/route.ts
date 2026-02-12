
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems } from '@/db/schema';
import { ExtractedOrderData } from '@/lib/parser';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const data: ExtractedOrderData = body;

        if (!data.vpoNumber) {
            return NextResponse.json({ error: 'VPO Number is required' }, { status: 400 });
        }

        // Insert Order
        const [insertedOrder] = await db.insert(orders).values({
            vpoNumber: data.vpoNumber,
            customerName: data.customerName,
            supplierName: data.supplierName,
            orderDate: data.orderDate,
            totalAmount: data.items.reduce((sum, item) => sum + (item.extension || 0), 0).toFixed(2),
            status: 'Confirmed'
        }).returning({ id: orders.id });

        if (!insertedOrder) {
            throw new Error('Failed to insert order');
        }

        // Insert Items
        if (data.items.length > 0) {
            await db.insert(orderItems).values(
                data.items.map(item => ({
                    orderId: insertedOrder.id,
                    productCode: item.productCode,
                    description: item.description,
                    quantity: item.totalQty,
                    unitPrice: item.unitPrice ? item.unitPrice.toString() : '0',
                    total: item.extension ? item.extension.toString() : '0',
                }))
            );
        }

        return NextResponse.json({ success: true, orderId: insertedOrder.id });

    } catch (error: any) {
        console.error('Save Order Error:', error);
        return NextResponse.json(
            { error: `Failed to save order: ${error?.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}
