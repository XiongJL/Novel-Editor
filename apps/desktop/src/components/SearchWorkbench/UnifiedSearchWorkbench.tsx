import { useState, useMemo, useEffect } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, X, Plus } from 'lucide-react';
import SearchResultsList from './SearchResultsList';
import IdeaAdvancedFilter, { IdeaFilters } from './IdeaAdvancedFilter';
import { Idea } from '../../types';

interface UnifiedSearchWorkbenchProps {
    ideas: Idea[];
    novelId: string;
    onJump: (item: any) => void;
    onUpdateIdea: (id: string, data: Partial<Idea>) => void;
    onDeleteIdea?: (id: string) => void;
    onToggleStar?: (id: string, isStarred: boolean) => void;
    onCreateIdea?: () => void;
    theme: 'dark' | 'light';
    onClose?: () => void;
    shakingIdeaId?: string | null;
    highlightedIdeaId?: string | null;
}

export default function UnifiedSearchWorkbench({ ideas, novelId, onJump, onUpdateIdea, onDeleteIdea, onToggleStar, onCreateIdea, theme, onClose, shakingIdeaId, highlightedIdeaId }: UnifiedSearchWorkbenchProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [query, setQuery] = useState('');
    const [allTags, setAllTags] = useState<string[]>([]);
    const [advancedFilters, setAdvancedFilters] = useState<IdeaFilters>({
        tags: [],
        starredOnly: false,
        dateRange: 'all'
    });

    useEffect(() => {
        // Fetch all tags
        const loadTags = async () => {
            try {
                // @ts-ignore
                const tags = await window.db.getAllTags(novelId);
                setAllTags(tags);
            } catch (e) {
                console.error('Failed to load tags', e);
            }
        };
        loadTags();
    }, [ideas, novelId]); // Reload tags when ideas change

    // Filtering Logic
    const filteredResults = useMemo(() => {
        const q = query.trim().toLowerCase();

        // Filter Ideas
        const filteredIdeas = ideas.filter(idea => {
            // 1. Text Search
            const matchContent = idea.content.toLowerCase().includes(q);
            const matchQuote = idea.quote?.toLowerCase().includes(q);
            if (!matchContent && !matchQuote) return false;

            // 2. Advanced Filters
            if (advancedFilters.starredOnly && !idea.isStarred) return false;

            // Tag filtering
            if (advancedFilters.tags.length > 0) {
                const ideaTags = idea.tags || [];
                const hasAllTags = advancedFilters.tags.every(tag => ideaTags.includes(tag));
                if (!hasAllTags) return false;
            }

            return true;
        });

        // Sorting: Starred first, then Newest first (mimic IdeaList)
        filteredIdeas.sort((a, b) => {
            if (a.isStarred === b.isStarred) {
                return b.timestamp - a.timestamp;
            }
            return a.isStarred ? -1 : 1;
        });

        return {
            ideas: filteredIdeas,
            chapters: [],
            novels: []
        };
    }, [ideas, query, advancedFilters]);

    return (
        <div className={clsx(
            "flex flex-col h-full w-full transition-colors duration-300",
            isDark ? "bg-[#0F0F13]" : "bg-gray-50"
        )}>
            {/* Header */}
            <div className={clsx(
                "p-4 border-b flex flex-col gap-3",
                isDark ? "border-white/5" : "border-gray-200"
            )}>
                <div className="flex items-center justify-between">
                    <span className={clsx(
                        "text-xs font-bold uppercase tracking-wider",
                        isDark ? "text-neutral-500" : "text-neutral-400"
                    )}>
                        {t('sidebar.idea')}
                    </span>
                    <div className="flex items-center gap-1">
                        {onCreateIdea && (
                            <button
                                onClick={onCreateIdea}
                                className={clsx("p-1 rounded transition-colors", isDark ? "hover:bg-white/10 text-neutral-400 hover:text-white" : "hover:bg-black/5 text-neutral-500 hover:text-black")}
                                title={t('idea.create')}
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                        {onClose && (
                            <button onClick={onClose} className={clsx("p-1 rounded", isDark ? "hover:bg-white/10" : "hover:bg-black/5")}>
                                <X className="w-4 h-4 opacity-50" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                    <SearchIcon className={clsx(
                        "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                        isDark ? "text-neutral-500" : "text-neutral-400"
                    )} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('idea.searchPlaceholder')}
                        className={clsx(
                            "w-full pl-9 pr-3 py-2 text-sm rounded-lg border outline-none transition-all",
                            isDark
                                ? "bg-black/20 border-white/5 focus:border-purple-500/50 text-white placeholder-white/20"
                                : "bg-white border-gray-200 focus:border-purple-500/50 text-gray-900 placeholder-gray-400"
                        )}
                        autoFocus
                    />
                </div>
            </div>

            {/* Filter */}
            <div className={clsx("border-b", isDark ? "border-white/5" : "border-gray-200")}>
                <IdeaAdvancedFilter
                    onFilterChange={setAdvancedFilters}
                    theme={theme}
                    allTags={allTags}
                />
            </div>

            {/* Results */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <SearchResultsList
                    results={filteredResults}
                    onJump={(item) => onJump(item)}
                    onUpdateIdea={onUpdateIdea}
                    onDeleteIdea={onDeleteIdea}
                    onToggleStar={onToggleStar}
                    theme={theme}
                    allTags={allTags}
                    shakingIdeaId={shakingIdeaId}
                    highlightedIdeaId={highlightedIdeaId}
                />
            </div>
        </div>
    );
}
