import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { User, Trash2, ChevronRight } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Character } from '../../types';

interface CharacterListProps {
    characters: Character[];
    theme: 'dark' | 'light';
    onEdit: (character: Character) => void;
    onDelete: (id: string) => void;
}

const CharacterCard = memo(({ character, isDark, onEdit, onDelete }: {
    character: Character;
    isDark: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) => {
    const { t } = useTranslation();

    const roleLabel = character.role || t('world.noRole', '未设定');

    return (
        <div
            onClick={onEdit}
            className={clsx(
                "group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200",
                isDark
                    ? "hover:bg-white/5 active:bg-white/10"
                    : "hover:bg-black/[0.03] active:bg-black/[0.06]"
            )}
        >
            {/* Avatar */}
            <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                isDark
                    ? "bg-gradient-to-br from-indigo-500/30 to-purple-500/30 text-indigo-300"
                    : "bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600"
            )}>
                {character.avatar ? (
                    <img src={character.avatar} alt={character.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                    <span>{character.name.charAt(0)}</span>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className={clsx("text-sm font-medium truncate", isDark ? "text-neutral-200" : "text-neutral-800")}>
                    {character.name}
                </div>
                <div className={clsx("text-xs truncate mt-0.5", isDark ? "text-neutral-500" : "text-neutral-400")}>
                    {roleLabel}
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
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
});

export default function CharacterList({ characters, theme, onEdit, onDelete }: CharacterListProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [deletingCharId, setDeletingCharId] = useState<string | null>(null);

    if (characters.length === 0) {
        return (
            <div className={clsx("flex flex-col items-center justify-center py-12 px-4 text-center", isDark ? "text-neutral-600" : "text-neutral-400")}>
                <User className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">{t('world.noCharacters', '暂无角色')}</p>
                <p className="text-xs mt-1 opacity-70">{t('world.addCharacterHint', '点击上方 + 创建角色')}</p>
            </div>
        );
    }

    return (
        <div className="p-2 space-y-0.5">
            {characters.map(char => (
                <CharacterCard
                    key={char.id}
                    character={char}
                    isDark={isDark}
                    onEdit={() => onEdit(char)}
                    onDelete={() => setDeletingCharId(char.id)}
                />
            ))}

            <ConfirmModal
                isOpen={!!deletingCharId}
                onClose={() => setDeletingCharId(null)}
                onConfirm={() => {
                    if (deletingCharId) onDelete(deletingCharId);
                    setDeletingCharId(null);
                }}
                title={t('common.delete')}
                message={t('world.confirmDeleteCharacter', '确定要删除这个角色吗？')}
                theme={theme}
            />
        </div>
    );
}
