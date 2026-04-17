import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown } from 'lucide-react';
import { DEFAULT_LOCALE, translate, type Locale } from '@/lib/i18n';

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

function BillCard({ title, stats, locale }: { title: string; stats: BillStats; locale: Locale }) {
  const t = (key: string, fallback: string, params?: Record<string, string | number>) =>
    translate(locale, key, fallback, params);

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div>
          {t('Workflow.total', 'Total')}: {stats.total}
        </div>
        <div>
          {t('Workflow.open', 'Open')}: {stats.open}
        </div>
        <div>
          {t('Workflow.partial', 'Partial')}: {stats.partial}
        </div>
        <div>
          {t('Workflow.paid', 'Paid')}: {stats.paid}
        </div>
      </div>
    </div>
  );
}

export function WorkflowMapCard({
  snapshot,
  locale = DEFAULT_LOCALE,
}: {
  snapshot: BusinessFlowSnapshot;
  locale?: Locale;
}) {
  const t = (key: string, fallback: string, params?: Record<string, string | number>) =>
    translate(locale, key, fallback, params);

  const FLOW_STAGES = [
    {
      key: 'PO_UPLOADED',
      title: t('Workflow.stage1Title', '1. PO Uploaded'),
      trigger: t('Workflow.stage1Trigger', 'Save order'),
      summary: t('Workflow.stage1Summary', 'Order and line items are created from customer PO.'),
    },
    {
      key: 'SHIPPING_DOC_SENT',
      title: t('Workflow.stage2Title', '2. Shipping Doc Sent'),
      trigger: t('Workflow.stage2Trigger', 'Send Shipping Doc'),
      summary: t('Workflow.stage2Summary', 'Shipping document is issued for 3PL booking.'),
    },
    {
      key: 'IN_TRANSIT',
      title: t('Workflow.stage3Title', '3. In Transit'),
      trigger: t('Workflow.stage3Trigger', 'Start Transit'),
      summary: t(
        'Workflow.stage3Summary',
        'Shipment is in transit and AR/AP core docs are opened.'
      ),
    },
    {
      key: 'AR_AP_OPEN',
      title: t('Workflow.stage4Title', '4. AR/AP Open'),
      trigger: t('Workflow.stage4Trigger', 'Mark Delivered'),
      summary: t(
        'Workflow.stage4Summary',
        'Delivered; payment collection and payouts are in progress.'
      ),
    },
    {
      key: 'CLOSED',
      title: t('Workflow.stage5Title', '5. Closed'),
      trigger: t('Workflow.stage5Trigger', 'Auto by payment completion'),
      summary: t('Workflow.stage5Summary', 'All related AR/AP documents are fully paid.'),
    },
  ];

  const ACTION_EFFECTS = [
    {
      action: t('Workflow.actionSendShippingDoc', 'Send Shipping Doc'),
      result: t('Workflow.actionSendShippingDocResult', 'Moves order to SHIPPING_DOC_SENT'),
      writes: t('Workflow.actionSendShippingDocWrites', 'Creates shipping_documents if missing.'),
    },
    {
      action: t('Workflow.actionStartTransit', 'Start Transit'),
      result: t('Workflow.actionStartTransitResult', 'Moves order to IN_TRANSIT'),
      writes: t(
        'Workflow.actionStartTransitWrites',
        'Creates commercial_invoices and vendor_bills if missing. Updates container to IN_TRANSIT when linked.'
      ),
    },
    {
      action: t('Workflow.actionMarkDelivered', 'Mark Delivered'),
      result: t('Workflow.actionMarkDeliveredResult', 'Moves order to AR_AP_OPEN'),
      writes: t(
        'Workflow.actionMarkDeliveredWrites',
        'Sets delivered_at and creates logistics_bills if missing. Updates container arrival timestamps when linked.'
      ),
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
              <CardTitle>{t('Workflow.cardTitle', 'Live Business Flow')}</CardTitle>
              <CardDescription>
                {t(
                  'Workflow.cardDescription',
                  'Real-time status of orders and financial documents'
                )}
              </CardDescription>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform [[open]>&]:rotate-180" />
          </CardHeader>
        </summary>
        <CardContent className="space-y-6 pt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">
              {t('Workflow.totalOrders', 'Total Orders: {count}', { count: snapshot.totalOrders })}
            </Badge>
            <Badge variant="outline">
              {t('Workflow.shippingDocs', 'Shipping Docs: {count}', {
                count: snapshot.shippingDocs,
              })}
            </Badge>
            <Badge variant="outline">
              {t('Workflow.payments', 'Payments: {count}', { count: snapshot.payments })}
            </Badge>
            {otherStatusCount > 0 && (
              <Badge variant="destructive">
                {t('Workflow.otherStatus', 'Other Status: {count}', { count: otherStatusCount })}
              </Badge>
            )}
          </div>

          {bottleneck && (
            <div className="rounded-lg border bg-muted/20 p-3 text-xs">
              <span className="font-semibold">
                {t('Workflow.currentBottleneck', 'Current Bottleneck:')}
              </span>{' '}
              {bottleneck.title} ({bottleneck.count} {t('Workflow.ordersSuffix', 'orders')})
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
                      {count} {t('Workflow.ordersSuffix', 'orders')}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('Workflow.trigger', 'Trigger: {trigger}', { trigger: stage.trigger })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border">
            <div className="grid grid-cols-12 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-3">{t('Workflow.button', 'Button')}</div>
              <div className="col-span-3">{t('Workflow.statusResult', 'Status Result')}</div>
              <div className="col-span-6">
                {t('Workflow.databaseSideEffect', 'Database Side Effect')}
              </div>
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
            <BillCard
              title={t('Workflow.commercialInvoice', 'Commercial Invoice (AR)')}
              stats={snapshot.commercialInvoices}
              locale={locale}
            />
            <BillCard
              title={t('Workflow.vendorBill', 'Vendor Bill (AP)')}
              stats={snapshot.vendorBills}
              locale={locale}
            />
            <BillCard
              title={t('Workflow.thirdPartyBill', '3PL Bill (AP)')}
              stats={snapshot.logisticsBills}
              locale={locale}
            />
          </div>
        </CardContent>
      </details>
    </Card>
  );
}
