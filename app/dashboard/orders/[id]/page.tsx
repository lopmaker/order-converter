import { OrderWorkspace } from '@/components/workflow/order-workspace';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderWorkspacePage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <OrderWorkspace orderId={id} />
    </div>
  );
}
