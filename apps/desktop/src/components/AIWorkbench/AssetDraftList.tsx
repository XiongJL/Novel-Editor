import { clsx } from 'clsx';
import type { ReactNode } from 'react';

type Props = {
    title: string;
    count: number;
    theme: 'dark' | 'light';
    children: ReactNode;
    emptyText?: string;
};

export function AssetDraftList({ title, count, theme, children, emptyText }: Props) {
    const isDark = theme === 'dark';
    return (
        <section
            className={clsx(
                'rounded-xl border p-3 space-y-2',
                isDark ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-white',
            )}
        >
            <div className="flex items-center justify-between">
                <h4 className={clsx('text-xs font-semibold uppercase tracking-wide', isDark ? 'text-neutral-300' : 'text-gray-700')}>
                    {title}
                </h4>
                <span className={clsx('text-[11px]', isDark ? 'text-neutral-500' : 'text-gray-500')}>{count}</span>
            </div>
            {count === 0 ? (
                <div className={clsx('text-xs', isDark ? 'text-neutral-500' : 'text-gray-500')}>{emptyText || ''}</div>
            ) : (
                <div className="space-y-2">{children}</div>
            )}
        </section>
    );
}
