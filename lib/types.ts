import type { ExtractedOrderData } from '@/lib/parser';

export interface OrderFile {
    id: string;
    file?: File;
    fileName?: string;
    fileSize?: number;
    status: 'idle' | 'processing' | 'completed' | 'error';
    data?: ExtractedOrderData;
    error?: string;
    processingStep?: string;
    originalText?: string;
}
