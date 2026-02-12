import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { X, Plus, Trash2, Save, User, Link2, Package, Clock } from 'lucide-react';
import { BaseModal } from '../ui/BaseModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Character } from '../../types';
import RelationManager from './RelationManager';
import InventoryManager from './InventoryManager';
import CharacterTimeline from './CharacterTimeline';

interface CharacterEditorProps {
    character: Character;
    theme: 'dark' | 'light';
    novelId: string;
    onClose: () => void;
    onSave: (id: string, data: Partial<Character>) => void;
    onDelete: (id: string) => void;
}

interface ProfileEntry {
    key: string;
    value: string;
}

type EditorTab = 'basic' | 'relations' | 'inventory' | 'timeline';

export default function CharacterEditor({ character, theme, novelId, onClose, onSave, onDelete }: CharacterEditorProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const nameRef = useRef<HTMLInputElement>(null);
    const roleRef = useRef<HTMLInputElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [activeTab, setActiveTab] = useState<EditorTab>('basic');

    const [name, setName] = useState(character.name);
    const [role, setRole] = useState(character.role || '');
    const [description, setDescription] = useState(character.description || '');
    const [profileEntries, setProfileEntries] = useState<ProfileEntry[]>(() => {
        try {
            const parsed = JSON.parse(character.profile || '{}');
            return Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) }));
        } catch {
            return [];
        }
    });

    // Auto-focus name if it's the default
    useEffect(() => {
        if (character.name === t('world.newCharacter', '新角色')) {
            nameRef.current?.select();
        }
    }, []);

    const handleSave = () => {
        const profile: Record<string, string> = {};
        profileEntries.forEach(e => {
            if (e.key.trim()) profile[e.key.trim()] = e.value;
        });

        onSave(character.id, {
            name: name.trim() || character.name,
            role: role.trim() || null,
            description: description.trim() || null,
            profile: JSON.stringify(profile)
        } as any);
        onClose();
    };

    const addProfileEntry = () => {
        setProfileEntries(prev => [...prev, { key: '', value: '' }]);
    };

    const updateProfileEntry = (index: number, field: 'key' | 'value', val: string) => {
        setProfileEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: val } : e));
    };

    const removeProfileEntry = (index: number) => {
        setProfileEntries(prev => prev.filter((_, i) => i !== index));
    };

    const handleDelete = () => {
        setShowDeleteConfirm(true);
    };

    const inputClass = clsx(
        "px-3 py-2 rounded-lg text-sm border outline-none transition-colors",
        isDark
            ? "bg-white/5 border-white/10 text-white placeholder-neutral-500 focus:border-indigo-500/50"
            : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-indigo-500"
    );

    const tabs: { id: EditorTab; icon: React.ElementType; label: string }[] = [
        { id: 'basic', icon: User, label: t('world.basicInfo', '基本信息') },
        { id: 'relations', icon: Link2, label: t('world.relations', '人际关系') },
        { id: 'inventory', icon: Package, label: t('world.inventory', '物品清单') },
        { id: 'timeline', icon: Clock, label: t('world.timeline', '生平时间线') },
    ];

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            theme={theme}
            maxWidth="max-w-lg"
            className="!p-0 overflow-hidden h-[600px] max-h-[85vh] flex flex-col"
        >
            <div className="flex flex-col h-full w-full">
                {/* Header */}
                <div className={clsx("px-6 pt-6 pb-2", isDark ? "bg-[#1a1a20]" : "bg-white")}>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-bold">{t('world.editCharacter', '编辑角色')}</h3>
                        <button
                            onClick={onClose}
                            className={clsx("p-1 rounded-lg transition-colors", isDark ? "hover:bg-white/10" : "hover:bg-gray-100")}
                        >
                            <X className="w-5 h-5 opacity-50" />
                        </button>
                    </div>

                    {/* Tab Bar */}
                    <div className={clsx("flex border-b -mx-6 px-6", isDark ? "border-white/5" : "border-gray-100")}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={clsx(
                                    "flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors -mb-[1px]",
                                    activeTab === tab.id
                                        ? (isDark ? "border-indigo-400 text-indigo-400" : "border-indigo-600 text-indigo-600")
                                        : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
                                )}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {activeTab === 'basic' && (
                        <div className="space-y-5 p-6">
                            {/* Name */}
                            <div>
                                <label className={clsx("text-xs font-medium mb-1.5 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                                    {t('world.charName', '名称')}
                                </label>
                                <input
                                    ref={nameRef}
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className={clsx(inputClass, "w-full")}
                                    placeholder={t('world.charNamePlaceholder', '角色名称')}
                                />
                            </div>

                            {/* Role */}
                            <div>
                                <label className={clsx("text-xs font-medium mb-1.5 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                                    {t('world.charRole', '角色定位')}
                                </label>
                                <input
                                    ref={roleRef}
                                    value={role}
                                    onChange={e => setRole(e.target.value)}
                                    className={clsx(inputClass, "w-full")}
                                    placeholder={t('world.charRolePlaceholder', '主角 / 配角 / 反派...')}
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className={clsx("text-xs font-medium mb-1.5 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                                    {t('common.description', '简介')}
                                </label>
                                <textarea
                                    ref={descRef}
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className={clsx(inputClass, "w-full h-24 resize-none leading-relaxed")}
                                    placeholder={t('world.charDescPlaceholder', '角色简介...')}
                                />
                            </div>

                            {/* Custom Profile Fields */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className={clsx("text-xs font-medium block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                                        {t('world.customProperties', '自定义属性')}
                                    </label>
                                    <button
                                        onClick={addProfileEntry}
                                        className="text-indigo-500 hover:text-indigo-600 text-xs flex items-center gap-1 font-medium"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {t('common.add', '添加')}
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {profileEntries.map((entry, index) => (
                                        <div key={index} className="flex gap-2 items-start">
                                            <input
                                                value={entry.key}
                                                onChange={e => updateProfileEntry(index, 'key', e.target.value)}
                                                className={clsx(inputClass, "w-1/3")}
                                                placeholder={t('world.property', '属性名')}
                                            />
                                            <textarea
                                                value={entry.value}
                                                onChange={e => updateProfileEntry(index, 'value', e.target.value)}
                                                className={clsx(inputClass, "flex-1 min-w-0 resize-y min-h-[38px] leading-relaxed")}
                                                rows={1}
                                                placeholder={t('world.value', '属性值')}
                                            />
                                            <button
                                                onClick={() => removeProfileEntry(index)}
                                                className={clsx("p-2 mt-0.5 rounded-lg transition-colors flex-shrink-0", isDark ? "hover:bg-red-500/20 text-neutral-500" : "hover:bg-red-50 text-neutral-400")}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {profileEntries.length === 0 && (
                                        <div className={clsx("text-center py-4 rounded-lg border border-dashed text-xs", isDark ? "border-white/10 text-neutral-600" : "border-gray-200 text-neutral-400")}>
                                            {t('world.noAttrs', '暂无自定义属性')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'relations' && (
                        <RelationManager
                            characterId={character.id}
                            novelId={novelId}
                            theme={theme}
                        />
                    )}

                    {activeTab === 'inventory' && (
                        <InventoryManager
                            characterId={character.id}
                            novelId={novelId}
                            theme={theme}
                        />
                    )}

                    {activeTab === 'timeline' && (
                        <CharacterTimeline
                            characterId={character.id}
                            theme={theme}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className={clsx("flex justify-between items-center py-4 px-6 border-t flex-shrink-0", isDark ? "border-white/5 bg-[#1a1a20]" : "border-gray-100 bg-gray-50/80")}>
                    <button
                        onClick={handleDelete}
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
                            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors font-medium shadow-sm shadow-indigo-500/20"
                        >
                            <Save className="w-3.5 h-3.5" />
                            {t('common.save')}
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                    onDelete(character.id);
                    setShowDeleteConfirm(false);
                }}
                title={t('common.delete')}
                message={t('world.confirmDeleteCharacter', '确定要删除这个角色吗？')}
                theme={theme}
            />
        </BaseModal>
    );
}
