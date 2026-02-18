/**
 * Shared formatting utilities for the client-side UI.
 * Eliminates duplication of money(), formatDate(), num() across
 * order-workspace, finance-manager, and logistics-manager.
 */

/** Format a number as USD currency string, e.g. "$1,234.56" → simplified to "$1234.56". */
export function money(value: number): string {
    return `$${value.toFixed(2)}`;
}

/** Format an ISO date string for display, or return '-' if null/empty. */
export function formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString();
}

/** Safely parse an unknown value to a finite number, defaulting to 0. */
export function num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
