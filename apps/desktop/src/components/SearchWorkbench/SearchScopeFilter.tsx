import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { BookOpen, FileText, Lightbulb, Library } from 'lucide-react';

export type SearchScope = 'all' | 'idea' | 'chapter' | 'novel';

interface SearchScopeFilterProps {
    activeScope: SearchScope;
    onScopeChange: (scope: SearchScope) => void;
    theme: 'dark' | 'light';
}

export default function SearchScopeFilter({ activeScope, onScopeChange, theme }: SearchScopeFilterProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const scopes: { id: SearchScope; label: string; icon: React.ElementType }[] = [
        { id: 'all', label: t('search.scope.all', '全部'), icon: Library },
        { id: 'idea', label: t('search.scope.idea', '灵感'), icon: Lightbulb },
        { id: 'chapter', label: t('search.scope.chapter', '章节'), icon: FileText },
        { id: 'novel', label: t('search.scope.novel', '小说'), icon: BookOpen },
    ];

    return (
        <div className="flex p-2 gap-1 overflow-x-auto scrollbar-none">
            {scopes.map(scope => (
                <button
                    key={scope.id}
                    onClick={() => onScopeChange(scope.id)}
                    className={clsx(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                        activeScope === scope.id
                            ? "bg-purple-600 text-white shadow-sm"
                            : isDark
                                ? "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
                                : "bg-gray-100 text-neutral-600 hover:bg-gray-200 hover:text-neutral-900"
                    )}
                >
                    <scope.icon className="w-3.5 h-3.5" />
                    <span>{scope.label}</span>
                </button>
            ))}
        </div>
    );
}
