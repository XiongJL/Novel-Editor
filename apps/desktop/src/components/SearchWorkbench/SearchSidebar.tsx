import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';

interface SearchSidebarProps {
    theme: 'dark' | 'light';
    onClose?: () => void;
}

export default function SearchSidebar({ theme, onClose }: SearchSidebarProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <div className={clsx(
            "flex flex-col h-full w-full",
            isDark ? "bg-[#0F0F13]" : "bg-gray-50"
        )}>
            {/* Header */}
            <div className={clsx(
                "p-4 border-b flex items-center justify-between",
                isDark ? "border-white/5" : "border-gray-200"
            )}>
                <span className={clsx(
                    "text-xs font-bold uppercase tracking-wider",
                    isDark ? "text-neutral-500" : "text-neutral-400"
                )}>
                    {t('sidebar.search', 'Search')}
                </span>
                {onClose && (
                    <button onClick={onClose} className={clsx("p-1 rounded", isDark ? "hover:bg-white/10" : "hover:bg-black/5")}>
                        <Search className="w-4 h-4 opacity-50 rotate-45" />
                    </button>
                )}
            </div>

            {/* Search Input */}
            <div className="p-4">
                <div className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors border",
                    isDark
                        ? "bg-black/20 border-white/10 text-white focus-within:border-white/20"
                        : "bg-white border-gray-200 text-neutral-900 focus-within:border-gray-300"
                )}>
                    <Search className={clsx("w-4 h-4", isDark ? "text-neutral-500" : "text-neutral-400")} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('search.placeholder', 'Searching...')}
                        className="bg-transparent border-none outline-none w-full text-sm placeholder-opacity-50"
                        autoFocus
                    />
                </div>
            </div>

            {/* Placeholder Content */}
            <div className={clsx(
                "flex-1 flex flex-col items-center justify-center p-8 text-center opacity-50 space-y-2",
                isDark ? "text-neutral-500" : "text-neutral-400"
            )}>
                <p className="text-sm">{t('search.empty', 'Search functionality coming soon...')}</p>
            </div>
        </div>
    );
}
