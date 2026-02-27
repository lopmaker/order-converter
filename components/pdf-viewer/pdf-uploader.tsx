'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/components/locale-provider';
import { Button } from '@/components/ui/button';

interface PdfUploaderProps {
  onFilesSelect: (files: File[]) => void;
  // selectedFile: File | null; // No longer needed here as state moves up
  // onClearFile: () => void;   // Managed by parent or sidebar
}

export function PdfUploader({ onFilesSelect }: PdfUploaderProps) {
  const { t } = useI18n();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelect(acceptedFiles);
      }
    },
    [onFilesSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: true, // Enable multiple
  });

  return (
    <div className="h-full w-full p-6 flex items-center justify-center bg-muted/10">
      <Card
        {...getRootProps()}
        className={`w-full max-w-md p-12 border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 hover:border-primary/50 hover:bg-primary/5
          ${isDragActive ? 'border-primary bg-primary/10 scale-102 ring-4 ring-primary/20' : 'border-muted-foreground/25'}
        `}
      >
        <input {...getInputProps()} />
        <div className="h-16 w-16 mb-6 rounded-full bg-primary/10 flex items-center justify-center">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold tracking-tight mb-2">
          {isDragActive
            ? t('HomePage.dropPdfsHere', 'Drop PDFs here')
            : t('HomePage.uploadTitle', 'Upload Order PDFs')}
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          {t(
            'HomePage.uploadSubtitle',
            'Drag and drop multiple PO files here, or click to browse.'
          )}
        </p>
        <Button variant={isDragActive ? 'default' : 'outline'}>
          {t('HomePage.selectFiles', 'Select Files')}
        </Button>
      </Card>
    </div>
  );
}
