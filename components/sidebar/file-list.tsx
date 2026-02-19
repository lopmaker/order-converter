import { FileText, Loader2, CheckCircle2, AlertCircle, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { OrderFile } from '@/lib/types';

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
  if (orders.length === 0) return null;

  return (
    <div className="flex flex-col h-full border-r bg-muted/5 w-[250px] shrink-0">
      <div className="p-4 border-b flex justify-between items-center bg-background/95 backdrop-blur">
        <h3 className="font-semibold text-sm">Orders ({orders.length})</h3>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onAddMore}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {orders.map((order) => (
            <div
              key={order.id}
              className={cn(
                'group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-muted/50 text-sm',
                activeOrderId === order.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground'
              )}
              onClick={() => onSelectOrder(order.id)}
            >
              {/* Status Icon */}
              <div className="shrink-0">
                {order.status === 'processing' && (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                )}
                {order.status === 'completed' && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {order.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                {order.status === 'idle' && <FileText className="h-4 w-4 opacity-50" />}
              </div>

              {/* Filename */}
              <div className="flex-1 min-w-0">
                <p className="truncate">{order.fileName || order.file?.name || 'Unknown File'}</p>
                {order.status === 'processing' && (
                  <p className="text-[10px] opacity-70 truncate">
                    {order.processingStep || 'Processing...'}
                  </p>
                )}
              </div>

              {/* Remove Button (visible on hover or active) */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity',
                  activeOrderId === order.id && 'bg-background/20 hover:bg-background/40'
                )}
                onClick={(e) => onRemoveOrder(order.id, e)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
