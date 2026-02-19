'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, FileText, Truck, DollarSign, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DashboardNav({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
    const pathname = usePathname();
    const t = useTranslations('Dashboard');

    const items = [
        {
            title: t('overview'),
            href: '/dashboard',
            icon: LayoutDashboard,
        },
        {
            title: t('tariffs'),
            href: '/dashboard/tariffs',
            icon: FileText,
        },
        {
            title: t('logistics'),
            href: '/dashboard/logistics',
            icon: Truck,
        },
        {
            title: t('finance'),
            href: '/dashboard/finance',
            icon: DollarSign,
        },
    ];

    return (
        <nav
            className={cn('flex items-center space-x-4 lg:space-x-6', className)}
            {...props}
        >
            {items.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                        'text-sm font-medium transition-colors hover:text-primary flex items-center gap-2',
                        pathname === item.href
                            ? 'text-primary'
                            : 'text-muted-foreground'
                    )}
                >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                </Link>
            ))}
            <div className="ml-auto flex items-center space-x-4">
                <Link
                    href="/"
                    className={cn(
                        "text-sm font-medium text-muted-foreground transition-colors hover:text-primary flex items-center gap-2 ml-4 pl-4 border-l"
                    )}
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('backToConverter')}
                </Link>
            </div>
        </nav>
    );
}
