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
      key: 'DRAFTING',
      title: t('Workflow.stage1Title', '1. 下单 / Drafting'),
      trigger: t('Workflow.stage1Trigger', '录入客户 PDF + 工厂价'),
      summary: t(
        'Workflow.stage1Summary',
        '客户 PDF 已录入；业务经理录入工厂价后系统自动计算毛利。'
      ),
    },
    {
      key: 'PRODUCTION',
      title: t('Workflow.stage2Title', '2. 生产 / Production'),
      trigger: t('Workflow.stage2Trigger', '建立生产批次'),
      summary: t('Workflow.stage2Summary', '工厂排期中，处理延期、分批、客户改单。'),
    },
    {
      key: 'LOGISTICS',
      title: t('Workflow.stage3Title', '3. 物流 / Logistics'),
      trigger: t('Workflow.stage3Trigger', '装柜 / 订舱'),
      summary: t(
        'Workflow.stage3Summary',
        '装柜、报关、出运；第三方物流同步录入柜号、提单、到港状态。'
      ),
    },
    {
      key: 'SETTLEMENT',
      title: t('Workflow.stage4Title', '4. 结算 / Settlement'),
      trigger: t('Workflow.stage4Trigger', '开商业发票 / 标记交付'),
      summary: t(
        'Workflow.stage4Summary',
        '分批开票给客户；跟踪客户收款与付工厂款（按账期自动生成时间表）。'
      ),
    },
    {
      key: 'CLOSED',
      title: t('Workflow.stage5Title', '5. 已关闭 / Closed'),
      trigger: t('Workflow.stage5Trigger', '全部付清自动关闭'),
      summary: t('Workflow.stage5Summary', '所有应收应付已结清，毛利入账。'),
    },
  ];

  const ACTION_EFFECTS = [
    {
      action: t('Workflow.actionStartTransit', 'Start Transit'),
      result: t('Workflow.actionStartTransitResult', '推进到物流 / 结算阶段'),
      writes: t(
        'Workflow.actionStartTransitWrites',
        '若缺失，自动创建 shipping_documents、commercial_invoices、vendor_bills；关联的集装箱 status 置为 IN_TRANSIT。'
      ),
    },
    {
      action: t('Workflow.actionMarkDelivered', 'Mark Delivered'),
      result: t('Workflow.actionMarkDeliveredResult', '推进到结算 / 已关闭阶段'),
      writes: t(
        'Workflow.actionMarkDeliveredWrites',
        '设置 delivered_at；若缺失，自动创建 logistics_bills；关联的集装箱标记到港时间戳。'
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
