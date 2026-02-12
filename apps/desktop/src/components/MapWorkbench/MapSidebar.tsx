import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plus, Trash2, ChevronRight, Map as MapIcon, Globe, Mountain, Image as ImageIcon, Edit3, Check, X } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { MapCanvas } from '../../types';

interface MapSidebarProps {
    novelId: string;
    theme: 'dark' | 'light';
    onSelectMap: (mapId: string) => void;
    activeMapId?: string | null;
}

const MAP_TYPE_ICONS: Record<string, typeof MapIcon> = {
    world: Globe,
    region: Mountain,
    scene: ImageIcon,
};

const MAP_TYPE_COLORS: Record<string, string> = {
    world: 'text-blue-400',
    region: 'text-emerald-400',
    scene: 'text-amber-400',
};

export default function MapSidebar({ novelId, theme, onSelectMap, activeMapId }: MapSidebarProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [maps, setMaps] = useState<MapCanvas[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [editType, setEditType] = useState('');
    const [editDesc, setEditDesc] = useState('');

    const loadMaps = useCallback(async () => {
        try {
            const data = await window.db.getMaps(novelId);
            setMaps(data);
        } catch (e) {
            console.error('Failed to load maps:', e);
        }
    }, [novelId]);

    useEffect(() => {
        loadMaps();
    }, [loadMaps]);

    // Sync edit fields when active map changes
    useEffect(() => {
        const activeMap = maps.find(m => m.id === activeMapId);
        if (activeMap) {
            setEditType(activeMap.type || 'world');
            setEditDesc(activeMap.description || '');
        }
    }, [activeMapId, maps]);

    const handleCreate = async () => {
        try {
            const newMap = await window.db.createMap({
                novelId,
                name: t('map.newMap', '新地图'),
                type: 'world'
            });
            setMaps(prev => [...prev, newMap]);
            onSelectMap(newMap.id);
        } catch (e) {
            console.error('Failed to create map:', e);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await window.db.deleteMap(id);
            setMaps(prev => prev.filter(m => m.id !== id));
            if (activeMapId === id) onSelectMap('');
        } catch (e) {
            console.error('Failed to delete map:', e);
        }
    };

    const handleRename = async (id: string) => {
        if (!renameValue.trim()) {
            setRenamingId(null);
            return;
        }
        try {
            await window.db.updateMap(id, { name: renameValue.trim() });
            setMaps(prev => prev.map(m => m.id === id ? { ...m, name: renameValue.trim() } : m));
            setRenamingId(null);
        } catch (e) {
            console.error('Failed to rename map:', e);
        }
    };

    return (
        <>
            {/* Header */}
            <div className={clsx("px-4 py-3 flex items-center justify-between")}>
                <span className={clsx("text-xs font-medium", isDark ? "text-neutral-400" : "text-neutral-500")}>
                    {t('map.title', '地图')}
                </span>
                <button
                    onClick={handleCreate}
                    className={clsx(
                        "text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors",
                        isDark ? "text-indigo-400 hover:bg-white/5" : "text-indigo-600 hover:bg-black/5"
                    )}
                >
                    <Plus className="w-3 h-3" />
                    {t('map.addMap', '新建地图')}
                </button>
            </div>

            {/* Map List */}
            <div className="px-2 space-y-1 flex-1 overflow-y-auto">
                {maps.length === 0 ? (
                    <div className={clsx("text-center py-12", isDark ? "text-neutral-600" : "text-neutral-400")}>
                        <MapIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">{t('map.noMaps', '暂无地图')}</p>
                        <p className="text-[10px] mt-1 opacity-60">{t('map.noMapsHint', '点击右上角 + 创建')}</p>
                    </div>
                ) : (
                    maps.map(map => {
                        const Icon = MAP_TYPE_ICONS[map.type] || MapIcon;
                        const color = MAP_TYPE_COLORS[map.type] || 'text-neutral-400';
                        const isActive = activeMapId === map.id;
                        const isRenaming = renamingId === map.id;

                        return (
                            <div
                                key={map.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    if (!isRenaming) onSelectMap(map.id);
                                }}
                                onKeyDown={(e) => {
                                    if (!isRenaming && (e.key === 'Enter' || e.key === ' ')) onSelectMap(map.id);
                                }}
                                className={clsx(
                                    "w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer outline-none",
                                    isActive
                                        ? isDark ? "bg-indigo-500/15 border border-indigo-500/30" : "bg-indigo-50 border border-indigo-200"
                                        : isDark ? "hover:bg-white/5 border border-transparent" : "hover:bg-black/5 border border-transparent"
                                )}
                            >
                                <Icon className={clsx("w-4 h-4 flex-shrink-0", color)} />
                                <div className="flex-1 min-w-0">
                                    {isRenaming ? (
                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                            <input
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => {
                                                    e.stopPropagation();
                                                    if (e.key === 'Enter') handleRename(map.id);
                                                    if (e.key === 'Escape') setRenamingId(null);
                                                }}
                                                className={clsx(
                                                    "text-sm w-full px-1.5 py-0.5 rounded border outline-none",
                                                    isDark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"
                                                )}
                                                autoFocus
                                            />
                                            <button onClick={() => handleRename(map.id)} className="p-0.5 opacity-60 hover:opacity-100">
                                                <Check className="w-3.5 h-3.5 text-green-400" />
                                            </button>
                                            <button onClick={() => setRenamingId(null)} className="p-0.5 opacity-60 hover:opacity-100">
                                                <X className="w-3.5 h-3.5 text-red-400" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className={clsx("text-sm truncate", isDark ? "text-neutral-200" : "text-neutral-800")}>
                                                {map.name}
                                            </div>
                                            <div className={clsx("text-[10px] mt-0.5", isDark ? "text-neutral-500" : "text-neutral-400")}>
                                                {t(`map.type.${map.type}`, map.type)}
                                                {map.background && ' · 🖼️'}
                                            </div>
                                        </>
                                    )}
                                </div>
                                {!isRenaming && (
                                    <div className="flex items-center gap-0.5">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRenamingId(map.id);
                                                setRenameValue(map.name);
                                            }}
                                            className={clsx(
                                                "p-1 rounded transition-colors opacity-0 group-hover:opacity-100",
                                                isDark ? "hover:bg-white/10 text-neutral-500" : "hover:bg-gray-100 text-neutral-400"
                                            )}
                                        >
                                            <Edit3 className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(map.id); }}
                                            className={clsx(
                                                "p-1 rounded transition-colors opacity-0 group-hover:opacity-100",
                                                isDark ? "hover:bg-red-500/20 text-neutral-500" : "hover:bg-red-50 text-neutral-400"
                                            )}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                        <ChevronRight className={clsx(
                                            "w-3.5 h-3.5 transition-transform",
                                            isActive ? "opacity-60 rotate-90" : "opacity-0 group-hover:opacity-40",
                                            isDark ? "text-neutral-500" : "text-neutral-400"
                                        )} />
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Selected Map Detail Editor */}
            {activeMapId && (() => {
                const activeMap = maps.find(m => m.id === activeMapId);
                if (!activeMap) return null;
                return (
                    <div className={clsx("px-4 py-3 border-t space-y-3", isDark ? "border-white/5" : "border-gray-100")}>
                        <div>
                            <label className={clsx("text-[10px] font-medium block mb-1", isDark ? "text-neutral-500" : "text-neutral-400")}>
                                {t('map.mapType', '地图类型')}
                            </label>
                            <select
                                value={editType}
                                onChange={async (e) => {
                                    const newType = e.target.value;
                                    setEditType(newType);
                                    try {
                                        await window.db.updateMap(activeMapId, { type: newType });
                                        setMaps(prev => prev.map(m => m.id === activeMapId ? { ...m, type: newType } : m));
                                    } catch (err) {
                                        console.error('Failed to update map type:', err);
                                    }
                                }}
                                className={clsx(
                                    "w-full text-xs px-2 py-1.5 rounded-lg border outline-none transition-colors",
                                    isDark ? "bg-white/5 border-white/10 text-neutral-200" : "bg-gray-50 border-gray-200 text-neutral-800"
                                )}
                            >
                                <option value="world">{t('map.type.world', '世界')}</option>
                                <option value="region">{t('map.type.region', '区域')}</option>
                                <option value="scene">{t('map.type.scene', '场景')}</option>
                            </select>
                        </div>
                        <div>
                            <label className={clsx("text-[10px] font-medium block mb-1", isDark ? "text-neutral-500" : "text-neutral-400")}>
                                {t('common.description', '描述')}
                            </label>
                            <textarea
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                onBlur={async () => {
                                    try {
                                        await window.db.updateMap(activeMapId, { description: editDesc.trim() || null });
                                        setMaps(prev => prev.map(m => m.id === activeMapId ? { ...m, description: editDesc.trim() || null } : m));
                                    } catch (err) {
                                        console.error('Failed to update map description:', err);
                                    }
                                }}
                                placeholder={t('map.descPlaceholder', '地图描述...')}
                                className={clsx(
                                    "w-full text-xs px-2 py-1.5 rounded-lg border outline-none resize-none h-16 leading-relaxed transition-colors",
                                    isDark ? "bg-white/5 border-white/10 text-neutral-200 placeholder:text-neutral-600" : "bg-gray-50 border-gray-200 text-neutral-800 placeholder:text-neutral-400"
                                )}
                            />
                        </div>
                    </div>
                );
            })()}

            {/* Delete Confirm */}
            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => { if (deleteTarget) { handleDelete(deleteTarget); setDeleteTarget(null); } }}
                title={t('common.delete')}
                message={t('map.deleteConfirm', '确定要删除这张地图吗？')}
                theme={theme}
            />
        </>
    );
}
