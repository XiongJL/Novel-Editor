import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Tag, Star, Check, X, ChevronDown, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface IdeaAdvancedFilterProps {
    onFilterChange: (filters: IdeaFilters) => void;
    theme: 'dark' | 'light';
    allTags: string[];
}

export interface IdeaFilters {
    novelId?: string;
    chapterId?: string;
    tags: string[];
    starredOnly: boolean;
    dateRange?: 'all' | 'week' | 'month';
}

export default function IdeaAdvancedFilter({ onFilterChange, theme, allTags }: IdeaAdvancedFilterProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [isTagOpen, setIsTagOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const tagContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [filters, setFilters] = useState<IdeaFilters>({
        tags: [],
        starredOnly: false,
        dateRange: 'all'
    });

    // Close when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (tagContainerRef.current && !tagContainerRef.current.contains(event.target as Node)) {
                setIsTagOpen(false);
                setSearchQuery(''); // Clear search on close
            }
        }
        if (isTagOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            // Focus input when opening
            setTimeout(() => inputRef.current?.focus(), 50);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isTagOpen]);

    const updateFilters = (newFilters: Partial<IdeaFilters>) => {
        const updated = { ...filters, ...newFilters };
        setFilters(updated);
        onFilterChange(updated);
    };

    const toggleTag = (tag: string) => {
        if (filters.tags.includes(tag)) {
            updateFilters({ tags: filters.tags.filter(t => t !== tag) });
        } else {
            updateFilters({ tags: [...filters.tags, tag] });
        }
    };

    const filteredTags = allTags.filter(tag =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className={clsx(
            "p-3 border-b text-sm space-y-3",
            isDark ? "bg-[#141419] border-white/5" : "bg-gray-50 border-gray-200"
        )}>
            {/* Row 2: Toggles - Moved directly under header since Context Filter is removed */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => updateFilters({ starredOnly: !filters.starredOnly })}
                    className={clsx(
                        "flex items-center gap-1.5 px-2 py-1 rounded transition-colors border",
                        filters.starredOnly
                            ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/50"
                            : isDark ? "border-transparent text-neutral-500 hover:bg-white/5" : "border-transparent text-neutral-500 hover:bg-black/5"
                    )}
                >
                    <Star className={clsx("w-3.5 h-3.5", filters.starredOnly && "fill-current")} />
                    <span className="text-xs">{t('search.filter.starredOnly', '仅收藏')}</span>
                </button>

                {/* Custom Tag Dropdown */}
                <div className="relative" ref={tagContainerRef}>
                    <button
                        onClick={() => setIsTagOpen(!isTagOpen)}
                        className={clsx(
                            "flex items-center gap-1.5 px-2 py-1 rounded transition-colors border text-xs",
                            filters.tags.length > 0
                                ? (isDark ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-purple-100 text-purple-700 border-purple-200")
                                : (isDark ? "border-transparent text-neutral-500 hover:bg-white/5" : "border-transparent text-neutral-500 hover:bg-black/5")
                        )}
                    >
                        <Tag className="w-3.5 h-3.5" />
                        <span>
                            {filters.tags.length > 0
                                ? `${filters.tags.length} ${t('common.selected', 'Selected')}`
                                : t('tag.filter', 'Tags')}
                        </span>
                        <ChevronDown className={clsx(
                            "w-3 h-3 transition-transform duration-200",
                            isTagOpen ? "rotate-180" : ""
                        )} />
                    </button>

                    <AnimatePresence>
                        {isTagOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                transition={{ duration: 0.1 }}
                                className={clsx(
                                    "absolute top-full right-0 mt-2 w-48 rounded-lg shadow-xl border z-50 overflow-hidden flex flex-col max-h-60",
                                    isDark ? "bg-[#1f1f25] border-white/10" : "bg-white border-gray-200"
                                )}
                            >
                                <div className={clsx(
                                    "p-2 border-b flex items-center gap-2",
                                    isDark ? "border-white/5" : "border-gray-100"
                                )}>
                                    <div className={clsx(
                                        "flex items-center gap-1.5 flex-1 rounded px-2 py-1.5 transition-colors",
                                        isDark ? "bg-black/20" : "bg-gray-100"
                                    )}>
                                        <Search className={clsx("w-3.5 h-3.5", isDark ? "text-neutral-500" : "text-neutral-400")} />
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            placeholder={t('tag.search', 'Search tags...')}
                                            className={clsx(
                                                "bg-transparent outline-none w-full text-xs min-w-0",
                                                isDark ? "text-white placeholder-neutral-600" : "text-gray-900 placeholder-gray-400"
                                            )}
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                        />
                                    </div>

                                    {filters.tags.length > 0 && (
                                        <button
                                            onClick={() => updateFilters({ tags: [] })}
                                            className="text-[10px] hover:text-red-500 transition-colors whitespace-nowrap opacity-70 hover:opacity-100"
                                            title={t('common.clear')}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                <div className="overflow-y-auto p-1 scrollbar-thin">
                                    {filteredTags.length === 0 ? (
                                        <div className="p-4 text-center text-xs opacity-50">
                                            {searchQuery ? t('tag.notFound', 'No matching tags') : t('tag.noTags', 'No tags available')}
                                        </div>
                                    ) : (
                                        filteredTags.map(tag => {
                                            const isSelected = filters.tags.includes(tag);
                                            return (
                                                <button
                                                    key={tag}
                                                    onClick={() => toggleTag(tag)}
                                                    className={clsx(
                                                        "w-full text-left px-2 py-1.5 text-xs rounded flex items-center justify-between transition-colors mb-0.5 last:mb-0",
                                                        isSelected
                                                            ? (isDark ? "bg-purple-500/20 text-purple-300" : "bg-purple-50 text-purple-700")
                                                            : (isDark ? "text-neutral-400 hover:bg-white/5 hover:text-neutral-200" : "text-neutral-600 hover:bg-gray-50 hover:text-neutral-900")
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <Tag className="w-3 h-3 opacity-50" />
                                                        <span className="truncate">{tag}</span>
                                                    </div>
                                                    {isSelected && <Check className="w-3 h-3" />}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Active Filters Display (Inline) */}
            {filters.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {filters.tags.map(tag => (
                        <span key={tag} className={clsx(
                            "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors group cursor-pointer",
                            isDark ? "bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400" : "bg-purple-50 text-purple-600 border border-purple-100 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        )}
                            onClick={() => toggleTag(tag)}
                            title={t('common.remove', 'Click to remove')}
                        >
                            <span>#{tag}</span>
                            <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

