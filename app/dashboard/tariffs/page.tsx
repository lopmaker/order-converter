import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TariffManager } from '@/components/tariff/tariff-manager';

export const dynamic = 'force-dynamic';

export default function TariffsPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Tariff Sync Table</h2>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-9 px-4 py-2"
        >
          Back to Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Class Tariff Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <TariffManager />
        </CardContent>
      </Card>
    </div>
  );
}
