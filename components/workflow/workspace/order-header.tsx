import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Download, FileText, Printer, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
    OrderDetails,
    ContainerRow,
    WorkflowAction,
    RollbackAction,
    AUTO_CONTAINER,
} from './types';
import { statusBadgeVariant } from './utils';

export function OrderHeader({
    order,
    relevantContainerOptions,
    selectedContainerForWorkflow,
    setSelectedContainerForWorkflow,
    busyAction,
    actions,
}: {
    order: OrderDetails;
    relevantContainerOptions: ContainerRow[];
    selectedContainerForWorkflow: string;
    setSelectedContainerForWorkflow: (id: string) => void;
    busyAction: string | null;
    actions: {
        setIsPoPreviewOpen: (open: boolean) => void;
        triggerWorkflow: (action: WorkflowAction) => void;
        rollbackWorkflow: (action: RollbackAction, msg: string) => void;
    };
}) {
    return (
        <div className="flex flex-col gap-4">
            <Link href="/dashboard" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors w-fit">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="space-y-1.5 border-l-4 border-primary pl-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Order {order.vpoNumber}</h1>
                        <Badge variant={statusBadgeVariant(order.workflowStatus)} className="rounded-md px-2 py-0.5 shadow-sm text-xs font-medium">
                            {order.workflowStatus || 'OPEN'}
                        </Badge>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <span>{order.customerName}</span>
                        <ChevronRight className="h-3 w-3 opacity-50" />
                        <span>{order.supplierName}</span>
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:items-end">
                    <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-1.5 rounded-lg border border-border/50">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => actions.setIsPoPreviewOpen(true)}
                        >
                            <FileText className="mr-2 h-4 w-4" />
                            View PO
                        </Button>
                        <span className="text-xs text-muted-foreground">Rollback:</span>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                actions.rollbackWorkflow(
                                    'UNDO_MARK_DELIVERED',
                                    'Undo DELIVERED status?'
                                )
                            }
                        >
                            Undo Deliver
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                actions.rollbackWorkflow(
                                    'UNDO_START_TRANSIT',
                                    'Undo Ship Order? This reverts the status to OPEN and removes ETAs.'
                                )
                            }
                        >
                            Undo Ship Order
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs hover:bg-destructive/10 hover:text-destructive transition-colors"
                            onClick={() =>
                                actions.rollbackWorkflow(
                                    'UNDO_SHIPPING_DOC',
                                    'Undo Auto-Docs? This deletes the Auto-Generated Shipping & AP/AR Documents.'
                                )
                            }
                        >
                            Undo Auto-Docs
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 bg-card p-1.5 rounded-xl border shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                Container Context:
                            </span>
                            <Select
                                value={selectedContainerForWorkflow}
                                onValueChange={setSelectedContainerForWorkflow}
                                disabled={!!busyAction || relevantContainerOptions.length === 0}
                            >
                                <SelectTrigger className="h-8 w-[140px] text-xs">
                                    <SelectValue placeholder="Container" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={AUTO_CONTAINER}>Any / Unassigned</SelectItem>
                                    {relevantContainerOptions.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.containerNo}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            size="sm"
                            onClick={() => actions.triggerWorkflow('START_TRANSIT')}
                            disabled={busyAction === 'TRIGGER_START_TRANSIT'}
                        >
                            {busyAction === 'TRIGGER_START_TRANSIT' ? 'Wait...' : '1. Ship Order'}
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => actions.triggerWorkflow('MARK_DELIVERED')}
                            disabled={busyAction === 'TRIGGER_MARK_DELIVERED'}
                        >
                            {busyAction === 'TRIGGER_MARK_DELIVERED' ? 'Wait...' : '2. Mark Delivered'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
