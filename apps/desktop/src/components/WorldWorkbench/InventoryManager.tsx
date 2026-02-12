import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plus, Trash2, Package, Search, Edit3 } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { ItemOwnership, Item } from '../../types';

interface InventoryManagerProps {
    characterId: string;
    novelId: string;
    theme: 'dark' | 'light';
}

export default function InventoryManager({ characterId, novelId, theme }: InventoryManagerProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [ownedItems, setOwnedItems] = useState<ItemOwnership[]>([]);
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [editingNote, setEditingNote] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');

    const loadOwnedItems = useCallback(async () => {
        try {
            const data = await window.db.getCharacterItems(characterId);
            setOwnedItems(data);
        } catch (e) {
            console.error('Failed to load character items:', e);
        }
    }, [characterId]);

    const loadAllItems = useCallback(async () => {
        try {
            const data = await window.db.getItems(novelId);
            setAllItems(data);
        } catch (e) {
            console.error('Failed to load items:', e);
        }
    }, [novelId]);

    useEffect(() => {
        loadOwnedItems();
        loadAllItems();
    }, [loadOwnedItems, loadAllItems]);

    const ownedItemIds = new Set(ownedItems.map(o => o.itemId));
    const availableItems = allItems
        .filter(item => !ownedItemIds.has(item.id))
        .filter(item => !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const handleAddItem = async (itemId: string) => {
        try {
            const ownership = await window.db.addItemToCharacter({ characterId, itemId });
            setOwnedItems(prev => [...prev, ownership]);
            setSearchQuery('');
            setIsSearchOpen(false);
        } catch (e) {
            console.error('Failed to add item:', e);
        }
    };

    const handleRemoveItem = async (ownershipId: string) => {
        try {
            await window.db.removeItemFromCharacter(ownershipId);
            setOwnedItems(prev => prev.filter(o => o.id !== ownershipId));
        } catch (e) {
            console.error('Failed to remove item:', e);
        }
    };

    const handleSaveNote = async (ownershipId: string) => {
        try {
            const updated = await window.db.updateItemOwnership(ownershipId, { note: noteText.trim() || undefined });
            setOwnedItems(prev => prev.map(o => o.id === ownershipId ? { ...o, ...updated } : o));
            setEditingNote(null);
            setNoteText('');
        } catch (e) {
            console.error('Failed to update note:', e);
        }
    };

    const inputClass = clsx(
        "px-3 py-2 rounded-lg text-sm border outline-none transition-colors",
        isDark
            ? "bg-white/5 border-white/10 text-white placeholder-neutral-500 focus:border-indigo-500/50"
            : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-indigo-500"
    );

    const getItemTypeIcon = (type: string) => {
        switch (type) {
            case 'skill': return '⚡';
            case 'location': return '📍';
            default: return '📦';
        }
    };

    return (
        <div className="min-h-full">
            {/* Sticky Header */}
            <div className={clsx(
                "sticky top-0 z-10 px-6 py-3 border-b flex justify-end",
                isDark ? "bg-[#1a1a20] border-white/5" : "bg-white border-gray-100"
            )}>
                <button
                    onClick={() => setIsSearchOpen(!isSearchOpen)}
                    className={clsx(
                        "text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors",
                        isDark ? "text-indigo-400 hover:bg-white/5" : "text-indigo-600 hover:bg-black/5"
                    )}
                >
                    <Plus className="w-3 h-3" />
                    {t('world.addItemToChar', '添加物品')}
                </button>
            </div>

            <div className="p-6 space-y-3">
                {/* Search Panel */}
                {isSearchOpen && (
                    <div className={clsx(
                        "p-3 rounded-lg border space-y-2",
                        isDark ? "bg-white/[0.02] border-white/10" : "bg-gray-50 border-gray-200"
                    )}>
                        <div className="relative">
                            <Search className={clsx("absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5", isDark ? "text-neutral-500" : "text-neutral-400")} />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className={clsx(inputClass, "w-full pl-8")}
                                placeholder={t('world.searchItem', '搜索物品...')}
                                autoFocus
                            />
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {availableItems.length === 0 ? (
                                <p className={clsx("text-xs py-2 text-center", isDark ? "text-neutral-600" : "text-neutral-400")}>
                                    {searchQuery ? '无匹配物品' : '所有物品已添加'}
                                </p>
                            ) : (
                                availableItems.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleAddItem(item.id)}
                                        className={clsx(
                                            "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors",
                                            isDark ? "hover:bg-white/5 text-neutral-300" : "hover:bg-black/5 text-neutral-700"
                                        )}
                                    >
                                        <span>{getItemTypeIcon(item.type)}</span>
                                        <span className="truncate">{item.name}</span>
                                        <span className={clsx("ml-auto text-[10px]", isDark ? "text-neutral-600" : "text-neutral-400")}>
                                            {t(`world.itemTypes.${item.type}`, item.type)}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Owned Items List */}
                {ownedItems.length === 0 && !isSearchOpen ? (
                    <div className={clsx("text-center py-8", isDark ? "text-neutral-600" : "text-neutral-400")}>
                        <Package className="w-7 h-7 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">{t('world.noInventory', '暂无物品')}</p>
                        <p className="text-[10px] mt-1 opacity-60">{t('world.addInventoryHint', '搜索物品库添加')}</p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {ownedItems.map(ownership => {
                            const item = ownership.item;
                            if (!item) return null;
                            const isEditingNote = editingNote === ownership.id;
                            return (
                                <div
                                    key={ownership.id}
                                    className={clsx(
                                        "group px-3 py-2.5 rounded-lg transition-colors",
                                        isDark ? "hover:bg-white/5" : "hover:bg-black/5"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm">{getItemTypeIcon(item.type)}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className={clsx("text-sm truncate", isDark ? "text-neutral-200" : "text-neutral-800")}>
                                                {item.name}
                                            </div>
                                            {ownership.note && !isEditingNote && (
                                                <p className={clsx("text-[11px] mt-0.5 truncate", isDark ? "text-neutral-500" : "text-neutral-400")}>
                                                    {ownership.note}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditingNote(ownership.id); setNoteText(ownership.note || ''); }}
                                                className={clsx("p-1 rounded transition-colors opacity-0 group-hover:opacity-100", isDark ? "hover:bg-white/10 text-neutral-500" : "hover:bg-gray-100 text-neutral-400")}
                                                title={t('world.ownerNote', '持有备注')}
                                            >
                                                <Edit3 className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteTarget(ownership.id)}
                                                className={clsx("p-1 rounded transition-colors opacity-0 group-hover:opacity-100", isDark ? "hover:bg-red-500/20 text-neutral-500" : "hover:bg-red-50 text-neutral-400")}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Note Editing */}
                                    {isEditingNote && (
                                        <div className="mt-2 flex gap-2">
                                            <input
                                                value={noteText}
                                                onChange={e => setNoteText(e.target.value)}
                                                className={clsx(inputClass, "flex-1 text-xs")}
                                                placeholder={t('world.ownerNotePlaceholder', '如：已损坏...')}
                                                autoFocus
                                                onKeyDown={e => { if (e.key === 'Enter') handleSaveNote(ownership.id); if (e.key === 'Escape') setEditingNote(null); }}
                                            />
                                            <button
                                                onClick={() => handleSaveNote(ownership.id)}
                                                className="text-[10px] px-2 py-1 rounded bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                                            >
                                                {t('common.save')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <ConfirmModal
                    isOpen={!!deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={() => { if (deleteTarget) { handleRemoveItem(deleteTarget); setDeleteTarget(null); } }}
                    title={t('common.delete')}
                    message={t('world.confirmRemoveItem', '确定移除此物品？')}
                    theme={theme}
                />
            </div>
        </div>
    );
}
