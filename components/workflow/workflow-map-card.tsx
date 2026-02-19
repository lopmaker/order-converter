import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';

type BillStats = {
  total: number;
  open: number;
  partial: number;
  paid: number;
};

export type BusinessFlowSnapshot = {
  totalOrders: number;
  stageCounts: Record<string, number>;
  shippingDocs: number;
  commercialInvoices: BillStats;
  vendorBills: BillStats;
  logisticsBills: BillStats;
  payments: number;
};

function getCount(counts: Record<string, number>, key: string): number {
  return counts[key] || 0;
}

function getOtherStatusCount(snapshot: BusinessFlowSnapshot, flowStages: any[]): number {
  const knownTotal = flowStages.reduce(
    (sum, stage) => sum + getCount(snapshot.stageCounts, stage.key),
    0
  );
  return Math.max(0, snapshot.totalOrders - knownTotal);
}

function BillCard({ title, stats }: { title: string; stats: BillStats }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>Total: {stats.total}</div>
        <div>Open: {stats.open}</div>
        <div>Partial: {stats.partial}</div>
        <div>Paid: {stats.paid}</div>
      </div>
    </div>
  );
}

export async function WorkflowMapCard({ snapshot }: { snapshot: BusinessFlowSnapshot }) {
  const FLOW_STAGES = [
    {
      key: 'PO_UPLOADED',
      title: '1. PO Uploaded',
      trigger: 'Save order',
      summary: 'Order and line items are created from customer PO.',
    },
    {
      key: 'SHIPPING_DOC_SENT',
      title: '2. Shipping Doc Sent',
      trigger: 'Send Shipping Doc',
      summary: 'Shipping document is issued for 3PL booking.',
    },
    {
      key: 'IN_TRANSIT',
      title: '3. In Transit',
      trigger: 'Start Transit',
      summary: 'Shipment is in transit and AR/AP core docs are opened.',
    },
    {
      key: 'AR_AP_OPEN',
      title: '4. AR/AP Open',
      trigger: 'Mark Delivered',
      summary: 'Delivered; payment collection and payouts are in progress.',
    },
    {
      key: 'CLOSED',
      title: '5. Closed',
      trigger: 'Auto by payment completion',
      summary: 'All related AR/AP documents are fully paid.',
    },
  ];

  const ACTION_EFFECTS = [
    {
      action: 'Send Shipping Doc',
      result: 'Moves order to SHIPPING_DOC_SENT',
      writes: 'Creates shipping_documents if missing.',
    },
    {
      action: 'Start Transit',
      result: 'Moves order to IN_TRANSIT',
      writes:
        'Creates commercial_invoices and vendor_bills if missing. Updates container to IN_TRANSIT when linked.',
    },
    {
      action: 'Mark Delivered',
      result: 'Moves order to AR_AP_OPEN',
      writes:
        'Sets delivered_at and creates logistics_bills if missing. Updates container arrival timestamps when linked.',
    },
  ];

  const findBottleneck = (snapshot: BusinessFlowSnapshot) => {
    const candidates = FLOW_STAGES.filter((stage) => stage.key !== 'CLOSED');
    let maxStage: { title: string; count: number } | null = null;

    for (const stage of candidates) {
      const count = getCount(snapshot.stageCounts, stage.key);
      if (!maxStage || count > maxStage.count) {
        maxStage = { title: stage.title, count };
      }
    }

    if (!maxStage || maxStage.count === 0) return null;
    return maxStage;
  };

  const bottleneck = findBottleneck(snapshot);
  const otherStatusCount = getOtherStatusCount(snapshot, FLOW_STAGES);

  return (
    <Card className="col-span-1">
      <details>
        <summary className="cursor-pointer list-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Live Business Flow</CardTitle>
              <CardDescription>
                Real-time status of orders and financial documents
              </CardDescription>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[open]>&]:rotate-180" />
          </CardHeader>
        </summary>
        <CardContent className="space-y-6 pt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">Total Orders: {snapshot.totalOrders}</Badge>
            <Badge variant="outline">Shipping Docs: {snapshot.shippingDocs}</Badge>
            <Badge variant="outline">Payments: {snapshot.payments}</Badge>
            {otherStatusCount > 0 && (
              <Badge variant="destructive">Other Status: {otherStatusCount}</Badge>
            )}
          </div>

          {bottleneck && (
            <div className="rounded-lg border bg-muted/20 p-3 text-xs">
              <span className="font-semibold">Current Bottleneck:</span> {bottleneck.title} (
              {bottleneck.count} orders)
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {FLOW_STAGES.map((stage) => {
              const count = getCount(snapshot.stageCounts, stage.key);
              return (
                <div key={stage.key} className="rounded-lg border p-3">
                  <div className="mb-1 text-sm font-semibold">{stage.title}</div>
                  <div className="mb-2 text-[11px] text-muted-foreground">{stage.summary}</div>
                  <div className="mb-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {count} orders
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">Trigger: {stage.trigger}</div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border">
            <div className="grid grid-cols-12 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-3">Button</div>
              <div className="col-span-3">Status Result</div>
              <div className="col-span-6">Database Side Effect</div>
            </div>
            {ACTION_EFFECTS.map((row) => (
              <div
                key={row.action}
                className="grid grid-cols-12 border-b last:border-b-0 px-3 py-2 text-xs"
              >
                <div className="col-span-3 font-medium">{row.action}</div>
                <div className="col-span-3 text-muted-foreground">{row.result}</div>
                <div className="col-span-6 text-muted-foreground">{row.writes}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <BillCard title="Commercial Invoice (AR)" stats={snapshot.commercialInvoices} />
            <BillCard title="Vendor Bill (AP)" stats={snapshot.vendorBills} />
            <BillCard title="3PL Bill (AP)" stats={snapshot.logisticsBills} />
          </div>
        </CardContent>
      </details>
    </Card>
  );
}

