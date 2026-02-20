import { db } from '@/db';
import { containerAllocations, containers, shippingDocuments } from '@/db/schema';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';
import {
    containerSchema,
    allocateContainerSchema,
    shippingDocSchema,
} from '@/lib/schemas';
import { z } from 'zod';

function createDefaultCode(prefix: string): string {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, '')
        .slice(0, 14);
    return `${prefix}-${stamp}`;
}

export async function createContainer(data: z.infer<typeof containerSchema>) {
    const [saved] = await db
        .insert(containers)
        .values({
            containerNo: data.containerNo.trim(),
            vesselName: data.vesselName?.trim() || null,
            status: data.status || 'PLANNED',
            etd: data.etd || null,
            eta: data.eta || null,
            atd: data.atd || null,
            ata: data.ata || null,
            arrivalAtWarehouse: data.arrivalAtWarehouse || null,
        })
        .returning();

    return saved;
}

export async function createContainerAllocation(data: z.infer<typeof allocateContainerSchema>) {
    const [saved] = await db
        .insert(containerAllocations)
        .values({
            containerId: data.containerId,
            orderId: data.orderId,
            orderItemId: data.orderItemId || null,
            allocatedQty: data.allocatedQty !== undefined ? data.allocatedQty : null,
            allocatedAmount: data.allocatedAmount !== undefined && data.allocatedAmount !== null ? data.allocatedAmount.toFixed(2) : null,
            notes: data.notes || null,
        })
        .returning();

    await recomputeOrderWorkflowStatus(data.orderId);

    return saved;
}

export async function createShippingDoc(
    data: z.infer<typeof shippingDocSchema> & { issueDate?: string | Date | null }
) {
    const [saved] = await db
        .insert(shippingDocuments)
        .values({
            orderId: data.orderId,
            containerId: data.containerId || null,
            docNo: data.docNo?.trim() || createDefaultCode('SD'),
            issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
            status: data.status || 'DRAFT',
            payload: data.payload || null,
        })
        .returning();

    return saved;
}
