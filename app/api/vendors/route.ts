import { NextResponse } from 'next/server';
import { db } from '@/db';
import { vendors } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

const createVendorSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    address: z.string().optional().nullable(),
    contactName: z.string().optional().nullable(),
    email: z.string().email('Invalid email').optional().nullable(),
    phone: z.string().optional().nullable(),
});

export async function GET() {
    try {
        const allVendors = await db.select().from(vendors).orderBy(asc(vendors.name));
        return NextResponse.json(allVendors);
    } catch (error) {
        console.error('Failed to fetch vendors:', error);
        return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const result = createVendorSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid data', details: result.error.format() },
                { status: 400 }
            );
        }

        const { name, address, contactName, email, phone } = result.data;

        // Check if vendor already exists to provide a friendly error
        const existing = await db.select().from(vendors).where(eq(vendors.name, name)).limit(1);
        if (existing.length > 0) {
            return NextResponse.json({ error: 'A vendor with this name already exists' }, { status: 409 });
        }

        const [newVendor] = await db
            .insert(vendors)
            .values({ name, address, contactName, email, phone })
            .returning();

        return NextResponse.json(newVendor, { status: 201 });
    } catch (error) {
        console.error('Failed to create vendor:', error);
        return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 });
    }
}
