import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plus, Trash2, ChevronRight, Globe, Mountain, Sparkles, Users as UsersIcon, Cpu, HelpCircle, Edit3 } from 'lucide-react';
import { BaseModal } from '../ui/BaseModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Combobox } from '../ui/Combobox';
import { IconPicker, ICON_MAP } from '../ui/IconPicker';
import { WorldSetting } from '../../types';

interface WorldSettingListProps {
    novelId: string;
    theme: 'dark' | 'light';
}

const DEFAULT_TYPES = ['history', 'geography', 'magic_system', 'faction', 'technology', 'other'];

function getIconForType(type: string, customIcon?: string | null) {
    if (customIcon && ICON_MAP[customIcon]) return ICON_MAP[customIcon];

    switch (type) {
        case 'history': return Globe;
        case 'geography': return Mountain;
        case 'magic_system': return Sparkles;
        case 'faction': return UsersIcon;
        case 'technology': return Cpu;
        default: return HelpCircle;
    }
}

function getColorForType(type: string) {
    switch (type) {
        case 'history': return 'text-amber-400';
        case 'geography': return 'text-emerald-400';
        case 'magic_system': return 'text-violet-400';
        case 'faction': return 'text-blue-400';
        case 'technology': return 'text-cyan-400';
        default: return 'text-neutral-400';
    }
}

