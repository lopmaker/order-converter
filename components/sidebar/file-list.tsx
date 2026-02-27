import { FileText, Loader2, CheckCircle2, AlertCircle, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { OrderFile } from '@/lib/types';
import { useI18n } from '@/components/locale-provider';

interface FileListProps {
  orders: OrderFile[];
  activeOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onRemoveOrder: (id: string, e: React.MouseEvent) => void;
  onAddMore: () => void;
}

export function FileList({
  orders,
  activeOrderId,
  onSelectOrder,
  onRemoveOrder,
  onAddMore,
}: FileListProps) {
  const { t } = useI18n();

  if (orders.length === 0) return null;

  return (
    <div className="flex flex-col h-full border-r bg-card/50 w-[220px] shrink-0">
      <div className="px-4 py-3 border-b flex justify-between items-center bg-background/95 backdrop-blur">
        <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
          {t('FileList.files', 'Files')} ({orders.length})
        </h3>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onAddMore}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {orders.map((order) => (
            <div
              key={order.id}
              className={cn(
                'group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs',
                activeOrderId === order.id
                  ? 'bg-primary/8 text-foreground border-l-2 border-primary ml-0 font-medium'
                  : 'text-muted-foreground hover:bg-muted/50 border-l-2 border-transparent ml-0'
              )}
              onClick={() => onSelectOrder(order.id)}
            >
              {/* Status Icon */}
              <div className="shrink-0">
                {order.status === 'processing' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                )}
                {order.status === 'completed' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
                {order.status === 'error' && (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                {order.status === 'idle' && <FileText className="h-3.5 w-3.5 opacity-40" />}
              </div>

              {/* Filename */}
              <div className="flex-1 min-w-0">
                <p className="truncate">
                  {order.fileName || order.file?.name || t('FileList.unknown', 'Unknown')}
                </p>
                {order.status === 'processing' && (
                  <p className="text-[9px] opacity-60 truncate mt-0.5">
                    {order.processingStep || t('FileList.processing', 'Processing...')}
                  </p>
                )}
              </div>

              {/* Remove Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => onRemoveOrder(order.id, e)}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
