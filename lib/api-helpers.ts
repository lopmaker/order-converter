/**
 * Shared API route helpers — avoids copy-pasting the same utility
 * functions across every route.ts file.
 */

/** Safely extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Generate a unique code with a given prefix.
 * Format: PREFIX-YYYYMMDDHHMMSS-XXXX
 */
export function createDefaultCode(prefix: string): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${stamp}-${suffix}`;
}
