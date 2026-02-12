import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { BaseModal } from '../ui/BaseModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Item } from '../../types';

interface ItemEditorProps {
    item: Item;
    theme: 'dark' | 'light';
    onClose: () => void;
    onSave: (id: string, data: Partial<Item>) => void;
    onDelete: (id: string) => void;
}

interface ProfileEntry {
    key: string;
    value: string;
}

export default function ItemEditor({ item, theme, onClose, onSave, onDelete }: ItemEditorProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';

    const nameRef = useRef<HTMLInputElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const [name, setName] = useState(item.name);
    const [type, setType] = useState(item.type);
    const [description, setDescription] = useState(item.description || '');
    const [profileEntries, setProfileEntries] = useState<ProfileEntry[]>(() => {
        try {
            const parsed = JSON.parse(item.profile || '{}');
            return Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) }));
        } catch {
            return [];
        }
    });

    // Auto-focus name if it's the default
    useEffect(() => {
        if (item.name === t('world.newItem', '新物品')) {
            nameRef.current?.select();
        }
    }, [item.name, t]);

    const handleSave = () => {
        const profile: Record<string, string> = {};
        profileEntries.forEach(e => {
            if (e.key.trim()) profile[e.key.trim()] = e.value;
        });

        onSave(item.id, {
            name: name.trim() || item.name,
            type,
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

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            title={t('world.editItem', '编辑物品')}
            theme={theme}
            maxWidth="max-w-md"
        >
            <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
                {/* Name */}
                <div>
                    <label className={clsx("text-xs font-medium mb-1 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                        {t('world.itemName', '名称')}
                    </label>
                    <input
                        ref={nameRef}
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className={clsx(inputClass, "w-full")}
                        placeholder={t('world.itemNamePlaceholder', '物品名称')}
                    />
                </div>

                {/* Type */}
                <div>
                    <label className={clsx("text-xs font-medium mb-1 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                        {t('world.itemType', '类型')}
                    </label>
                    <select
                        value={type}
                        onChange={e => setType(e.target.value)}
                        className={clsx(inputClass, "w-full")}
                    >
                        <option value="item">{t('world.itemTypes.item', '物品')}</option>
                        <option value="skill">{t('world.itemTypes.skill', '技能')}</option>
                        <option value="location">{t('world.itemTypes.location', '地点')}</option>
                    </select>
                </div>

                {/* Description */}
                <div>
                    <label className={clsx("text-xs font-medium mb-1 block", isDark ? "text-neutral-400" : "text-neutral-500")}>
                        {t('world.itemDesc', '描述')}
                    </label>
                    <textarea
                        ref={descRef}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={3}
                        className={clsx(inputClass, "w-full resize-none")}
                        placeholder={t('world.itemDescPlaceholder', '物品的功能、来源、外观描述...')}
                    />
                </div>

                {/* Custom Profile */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className={clsx("text-xs font-medium", isDark ? "text-neutral-400" : "text-neutral-500")}>
                            {t('world.customAttrs', '自定义属性')}
                        </label>
                        <button
                            onClick={addProfileEntry}
                            className={clsx(
                                "text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors",
                                isDark ? "text-indigo-400 hover:bg-white/5" : "text-indigo-600 hover:bg-black/5"
                            )}
                        >
                            <Plus className="w-3 h-3" />
                            {t('world.addAttr', '添加')}
                        </button>
                    </div>
                    <div className="space-y-2">
                        {profileEntries.map((entry, i) => (
                            <div key={i} className="flex gap-2 items-start">
                                <input
                                    value={entry.key}
                                    onChange={e => updateProfileEntry(i, 'key', e.target.value)}
                                    className={clsx(inputClass, "w-1/3")}
                                    placeholder={t('world.attrKey', '属性名')}
                                />
                                <textarea
                                    value={entry.value}
                                    onChange={e => updateProfileEntry(i, 'value', e.target.value)}
                                    className={clsx(inputClass, "flex-1 min-w-0 resize-y min-h-[38px]")}
                                    rows={1}
                                    placeholder={t('world.attrValue', '属性值')}
                                />
                                <button
                                    onClick={() => removeProfileEntry(i)}
                                    className={clsx("p-1.5 mt-1 rounded transition-colors flex-shrink-0", isDark ? "hover:bg-red-500/20 text-neutral-500" : "hover:bg-red-50 text-neutral-400")}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        {profileEntries.length === 0 && (
                            <p className={clsx("text-xs italic py-2", isDark ? "text-neutral-600" : "text-neutral-400")}>
                                {t('world.noAttrs', '暂无自定义属性，点击"添加"创建')}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className={clsx("flex justify-between items-center pt-4 mt-4 border-t", isDark ? "border-white/5" : "border-gray-100")}>
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
                        className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors font-medium"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {t('common.save')}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                    onDelete(item.id);
                    setShowDeleteConfirm(false);
                }}
                title={t('common.delete')}
                message={t('world.confirmDeleteItem', '确定要删除这个物品吗？')}
                theme={theme}
            />
        </BaseModal>
    );
}
