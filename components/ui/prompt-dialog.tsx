'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

// ─── Types ──────────────────────────────────────────────────────

export interface PromptField {
    /** Unique key for the field (used as key in the returned values). */
    key: string;
    /** Label shown above the input. */
    label: string;
    /** Default / pre-filled value. */
    defaultValue?: string;
    /** Placeholder text. */
    placeholder?: string;
}

export interface PromptDialogConfig {
    /** Dialog title. */
    title: string;
    /** Field definitions. */
    fields: PromptField[];
}

// ─── Hook ───────────────────────────────────────────────────────

/**
 * Hook that provides a promise-based multi-field prompt dialog.
 *
 * Usage:
 * ```tsx
 * const { openPrompt, promptDialogProps } = usePromptDialog();
 *
 * const result = await openPrompt({
 *   title: 'Edit Container',
 *   fields: [
 *     { key: 'containerNo', label: 'Container No', defaultValue: '...' },
 *     { key: 'vessel', label: 'Vessel Name', placeholder: 'optional' },
 *   ],
 * });
 *
 * if (!result) return; // user cancelled
 * // result = { containerNo: '...', vessel: '...' }
 * ```
 */
export function usePromptDialog() {
    const [open, setOpen] = useState(false);
    const [config, setConfig] = useState<PromptDialogConfig | null>(null);

    const resolverRef = useRef<((values: Record<string, string> | null) => void) | null>(null);

    const openPrompt = useCallback((cfg: PromptDialogConfig): Promise<Record<string, string> | null> => {
        setConfig(cfg);
        setOpen(true);
        return new Promise((resolve) => {
            resolverRef.current = resolve;
        });
    }, []);

    const onConfirm = useCallback((values: Record<string, string>) => {
        setOpen(false);
        resolverRef.current?.(values);
        resolverRef.current = null;
    }, []);

    const onCancel = useCallback(() => {
        setOpen(false);
        resolverRef.current?.(null);
        resolverRef.current = null;
    }, []);

    return {
        openPrompt,
        promptDialogProps: { open, config, onConfirm, onCancel },
    };
}

// ─── Component ──────────────────────────────────────────────────

interface PromptDialogProps {
    open: boolean;
    config: PromptDialogConfig | null;
    onConfirm: (values: Record<string, string>) => void;
    onCancel: () => void;
}

export function PromptDialog({ open, config, onConfirm, onCancel }: PromptDialogProps) {
    const [values, setValues] = useState<Record<string, string>>({});
    const initializedFor = useRef<string | null>(null);

    // Reset values when a new config arrives
    const configKey = config ? config.title + config.fields.map((f) => f.key).join(',') : '';
    if (configKey && initializedFor.current !== configKey) {
        initializedFor.current = configKey;
        const defaults: Record<string, string> = {};
        config?.fields.forEach((f) => {
            defaults[f.key] = f.defaultValue ?? '';
        });
        setValues(defaults);
    }

    if (!config) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(values);
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>{config.title}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {config.fields.map((field) => (
                            <div key={field.key} className="grid gap-1.5">
                                <Label htmlFor={`prompt-${field.key}`}>{field.label}</Label>
                                <Input
                                    id={`prompt-${field.key}`}
                                    value={values[field.key] ?? ''}
                                    placeholder={field.placeholder}
                                    onChange={(e) =>
                                        setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                                    }
                                    autoFocus={field === config.fields[0]}
                                />
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit">OK</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
