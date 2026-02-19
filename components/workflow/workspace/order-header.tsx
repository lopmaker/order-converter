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
import { Download, FileText, Printer } from 'lucide-react';
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
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight">Order {order.vpoNumber}</h1>
                        <Badge variant={statusBadgeVariant(order.workflowStatus)}>
                            {order.workflowStatus || 'OPEN'}
                        </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {order.customerName} &larr; {order.supplierName}
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:items-end">
                    <div className="flex flex-wrap items-center gap-2">
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
                                    'Undo IN_TRANSIT status? Removes ETAs.'
                                )
                            }
                        >
                            Undo Transit
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                actions.rollbackWorkflow(
                                    'UNDO_SHIPPING_DOC',
                                    'Undo Issue Doc? Deletes all auto-generated 3PL documents.'
                                )
                            }
                        >
                            Undo Issue Doc
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
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
                            onClick={() => actions.triggerWorkflow('GENERATE_SHIPPING_DOC')}
                            disabled={busyAction === 'TRIGGER_GENERATE_SHIPPING_DOC'}
                        >
                            {busyAction === 'TRIGGER_GENERATE_SHIPPING_DOC'
                                ? 'Wait...'
                                : '1. Issue Shipping Doc'}
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => actions.triggerWorkflow('START_TRANSIT')}
                            disabled={busyAction === 'TRIGGER_START_TRANSIT'}
                        >
                            {busyAction === 'TRIGGER_START_TRANSIT' ? 'Wait...' : '2. Start Transit'}
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => actions.triggerWorkflow('MARK_DELIVERED')}
                            disabled={busyAction === 'TRIGGER_MARK_DELIVERED'}
                        >
                            {busyAction === 'TRIGGER_MARK_DELIVERED' ? 'Wait...' : '3. Mark Delivered'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
