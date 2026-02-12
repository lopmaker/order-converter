
'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2, Check, X, Truck, Clock } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Order {
    id: string;
    vpoNumber: string;
    customerName: string | null;
    supplierName: string | null;
    orderDate: string | null;
    totalAmount: string | null;
    status: string | null;
}

interface OrdersTableProps {
    initialOrders: Order[];
}

export function OrdersTable({ initialOrders }: OrdersTableProps) {
    const router = useRouter();
    const [orders, setOrders] = useState<Order[]>(initialOrders);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this order? This cannot be undone.")) return;

        setLoadingId(id);
        try {
            const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');

            setOrders(prev => prev.filter(o => o.id !== id));
            router.refresh(); // Refresh server stats
        } catch (error) {
            console.error("Delete failed:", error);
            alert("Failed to delete order");
        } finally {
            setLoadingId(null);
        }
    };

    const handleStatusUpdate = async (id: string, newStatus: string) => {
        setLoadingId(id);
        try {
            const res = await fetch(`/api/orders/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) throw new Error('Failed to update status');

            setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
            router.refresh();
        } catch (error) {
            console.error("Update failed:", error);
            alert("Failed to update status");
        } finally {
            setLoadingId(null);
        }
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'Confirmed': return 'default';
            case 'Shipped': return 'secondary';
            case 'Cancelled': return 'destructive';
            case 'Pending': return 'outline';
            default: return 'outline';
        }
    };

    if (orders.length === 0) {
        return (
            <div className="text-center py-10 text-muted-foreground">
                No orders found. Connect the database and save an order to see it here.
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>VPO Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {orders.map((order) => (
                    <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.vpoNumber}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.supplierName}</TableCell>
                        <TableCell>{order.orderDate}</TableCell>
                        <TableCell className="text-right">${order.totalAmount}</TableCell>
                        <TableCell>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Badge
                                        variant={getStatusVariant(order.status || 'Pending')}
                                        className="cursor-pointer hover:opacity-80 transition-opacity"
                                    >
                                        {loadingId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : order.status}
                                    </Badge>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleStatusUpdate(order.id, 'Confirmed')}>
                                        <Check className="h-4 w-4 mr-2" /> Confirmed
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusUpdate(order.id, 'Shipped')}>
                                        <Truck className="h-4 w-4 mr-2" /> Shipped
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusUpdate(order.id, 'Pending')}>
                                        <Clock className="h-4 w-4 mr-2" /> Pending
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusUpdate(order.id, 'Cancelled')}>
                                        <X className="h-4 w-4 mr-2 text-red-500" /> Cancelled
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                        <TableCell>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(order.id)}
                                disabled={loadingId === order.id}
                            >
                                {loadingId === order.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                )}
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
