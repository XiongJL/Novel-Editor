import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Package, Trash2, ChevronRight } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Item } from '../../types';

interface ItemLibraryProps {
    items: Item[];
    theme: 'dark' | 'light';
    highlightId?: string | null;
    onEdit: (item: Item) => void;
    onDelete: (id: string) => void;
}

const typeIcons: Record<string, string> = {
    item: '🗡️',
    skill: '⚡',
    location: '🏔️',
};

const ItemRow = ({ item, isDark, onEdit, onDelete }: {
    item: Item;
    isDark: boolean;
    onEdit: (item: Item) => void;
    onDelete: (id: string) => void;
}) => {
    const { t } = useTranslation();

    const typeLabel = t(`world.itemTypes.${item.type}`, item.type);

    return (
        <div
            data-item-id={item.id}
            className={clsx(
                "group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200",
                isDark
                    ? "hover:bg-white/5 active:bg-white/10"
                    : "hover:bg-black/[0.03] active:bg-black/[0.06]"
            )}
            onClick={() => onEdit(item)}
        >
            {/* Icon */}
            <span className="text-lg flex-shrink-0">{item.icon || typeIcons[item.type] || '📦'}</span>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className={clsx("text-sm font-medium truncate", isDark ? "text-neutral-200" : "text-neutral-800")}>
                    {item.name}
                </div>
                <div className={clsx("text-xs truncate mt-0.5", isDark ? "text-neutral-500" : "text-neutral-400")}>
                    {typeLabel}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                    className={clsx(
                        "p-1 rounded transition-colors",
                        isDark ? "hover:bg-red-500/20 text-neutral-500 hover:text-red-400" : "hover:bg-red-50 text-neutral-400 hover:text-red-500"
                    )}
                    title={t('common.delete')}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className={clsx("w-4 h-4", isDark ? "text-neutral-600" : "text-neutral-300")} />
            </div>
        </div>
    );
};

export default function ItemLibrary({ items, theme, highlightId, onEdit, onDelete }: ItemLibraryProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Scroll to and highlight target item
    useEffect(() => {
        if (!highlightId || !containerRef.current) return;
        const el = containerRef.current.querySelector(`[data-item-id="${highlightId}"]`) as HTMLElement;
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'background-color 0.3s';
            el.style.backgroundColor = isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)';
            setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
        }
    }, [highlightId, isDark]);

    if (items.length === 0) {
        return (
            <div className={clsx("flex flex-col items-center justify-center py-12 px-4 text-center", isDark ? "text-neutral-600" : "text-neutral-400")}>
                <Package className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">{t('world.noItems', '暂无物品')}</p>
                <p className="text-xs mt-1 opacity-70">{t('world.addItemHint', '点击上方 + 创建物品')}</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="p-2 space-y-0.5">
            {items.map(item => (
                <ItemRow
                    key={item.id}
                    item={item}
                    isDark={isDark}
                    onEdit={onEdit}
                    onDelete={() => setDeletingItemId(item.id)}
                />
            ))}

            <ConfirmModal
                isOpen={!!deletingItemId}
                onClose={() => setDeletingItemId(null)}
                onConfirm={() => {
                    if (deletingItemId) onDelete(deletingItemId);
                    setDeletingItemId(null);
                }}
                title={t('common.delete')}
                message={t('world.confirmDeleteItem', '确定要删除这个物品吗？')}
                theme={theme}
            />
        </div>
    );
}
