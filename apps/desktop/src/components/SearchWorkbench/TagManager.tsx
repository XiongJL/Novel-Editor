import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { X, Plus, Hash, Check, Search } from 'lucide-react';
import { Idea } from '../../types';

interface TagManagerProps {
    idea: Idea;
    onUpdate: (id: string, updates: Partial<Idea>) => void;
    theme: 'dark' | 'light';
    allTags?: string[];
}

export default function TagManager({ idea, onUpdate, theme, allTags = [] }: TagManagerProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const currentTags = idea.tags || [];

    // Close when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    // Auto focus input when opening
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const toggleTag = (tag: string) => {
        const isSelected = currentTags.includes(tag);
        if (isSelected) {
            onUpdate(idea.id, { tags: currentTags.filter(t => t !== tag) });
        } else {
            onUpdate(idea.id, { tags: [...currentTags, tag] });
        }
    };

    const handleCreateTag = () => {
        const trimmed = inputValue.trim();
        if (trimmed && !currentTags.includes(trimmed)) {
            onUpdate(idea.id, { tags: [...currentTags, trimmed] });
            setInputValue(''); // Clear input after creating
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const trimmed = inputValue.trim();
            if (!trimmed) return;

            // Check if exact match exists in filtered suggestions
            const existingTag = allTags.find(t => t.toLowerCase() === trimmed.toLowerCase());

            if (existingTag) {
                toggleTag(existingTag);
            } else {
                handleCreateTag();
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    const filteredSuggestions = allTags.filter(t =>
        t.toLowerCase().includes(inputValue.toLowerCase())
    );

    const sortedSuggestions = [...filteredSuggestions].sort();

    return (
        <div className="relative inline-flex flex-wrap items-center gap-1.5" ref={containerRef}>
            {/* Display Tags */}
            {currentTags.map(tag => (
                <span
                    key={tag}
                    className={clsx(
                        "group flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full transition-colors cursor-default",
                        isDark ? "bg-white/10 text-neutral-300" : "bg-gray-100 text-gray-600"
                    )}
                >
                    <Hash className="w-2.5 h-2.5 opacity-50" />
                    {tag}
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                    >
                        <X className="w-2.5 h-2.5" />
                    </button>
                </span>
            ))}

            {/* Add Button / Trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-dashed transition-colors",
                    isDark
                        ? "border-white/20 text-neutral-500 hover:text-neutral-300 hover:border-white/40"
                        : "border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400",
                    isOpen && (isDark ? "bg-white/10 text-white border-white/40" : "bg-gray-100 text-gray-800 border-gray-400")
                )}
            >
                <Plus className="w-2.5 h-2.5" />
                <span>{t('tag.add', 'Tag')}</span>
            </button>

            {/* WeChat Style Popover */}
            {isOpen && (
                <div className={clsx(
                    "absolute top-full left-0 mt-2 w-48 rounded-lg shadow-xl border z-50 overflow-hidden flex flex-col",
                    isDark ? "bg-[#1f1f25] border-white/10" : "bg-white border-gray-200"
                )}>
                    {/* Search Header */}
                    <div className={clsx("p-2 border-b", isDark ? "border-white/5" : "border-gray-100")}>
                        <div className={clsx(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs",
                            isDark ? "bg-black/20" : "bg-gray-100"
                        )}>
                            <Search className={clsx("w-3.5 h-3.5", isDark ? "text-neutral-500" : "text-neutral-400")} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className={clsx(
                                    "flex-1 bg-transparent outline-none min-w-0",
                                    isDark ? "text-white placeholder-neutral-600" : "text-gray-900 placeholder-gray-400"
                                )}
                                placeholder={t('tag.searchOrCreate', 'Search or create...')}
                            />
                        </div>
                    </div>

                    {/* Create New Option */}
                    {inputValue && !allTags.map(t => t.toLowerCase()).includes(inputValue.toLowerCase()) && (
                        <div
                            onClick={handleCreateTag}
                            className={clsx(
                                "px-3 py-2 text-xs border-b cursor-pointer transition-colors flex items-center gap-2",
                                isDark ? "border-white/5 hover:bg-white/5 text-green-400" : "border-gray-100 hover:bg-gray-50 text-green-600"
                            )}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{t('tag.create', 'Create')} "{inputValue}"</span>
                        </div>
                    )}

                    {/* Tag List */}
                    <div className="max-h-48 overflow-y-auto scrollbar-thin">
                        {sortedSuggestions.map(tag => {
                            const isSelected = currentTags.includes(tag);
                            return (
                                <div
                                    key={tag}
                                    onClick={() => toggleTag(tag)}
                                    className={clsx(
                                        "px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors",
                                        isDark ? "hover:bg-white/5 text-neutral-300" : "hover:bg-gray-50 text-neutral-700",
                                        isSelected && (isDark ? "bg-white/5" : "bg-gray-50")
                                    )}
                                >
                                    <span>{tag}</span>
                                    {isSelected && (
                                        <Check className="w-3.5 h-3.5 text-green-500" />
                                    )}
                                </div>
                            );
                        })}
                        {sortedSuggestions.length === 0 && !inputValue && (
                            <div className={clsx("p-4 text-center text-xs opacity-50", isDark ? "text-neutral-500" : "text-gray-400")}>
                                {t('tag.noTags', 'No tags yet')}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