export default function WorldSettingList({ novelId, theme }: WorldSettingListProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [settings, setSettings] = useState<WorldSetting[]>([]);
    const [editingSetting, setEditingSetting] = useState<WorldSetting | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Listen for navigate-to-world-setting event
    useEffect(() => {
        const handleNavigate = (e: CustomEvent<{ entityId: string }>) => {
            const { entityId } = e.detail;
            setTimeout(() => {
                if (!containerRef.current) return;
                const el = containerRef.current.querySelector(`[data-setting-id="${entityId}"]`) as HTMLElement;
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.style.transition = 'background-color 0.3s';
                    el.style.backgroundColor = isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)';
                    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
                }
            }, 50);
        };

        window.addEventListener('navigate-to-world-setting', handleNavigate as unknown as EventListener);
        return () => window.removeEventListener('navigate-to-world-setting', handleNavigate as unknown as EventListener);
    }, [isDark]);

    const loadSettings = useCallback(async () => {
        try {
            const data = await window.db.getWorldSettings(novelId);
            setSettings(data);
        } catch (e) {
            console.error('Failed to load world settings:', e);
        }
    }, [novelId]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleCreate = async () => {
        try {
            const newSetting = await window.db.createWorldSetting({
                novelId,
                name: t('world.newSetting', '新设定'),
                type: 'other'
            });
            setSettings(prev => [...prev, newSetting]);
            setEditingSetting(newSetting);
            setIsEditorOpen(true);
        } catch (e) {
            console.error('Failed to create world setting:', e);
        }
    };

    const handleUpdate = async (id: string, data: Partial<WorldSetting>) => {
        try {
            const updated = await window.db.updateWorldSetting(id, data);
            setSettings(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
            setEditingSetting(prev => prev?.id === id ? { ...prev, ...updated } : prev);
        } catch (e) {
            console.error('Failed to update world setting:', e);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await window.db.deleteWorldSetting(id);
            setSettings(prev => prev.filter(s => s.id !== id));
            if (editingSetting?.id === id) {
                setIsEditorOpen(false);
                setEditingSetting(null);
            }
        } catch (e) {
            console.error('Failed to delete world setting:', e);
        }
    };

    return (
        <>
            {/* Header Add Button */}
            <div className={clsx("px-4 py-3 flex justify-end")}>
                <button
                    onClick={handleCreate}
                    className={clsx(
                        "text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors",
                        isDark ? "text-indigo-400 hover:bg-white/5" : "text-indigo-600 hover:bg-black/5"
                    )}
                >
                    <Plus className="w-3 h-3" />
                    {t('world.addSetting', '添加设定')}
                </button>
            </div>

            {/* List */}
            <div ref={containerRef} className="px-2 space-y-1">
                {settings.length === 0 ? (
                    <div className={clsx("text-center py-12", isDark ? "text-neutral-600" : "text-neutral-400")}>
                        <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">{t('world.noSettings', '暂无世界观设定')}</p>
                        <p className="text-[10px] mt-1 opacity-60">{t('world.addSettingHint', '点击右上角 + 创建')}</p>
                    </div>
                ) : (
                    settings.map(setting => {
                        const Icon = getIconForType(setting.type, setting.icon);
                        const color = getColorForType(setting.type);

                        // Try to translate standard types, otherwise show raw type
                        const displayType = DEFAULT_TYPES.includes(setting.type)
                            ? t(`world.settingType.${setting.type}`, setting.type)
                            : setting.type;

                        return (
                            <div
                                key={setting.id}
                                data-setting-id={setting.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => { setEditingSetting(setting); setIsEditorOpen(true); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setEditingSetting(setting); setIsEditorOpen(true); } }}
                                className={clsx(
                                    "w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500",
                                    isDark ? "hover:bg-white/5" : "hover:bg-black/5"
                                )}
                            >
                                <Icon className={clsx("w-4 h-4 flex-shrink-0", !setting.icon && color, setting.icon && (isDark ? "text-neutral-300" : "text-neutral-600"))} />
                                <div className="flex-1 min-w-0">
                                    <div className={clsx("text-sm truncate", isDark ? "text-neutral-200" : "text-neutral-800")}>
                                        {setting.name}
                                    </div>
                                    <div className={clsx("text-[10px] mt-0.5", isDark ? "text-neutral-500" : "text-neutral-400")}>
                                        {displayType}
                                        {setting.content && ` · ${setting.content.length} ${t('common.chars', '字')}`}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(setting.id); }}
                                        className={clsx("p-1 rounded transition-colors opacity-0 group-hover:opacity-100", isDark ? "hover:bg-red-500/20 text-neutral-500" : "hover:bg-red-50 text-neutral-400")}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <ChevronRight className={clsx("w-3.5 h-3.5 opacity-0 group-hover:opacity-60", isDark ? "text-neutral-500" : "text-neutral-400")} />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Editor Modal */}
            {isEditorOpen && editingSetting && (
                <WorldSettingEditorModal
                    setting={editingSetting}
                    existingTypes={Array.from(new Set([...DEFAULT_TYPES, ...settings.map(s => s.type)]))}
                    theme={theme}
                    onClose={() => { setIsEditorOpen(false); setEditingSetting(null); }}
                    onSave={handleUpdate}
                    onDelete={handleDelete}
                />
            )}

            {/* Delete Confirm */}
            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => { if (deleteTarget) { handleDelete(deleteTarget); setDeleteTarget(null); } }}
                title={t('common.delete')}
                message={t('world.confirmDeleteSetting', '确定要删除这条设定吗？')}
                theme={theme}
            />
        </>
    );
}

// --- Editor Modal ---
interface WorldSettingEditorModalProps {
    setting: WorldSetting;
    existingTypes: string[];
    theme: 'dark' | 'light';
    onClose: () => void;
    onSave: (id: string, data: Partial<WorldSetting>) => void;
    onDelete: (id: string) => void;
}

function WorldSettingEditorModal({ setting, existingTypes, theme, onClose, onSave, onDelete }: WorldSettingEditorModalProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const [name, setName] = useState(setting.name);
    const [type, setType] = useState(setting.type);
    const [content, setContent] = useState(setting.content || '');
    const [icon, setIcon] = useState(setting.icon || null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const inputClass = clsx(
        "px-3 py-2 rounded-lg text-sm border outline-none transition-colors",
        isDark
            ? "bg-white/5 border-white/10 text-white placeholder-neutral-500 focus:border-indigo-500/50"
            : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-indigo-500"
    );

    const handleSave = () => {
        onSave(setting.id, {
            name: name.trim() || setting.name,
            type,
            content,
            icon: icon || undefined
        });
        onClose();
    };

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            title={t('world.editSetting', '编辑设定')}
            theme={theme}
            maxWidth="max-w-lg"
        >
            <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
                {/* Name */}
                <div>
                    <label className={clsx("text-xs font-medium mb-1 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                        {t('world.settingName', '设定名称')}
                    </label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className={clsx(inputClass, "w-full")}
                        placeholder={t('world.settingNamePlaceholder', '如：魔法体系、地理环境...')}
                        autoFocus
                    />
                </div>

                {/* Icon & Type Row */}
                <div className="flex gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0">
                        <label className={clsx("text-xs font-medium mb-1 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                            {t('common.icon', '图标')}
                        </label>
                        <IconPicker
                            value={icon}
                            onChange={setIcon}
                            theme={theme}
                        />
                    </div>

                    {/* Type */}
                    <div className="flex-1">
                        <label className={clsx("text-xs font-medium mb-1 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                            {t('world.settingCategory', '分类')}
                        </label>
                        <Combobox
                            options={existingTypes.map(tStr => ({
                                id: tStr,
                                name: DEFAULT_TYPES.includes(tStr) ? t(`world.settingType.${tStr}`, tStr) : tStr
                            }))}
                            value={type}
                            onChange={setType}
                            placeholder={t('world.selectCategory', '选择或输入分类...')}
                            theme={theme}
                            creatable
                            t={(key, defaultValue) => t(key, defaultValue as any) as string}
                        />
                    </div>
                </div>

                {/* Content */}
                <div>
                    <label className={clsx("text-xs font-medium mb-1 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                        {t('world.settingContent', '内容')}
                    </label>
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        rows={10}
                        className={clsx(inputClass, "w-full resize-y min-h-[200px]")}
                        placeholder={t('world.settingContentPlaceholder', '描述你的世界观设定...')}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className={clsx("flex justify-between items-center pt-4 mt-4 border-t", isDark ? "border-white/5" : "border-gray-100")}>
                <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className={clsx(
                        "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors",
                        isDark ? "text-red-400 hover:bg-red-500/10" : "text-red-500 hover:bg-red-50"
                    )}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('common.delete')}
                </button>
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className={clsx(
                            "text-xs px-4 py-1.5 rounded-lg transition-colors font-medium",
                            isDark ? "text-neutral-400 hover:bg-white/5" : "text-neutral-500 hover:bg-gray-100"
                        )}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors font-medium"
                    >
                        <Edit3 className="w-3.5 h-3.5" />
                        {t('common.save')}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                    onDelete(setting.id);
                    setShowDeleteConfirm(false);
                }}
                title={t('common.delete')}
                message={t('world.confirmDeleteSetting', '确定要删除这条设定吗？')}
                theme={theme}
            />
        </BaseModal>
    );
}
