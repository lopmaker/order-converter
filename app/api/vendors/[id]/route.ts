import { NextResponse } from 'next/server';
import { db } from '@/db';
import { vendors } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

type RouteContext = { params: Promise<{ id: string }> };

const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  email: z
    .string()
    .email()
    .or(z.literal(''))
    .nullable()
    .optional(),
  phone: z.string().nullable().optional(),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 });

    const body = await req.json();
    const parsed = updateVendorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updateData: Partial<typeof vendors.$inferInsert> = {};
    const { name, address, contactName, email, phone } = parsed.data;

    if (name !== undefined) updateData.name = name.trim();
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (contactName !== undefined) updateData.contactName = contactName?.trim() || null;
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const [updated] = await db
      .update(vendors)
      .set(updateData)
      .where(eq(vendors.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    // Postgres unique-violation for vendors.name
    const message = getErrorMessage(error);
    if (message.includes('unique') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'A vendor with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 });

    const [deleted] = await db.delete(vendors).where(eq(vendors.id, id)).returning();
    if (!deleted) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
