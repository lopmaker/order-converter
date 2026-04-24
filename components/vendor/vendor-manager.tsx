'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Plus, Loader2, Save, Trash2, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useI18n } from '@/components/locale-provider';

interface Vendor {
  id: string;
  name: string;
  address: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
}

type VendorDraft = Omit<Vendor, 'id' | 'createdAt'>;

const emptyDraft: VendorDraft = {
  name: '',
  address: null,
  contactName: null,
  email: null,
  phone: null,
};

export function VendorManager() {
  const { t } = useI18n();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<VendorDraft>(emptyDraft);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<VendorDraft>(emptyDraft);
  const [addSaving, setAddSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vendors', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as Vendor[];
      setVendors(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    setEditDraft({
      name: vendor.name,
      address: vendor.address,
      contactName: vendor.contactName,
      email: vendor.email,
      phone: vendor.phone,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft);
  };

  const saveEdit = async (id: string) => {
    if (!editDraft.name?.trim()) {
      toast.error(t('VendorManager.nameRequired', '工厂名称不能为空'));
      return;
    }
    setSavingId(id);
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Save failed');
      }
      toast.success(t('VendorManager.saved', '已保存'));
      cancelEdit();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const handleAdd = async () => {
    if (!addDraft.name?.trim()) {
      toast.error(t('VendorManager.nameRequired', '工厂名称不能为空'));
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addDraft),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Create failed');
      }
      toast.success(t('VendorManager.added', '工厂已添加'));
      setAddDialogOpen(false);
      setAddDraft(emptyDraft);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setAddSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      const res = await fetch(`/api/vendors/${id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Delete failed');
      }
      toast.success(t('VendorManager.deleted', '已删除'));
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('VendorManager.count', '共 {count} 家工厂', { count: vendors.length })}
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('VendorManager.addVendor', '新增工厂')}
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('VendorManager.name', '工厂名称')}</TableHead>
              <TableHead>{t('VendorManager.contactName', '联系人')}</TableHead>
              <TableHead>{t('VendorManager.email', '邮箱')}</TableHead>
              <TableHead>{t('VendorManager.phone', '电话')}</TableHead>
              <TableHead>{t('VendorManager.address', '地址')}</TableHead>
              <TableHead className="text-right">{t('VendorManager.actions', '操作')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {loading
                    ? t('VendorManager.loading', '加载中...')
                    : t('VendorManager.noVendors', '暂无工厂记录')}
                </TableCell>
              </TableRow>
            ) : (
              vendors.map((vendor) => {
                const isEditing = editingId === vendor.id;
                const row = isEditing ? { ...editDraft } : vendor;
                return (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">
                      {isEditing ? (
                        <Input
                          value={row.name || ''}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, name: e.target.value }))
                          }
                          className="h-8"
                        />
                      ) : (
                        vendor.name
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={row.contactName || ''}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, contactName: e.target.value }))
                          }
                          className="h-8"
                        />
                      ) : (
                        vendor.contactName || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="email"
                          value={row.email || ''}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, email: e.target.value }))
                          }
                          className="h-8"
                        />
                      ) : (
                        vendor.email || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={row.phone || ''}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, phone: e.target.value }))
                          }
                          className="h-8"
                        />
                      ) : (
                        vendor.phone || '-'
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {isEditing ? (
                        <Input
                          value={row.address || ''}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, address: e.target.value }))
                          }
                          className="h-8"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground line-clamp-2">
                          {vendor.address || '-'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveEdit(vendor.id)}
                            disabled={savingId === vendor.id}
                          >
                            {savingId === vendor.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                            disabled={savingId === vendor.id}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(vendor)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:text-destructive"
                            onClick={() => setDeleteTarget(vendor)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('VendorManager.addVendorTitle', '新增工厂')}</DialogTitle>
            <DialogDescription>
              {t(
                'VendorManager.addVendorDesc',
                '添加的工厂会出现在所有订单的工厂选择下拉菜单里。'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">
                {t('VendorManager.name', '工厂名称')}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                className="col-span-3"
                value={addDraft.name || ''}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">{t('VendorManager.contactName', '联系人')}</Label>
              <Input
                className="col-span-3"
                value={addDraft.contactName || ''}
                onChange={(e) =>
                  setAddDraft((prev) => ({ ...prev, contactName: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">{t('VendorManager.email', '邮箱')}</Label>
              <Input
                type="email"
                className="col-span-3"
                value={addDraft.email || ''}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-3">
              <Label className="text-right">{t('VendorManager.phone', '电话')}</Label>
              <Input
                className="col-span-3"
                value={addDraft.phone || ''}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-3">
              <Label className="text-right pt-2">{t('VendorManager.address', '地址')}</Label>
              <Input
                className="col-span-3"
                value={addDraft.address || ''}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, address: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddDialogOpen(false);
                setAddDraft(emptyDraft);
              }}
              disabled={addSaving}
            >
              {t('VendorManager.cancel', '取消')}
            </Button>
            <Button onClick={handleAdd} disabled={addSaving || !addDraft.name?.trim()}>
              {addSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('VendorManager.save', '保存')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('VendorManager.deleteTitle', '删除工厂')}
        description={t(
          'VendorManager.deleteConfirm',
          '确定删除工厂 "{name}" 吗？历史订单里的工厂名字段不受影响，但此工厂会从下拉清单里移除。',
          { name: deleteTarget?.name ?? '' }
        )}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
