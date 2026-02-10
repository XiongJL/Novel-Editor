import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Package, Trash2, Edit3, Check, X } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Item } from '../../types';

interface ItemLibraryProps {
    items: Item[];
    theme: 'dark' | 'light';
    onUpdate: (id: string, data: Partial<Item>) => void;
    onDelete: (id: string) => void;
}

const typeIcons: Record<string, string> = {
    item: '🗡️',
    skill: '⚡',
    location: '🏔️',
};

const ItemRow = ({ item, isDark, onUpdate, onDelete }: {
    item: Item;
    isDark: boolean;
    onUpdate: (id: string, data: Partial<Item>) => void;
    onDelete: (id: string) => void;
}) => {
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(item.name);
    const [editType, setEditType] = useState(item.type);

    const saveEdit = () => {
        if (editName.trim() && (editName !== item.name || editType !== item.type)) {
            onUpdate(item.id, { name: editName.trim(), type: editType });
        }
        setIsEditing(false);
    };

    const typeLabel = t(`world.itemTypes.${item.type}`, item.type);

    return (
        <div className={clsx(
            "group flex items-center gap-3 p-2.5 rounded-lg transition-colors",
            isDark ? "hover:bg-white/5" : "hover:bg-black/[0.03]"
        )}>
            {/* Icon */}
            <span className="text-lg flex-shrink-0">{item.icon || typeIcons[item.type] || '📦'}</span>

            {/* Content */}
            {isEditing ? (
                <div className="flex-1 flex items-center gap-2">
                    <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setIsEditing(false); }}
                        className={clsx(
                            "flex-1 px-2 py-1 rounded text-sm border outline-none",
                            isDark ? "bg-white/5 border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                        )}
                    />
                    <select
                        value={editType}
                        onChange={e => setEditType(e.target.value)}
                        className={clsx(
                            "px-2 py-1 rounded text-xs border outline-none",
                            isDark ? "bg-white/5 border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                        )}
                    >
                        <option value="item">{t('world.itemTypes.item', '物品')}</option>
                        <option value="skill">{t('world.itemTypes.skill', '技能')}</option>
                        <option value="location">{t('world.itemTypes.location', '地点')}</option>
                    </select>
                    <button onClick={saveEdit} className="p-1 text-green-500 hover:bg-green-500/10 rounded">
                        <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setIsEditing(false)} className={clsx("p-1 rounded", isDark ? "text-neutral-400 hover:bg-white/5" : "text-neutral-500 hover:bg-black/5")}>
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex-1 min-w-0">
                        <div className={clsx("text-sm truncate", isDark ? "text-neutral-200" : "text-neutral-800")}>
                            {item.name}
                        </div>
                        <div className={clsx("text-xs mt-0.5", isDark ? "text-neutral-500" : "text-neutral-400")}>
                            {typeLabel}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => { setEditName(item.name); setEditType(item.type); setIsEditing(true); }}
                            className={clsx("p-1 rounded transition-colors", isDark ? "hover:bg-white/10 text-neutral-500" : "hover:bg-black/5 text-neutral-400")}
                        >
                            <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => onDelete(item.id)}
                            className={clsx("p-1 rounded transition-colors", isDark ? "hover:bg-red-500/20 text-neutral-500 hover:text-red-400" : "hover:bg-red-50 text-neutral-400 hover:text-red-500")}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default function ItemLibrary({ items, theme, onUpdate, onDelete }: ItemLibraryProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

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
        <div className="p-2 space-y-0.5">
            {items.map(item => (
                <ItemRow key={item.id} item={item} isDark={isDark} onUpdate={onUpdate} onDelete={() => setDeletingItemId(item.id)} />
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
