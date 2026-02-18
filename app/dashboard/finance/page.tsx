import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FinanceManager } from '@/components/finance/finance-manager';

export const dynamic = 'force-dynamic';

export default function FinancePage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Finance Workflow</h2>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-9 px-4 py-2"
        >
          Back to Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AR / AP / Settlement</CardTitle>
        </CardHeader>
        <CardContent>
          <FinanceManager />
        </CardContent>
      </Card>
    </div>
  );
}
