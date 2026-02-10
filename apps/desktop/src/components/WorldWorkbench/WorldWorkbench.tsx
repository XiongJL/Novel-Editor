import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Users, Package, Plus, RefreshCw } from 'lucide-react';
import CharacterList from './CharacterList';
import CharacterEditor from './CharacterEditor';
import ItemLibrary from './ItemLibrary';
import { Character, Item } from '../../types';

type WorldTab = 'characters' | 'items';

interface WorldWorkbenchProps {
    novelId: string;
    theme: 'dark' | 'light';
}

export default function WorldWorkbench({ novelId, theme }: WorldWorkbenchProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [activeTab, setActiveTab] = useState<WorldTab>('characters');
    const [characters, setCharacters] = useState<Character[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    const loadCharacters = useCallback(async () => {
        try {
            const data = await window.db.getCharacters(novelId);
            setCharacters(data);
        } catch (e) {
            console.error('Failed to load characters:', e);
        }
    }, [novelId]);

    const loadItems = useCallback(async () => {
        try {
            const data = await window.db.getItems(novelId);
            setItems(data);
        } catch (e) {
            console.error('Failed to load items:', e);
        }
    }, [novelId]);

    useEffect(() => {
        setIsLoading(true);
        Promise.all([loadCharacters(), loadItems()]).finally(() => setIsLoading(false));
    }, [loadCharacters, loadItems]);

    const handleCreateCharacter = async () => {
        try {
            const newChar = await window.db.createCharacter({
                novelId,
                name: t('world.newCharacter', '新角色'),
                profile: '{}'
            });
            setCharacters(prev => [...prev, newChar]);
            setEditingCharacter(newChar);
            setIsEditorOpen(true);
        } catch (e) {
            console.error('Failed to create character:', e);
        }
    };

    const handleUpdateCharacter = async (id: string, data: Partial<Character>) => {
        try {
            const updated = await window.db.updateCharacter(id, data);
            setCharacters(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
            setEditingCharacter(prev => prev?.id === id ? { ...prev, ...updated } : prev);
        } catch (e) {
            console.error('Failed to update character:', e);
        }
    };

    const handleDeleteCharacter = async (id: string) => {
        try {
            await window.db.deleteCharacter(id);
            setCharacters(prev => prev.filter(c => c.id !== id));
            if (editingCharacter?.id === id) {
                setIsEditorOpen(false);
                setEditingCharacter(null);
            }
        } catch (e) {
            console.error('Failed to delete character:', e);
        }
    };

    const handleCreateItem = async () => {
        try {
            const newItem = await window.db.createItem({
                novelId,
                name: t('world.newItem', '新物品'),
                type: 'item',
                profile: '{}'
            });
            setItems(prev => [...prev, newItem]);
        } catch (e) {
            console.error('Failed to create item:', e);
        }
    };

    const handleUpdateItem = async (id: string, data: Partial<Item>) => {
        try {
            const updated = await window.db.updateItem(id, data);
            setItems(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
        } catch (e) {
            console.error('Failed to update item:', e);
        }
    };

    const handleDeleteItem = async (id: string) => {
        try {
            await window.db.deleteItem(id);
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (e) {
            console.error('Failed to delete item:', e);
        }
    };

    const tabs: { id: WorldTab; icon: React.ElementType; label: string; count: number }[] = [
        { id: 'characters', icon: Users, label: t('world.characters', '角色'), count: characters.length },
        { id: 'items', icon: Package, label: t('world.items', '物品'), count: items.length },
    ];

    return (
        <div className={clsx(
            "flex flex-col h-full transition-colors duration-300",
            isDark ? "bg-[#0F0F13]" : "bg-gray-50"
        )}>
            {/* Header */}
            <div className={clsx("p-4 border-b flex items-center justify-between", isDark ? "border-white/5" : "border-gray-200")}>
                <h2 className={clsx("text-sm font-medium uppercase tracking-wider flex items-center gap-2", isDark ? "text-neutral-400" : "text-neutral-500")}>
                    <Users className="w-4 h-4" />
                    {t('world.title', '世界观')}
                </h2>
                <button
                    onClick={activeTab === 'characters' ? handleCreateCharacter : handleCreateItem}
                    className={clsx("p-1 rounded transition-colors", isDark ? "hover:bg-white/10 text-neutral-400 hover:text-white" : "hover:bg-black/5 text-neutral-500 hover:text-black")}
                    title={activeTab === 'characters' ? t('world.addCharacter', '新建角色') : t('world.addItem', '新建物品')}
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Tab Bar */}
            <div className={clsx("flex border-b px-2", isDark ? "border-white/5" : "border-gray-200")}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors",
                            activeTab === tab.id
                                ? (isDark ? "border-indigo-400 text-indigo-400" : "border-indigo-600 text-indigo-600")
                                : (isDark ? "border-transparent text-neutral-500 hover:text-neutral-300" : "border-transparent text-neutral-400 hover:text-neutral-700")
                        )}
                    >
                        <tab.icon className="w-3.5 h-3.5" />
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={clsx(
                                "text-[10px] px-1.5 py-0.5 rounded-full",
                                isDark ? "bg-white/10 text-neutral-400" : "bg-black/5 text-neutral-500"
                            )}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <RefreshCw className={clsx("w-5 h-5 animate-spin", isDark ? "text-neutral-600" : "text-neutral-300")} />
                    </div>
                ) : activeTab === 'characters' ? (
                    <CharacterList
                        characters={characters}
                        theme={theme}
                        onEdit={(c: Character) => { setEditingCharacter(c); setIsEditorOpen(true); }}
                        onDelete={handleDeleteCharacter}
                    />
                ) : (
                    <ItemLibrary
                        items={items}
                        theme={theme}
                        onUpdate={handleUpdateItem}
                        onDelete={handleDeleteItem}
                    />
                )}
            </div>

            {/* Character Editor Modal */}
            {isEditorOpen && editingCharacter && (
                <CharacterEditor
                    character={editingCharacter}
                    theme={theme}
                    onClose={() => { setIsEditorOpen(false); setEditingCharacter(null); }}
                    onSave={handleUpdateCharacter}
                    onDelete={handleDeleteCharacter}
                />
            )}
        </div>
    );
}
