'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useI18n } from '@/components/locale-provider';

interface Vendor {
    id: string;
    name: string;
    address?: string | null;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
}

interface VendorSelectorProps {
    currentVendorName: string;
    onVendorChange: (vendorName: string, vendorAddress?: string | null) => Promise<void>;
    disabled?: boolean;
}

export function VendorSelector({ currentVendorName, onVendorChange, disabled }: VendorSelectorProps) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Create vendor form state
    const [newVendorName, setNewVendorName] = useState('');
    const [newVendorAddress, setNewVendorAddress] = useState('');

    useEffect(() => {
        fetchVendors();
    }, []);

    const fetchVendors = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/vendors');
            if (res.ok) {
                const data = await res.json();
                setVendors(data);
            }
        } catch (error) {
            console.error('Failed to fetch vendors:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateVendor = async () => {
        if (!newVendorName.trim()) {
            toast.error(t('OrderWorkspace.vendorNameRequired', 'Vendor name is required'));
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/vendors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newVendorName.trim(), address: newVendorAddress.trim() }),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || t('OrderWorkspace.failedToCreateVendor', 'Failed to create vendor'));
            }

            const newVendor = await res.json();
            setVendors((prev) => [...prev, newVendor].sort((a, b) => a.name.localeCompare(b.name)));
            setDialogOpen(false);
            setNewVendorName('');
            setNewVendorAddress('');

            // Select the new vendor immediately
            await handleSelectVendor(newVendor);

            toast.success(t('OrderWorkspace.vendorAddedToPortfolio', 'Vendor added to portfolio'));
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSelectVendor = async (vendor: Vendor) => {
        try {
            if (vendor.name !== currentVendorName) {
                await onVendorChange(vendor.name, vendor.address);
            }
            setOpen(false);
        } catch (error) {
            // Error is handled by parent
        }
    };

    const selectedVendor = vendors.find((v) => v.name === currentVendorName);

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className="h-auto p-0 px-2 font-medium hover:bg-muted/50 w-auto justify-between group"
                    >
                        <span className="truncate max-w-[200px]">{currentVendorName || t('OrderWorkspace.selectVendor', 'Select Vendor')}</span>
                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                        <CommandInput placeholder={t('OrderWorkspace.searchVendors', 'Search vendors...')} />
                        <CommandList>
                            <CommandEmpty>{t('OrderWorkspace.noVendorFound', 'No vendor found.')}</CommandEmpty>
                            <CommandGroup heading={t('OrderWorkspace.vendors', 'Vendors')}>
                                {loading ? (
                                    <CommandItem disabled className="justify-center">
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('OrderWorkspace.loading', 'Loading...')}
                                    </CommandItem>
                                ) : (
                                    vendors.map((vendor) => (
                                        <CommandItem
                                            key={vendor.id}
                                            value={vendor.name}
                                            onSelect={() => handleSelectVendor(vendor)}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    currentVendorName === vendor.name ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {vendor.name}
                                        </CommandItem>
                                    ))
                                )}
                            </CommandGroup>
                            <CommandSeparator />
                            <CommandGroup>
                                <CommandItem
                                    onSelect={() => {
                                        setOpen(false);
                                        setDialogOpen(true);
                                    }}
                                    className="font-medium text-primary flex items-center gap-2 cursor-pointer"
                                >
                                    <Plus className="h-4 w-4" />
                                    {t('OrderWorkspace.addNewVendor', 'Add New Vendor')}
                                </CommandItem>
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('OrderWorkspace.addNewVendor', 'Add New Vendor')}</DialogTitle>
                        <DialogDescription>
                            {t('OrderWorkspace.addNewVendorDesc', 'Add a new vendor to your portfolio. This vendor can be used across all orders.')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                {t('OrderWorkspace.name', 'Name')} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="name"
                                value={newVendorName}
                                onChange={(e) => setNewVendorName(e.target.value)}
                                className="col-span-3"
                                placeholder={t('OrderWorkspace.vendorCompanyName', 'Vendor Company Name')}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="address" className="text-right pt-2">
                                {t('OrderWorkspace.address', 'Address')}
                            </Label>
                            <Input
                                id="address"
                                value={newVendorAddress}
                                onChange={(e) => setNewVendorAddress(e.target.value)}
                                className="col-span-3"
                                placeholder={t('OrderWorkspace.optionalVendorAddress', 'Optional vendor address')}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                            {t('OrderWorkspace.cancel', 'Cancel')}
                        </Button>
                        <Button onClick={handleCreateVendor} disabled={saving || !newVendorName.trim()}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {t('OrderWorkspace.saveVendor', 'Save Vendor')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
