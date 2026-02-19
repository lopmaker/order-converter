'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();

    const handleLocaleChange = (newLocale: string) => {
        // Simple switch: Replace the locale part of the path (assuming /[locale]/...) 
        if (!pathname) return;
        const segments = pathname.split('/');
        // The locale is typically the first segment after the domain, e.g., "" / "en" / "dashboard"
        if (segments.length > 1) {
            segments[1] = newLocale;
        }
        router.replace(segments.join('/'));
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Globe className="h-4 w-4" />
                    <span className="sr-only">Switch language</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleLocaleChange('en')}>
                    English
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleLocaleChange('zh')}>
                    中文 (Chinese)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
