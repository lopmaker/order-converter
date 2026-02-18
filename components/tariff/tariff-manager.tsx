'use client';

import { useEffect, useMemo, useState } from 'react';
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

interface TariffRow {
  id: string;
  tariffKey: string;
  tariffRate: number;
  source: string;
  notes: string | null;
}

export function TariffManager() {
  const [rows, setRows] = useState<TariffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newClass, setNewClass] = useState('');

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tariffs', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setRows(
          data.data.map((row: TariffRow & { productClass?: string }) => ({
            ...row,
            tariffKey: row.tariffKey || row.productClass || '',
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.tariffKey.localeCompare(b.tariffKey)),
    [rows]
  );

  const handleSync = async () => {
    setLoading(true);
    try {
      await fetch('/api/tariffs/sync', { method: 'POST' });
      await loadRows();
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRow = async (row: TariffRow) => {
    setSavingId(row.id);
    try {
      const res = await fetch(`/api/tariffs/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariffRate: row.tariffRate, notes: row.notes }),
      });
      if (res.ok) {
        await loadRows();
      }
    } finally {
      setSavingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newClass.trim()) return;
    setLoading(true);
    try {
      await fetch('/api/tariffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariffKey: newClass.trim() }),
      });
      setNewClass('');
      await loadRows();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSync} disabled={loading}>Sync Tariff Keys</Button>
        <Input
          value={newClass}
          onChange={(e) => setNewClass(e.target.value)}
          placeholder="Add tariff key (e.g. cn | junior tee | cotton-rich)"
          className="max-w-xs"
        />
        <Button variant="outline" onClick={handleAdd} disabled={loading || !newClass.trim()}>
          Add Key
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tariff Key</TableHead>
              <TableHead>Tariff Rate</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {loading ? 'Loading...' : 'No tariff rows yet'}
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.tariffKey}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={row.tariffRate}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, tariffRate: Number.isFinite(value) ? value : 0 } : item
                          )
                        );
                      }}
                      className="h-8 max-w-[120px]"
                    />
                  </TableCell>
                  <TableCell>{row.source}</TableCell>
                  <TableCell>
                    <Input
                      value={row.notes || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, notes: value } : item)));
                      }}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSaveRow(row)}
                      disabled={savingId === row.id}
                    >
                      {savingId === row.id ? 'Saving...' : 'Save'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Est. 3PL formula used in margin: (tariffRate x 0.5 x FOB) + (0.1 x Qty)
      </p>
    </div>
  );
}
