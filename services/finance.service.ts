import { db } from '@/db';
import {
    commercialInvoices,
    containers,
    logisticsBills,
    orderItems,
    orders,
    payments,
    vendorBills,
} from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { addDays, parseDecimalInput, round2 } from '@/lib/workflow';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';
import {
    commercialInvoiceSchema,
    logisticsBillSchema,
    paymentSchema,
    vendorBillSchema,
} from '@/lib/schemas';
import { z } from 'zod';

function createDefaultCode(prefix: string): string {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, '')
        .slice(0, 14);
    return `${prefix}-${stamp}`;
}

export type PaymentTargetType = 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL';

export async function refreshBillStatus(
    targetType: PaymentTargetType,
    targetId: string
): Promise<string | null> {
    const paidRows = await db
        .select({ amount: payments.amount })
        .from(payments)
        .where(and(eq(payments.targetType, targetType), eq(payments.targetId, targetId)));

    const paidAmount = round2(
        paidRows.reduce((sum, row) => sum + parseDecimalInput(row.amount, 0), 0)
    );

    if (targetType === 'CUSTOMER_INVOICE') {
        const invoice = await db.query.commercialInvoices.findFirst({
            where: eq(commercialInvoices.id, targetId),
        });
        if (!invoice) return null;
        const dueAmount = parseDecimalInput(invoice.amount, 0);
        const status = paidAmount >= dueAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'OPEN';
        await db.update(commercialInvoices).set({ status }).where(eq(commercialInvoices.id, targetId));
        return invoice.orderId;
    }

    if (targetType === 'VENDOR_BILL') {
        const bill = await db.query.vendorBills.findFirst({ where: eq(vendorBills.id, targetId) });
        if (!bill) return null;
        const dueAmount = parseDecimalInput(bill.amount, 0);
        const status = paidAmount >= dueAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'OPEN';
        await db.update(vendorBills).set({ status }).where(eq(vendorBills.id, targetId));
        return bill.orderId;
    }

    const bill = await db.query.logisticsBills.findFirst({ where: eq(logisticsBills.id, targetId) });
    if (!bill) return null;
    const dueAmount = parseDecimalInput(bill.amount, 0);
    const status = paidAmount >= dueAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'OPEN';
    await db.update(logisticsBills).set({ status }).where(eq(logisticsBills.id, targetId));
    return bill.orderId ?? null;
}

export async function createCommercialInvoice(data: z.infer<typeof commercialInvoiceSchema>) {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, data.orderId) });
    if (!order) throw new Error('Order not found');

    const issueDate = new Date();
    const amount = parseDecimalInput(data.amount, parseDecimalInput(order.totalAmount, 0));

    const anchorDate = order.deliveredAt ?? issueDate;
    const dueDate = data.dueDate
        ? new Date(data.dueDate)
        : addDays(anchorDate, order.customerTermDays ?? 30);

    const [saved] = await db
        .insert(commercialInvoices)
        .values({
            orderId: data.orderId,
            containerId: data.containerId || null,
            invoiceNo: data.invoiceNo?.trim() || createDefaultCode('CI'),
            issueDate,
            dueDate,
            amount: amount.toFixed(2),
            currency: data.currency || 'USD',
            status: 'OPEN',
        })
        .returning();

    await db
        .update(orders)
        .set({
            workflowStatus: order.workflowStatus === 'DELIVERED' ? 'AR_AP_OPEN' : order.workflowStatus,
        })
        .where(eq(orders.id, data.orderId));
    await recomputeOrderWorkflowStatus(data.orderId);

    return saved;
}

export async function createVendorBill(data: z.infer<typeof vendorBillSchema>) {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, data.orderId) });
    if (!order) throw new Error('Order not found');

    const issueDate = new Date();
    let amount = parseDecimalInput(data.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
        const items = await db
            .select({
                qty: orderItems.quantity,
                vendorUnitPrice: orderItems.vendorUnitPrice,
            })
            .from(orderItems)
            .where(eq(orderItems.orderId, data.orderId));
        amount = round2(
            items.reduce(
                (sum, item) =>
                    sum + parseDecimalInput(item.qty, 0) * parseDecimalInput(item.vendorUnitPrice, 0),
                0
            )
        );
    }
    const dueDate = data.dueDate
        ? new Date(data.dueDate)
        : addDays(issueDate, order.vendorTermDays ?? 30);

    const [saved] = await db
        .insert(vendorBills)
        .values({
            orderId: data.orderId,
            billNo: data.billNo?.trim() || createDefaultCode('VB'),
            issueDate,
            dueDate,
            amount: amount.toFixed(2),
            currency: data.currency || 'USD',
            status: 'OPEN',
        })
        .returning();

    await recomputeOrderWorkflowStatus(data.orderId);

    return saved;
}

export async function createLogisticsBill(data: z.infer<typeof logisticsBillSchema>) {
    if (!data.containerId) {
        throw new Error('containerId is required for 3PL bill');
    }

    const issueDate = new Date();
    const order = data.orderId
        ? await db.query.orders.findFirst({ where: eq(orders.id, data.orderId) })
        : null;

    const container = data.containerId
        ? await db.query.containers.findFirst({ where: eq(containers.id, data.containerId) })
        : null;

    const amount = parseDecimalInput(data.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('amount is required for 3PL bill and must be > 0');
    }

    const anchor = container?.arrivalAtWarehouse ?? order?.deliveredAt ?? issueDate;
    const termDays = order?.logisticsTermDays ?? 15;
    const dueDate = data.dueDate ? new Date(data.dueDate) : addDays(anchor, termDays);

    const [saved] = await db
        .insert(logisticsBills)
        .values({
            orderId: data.orderId || null,
            containerId: data.containerId || null,
            provider: data.provider || '3PL',
            billNo: data.billNo?.trim() || createDefaultCode('LB'),
            issueDate,
            dueDate,
            amount: amount.toFixed(2),
            currency: data.currency || 'USD',
            status: 'OPEN',
        })
        .returning();

    if (data.orderId) {
        await recomputeOrderWorkflowStatus(data.orderId);
    }

    return saved;
}

export async function createPayment(data: z.infer<typeof paymentSchema>) {
    const amount = parseDecimalInput(data.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('amount must be a positive number');
    }

    const [saved] = await db
        .insert(payments)
        .values({
            targetType: data.targetType,
            targetId: data.targetId,
            direction: data.direction,
            amount: amount.toFixed(2),
            paymentDate: new Date(),
            method: data.method || null,
            referenceNo: data.referenceNo || null,
            notes: data.notes || null,
        })
        .returning();

    const orderId = await refreshBillStatus(data.targetType, data.targetId);
    if (orderId) {
        await recomputeOrderWorkflowStatus(orderId);
    }

    return saved;
}
