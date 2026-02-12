import { memo, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { User, Trash2, ChevronRight, Star } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Character } from '../../types';

// 精选美观渐变色调色板 (dark: [from, to, text], light: [from, to, text])
const AVATAR_PALETTES = [
    { dark: ['from-rose-500/30', 'to-pink-500/30', 'text-rose-300'], light: ['from-rose-100', 'to-pink-100', 'text-rose-600'] },
    { dark: ['from-orange-500/30', 'to-amber-500/30', 'text-orange-300'], light: ['from-orange-100', 'to-amber-100', 'text-orange-600'] },
    { dark: ['from-emerald-500/30', 'to-teal-500/30', 'text-emerald-300'], light: ['from-emerald-100', 'to-teal-100', 'text-emerald-600'] },
    { dark: ['from-cyan-500/30', 'to-sky-500/30', 'text-cyan-300'], light: ['from-cyan-100', 'to-sky-100', 'text-cyan-600'] },
    { dark: ['from-indigo-500/30', 'to-purple-500/30', 'text-indigo-300'], light: ['from-indigo-100', 'to-purple-100', 'text-indigo-600'] },
    { dark: ['from-violet-500/30', 'to-fuchsia-500/30', 'text-violet-300'], light: ['from-violet-100', 'to-fuchsia-100', 'text-violet-600'] },
    { dark: ['from-blue-500/30', 'to-indigo-500/30', 'text-blue-300'], light: ['from-blue-100', 'to-indigo-100', 'text-blue-600'] },
    { dark: ['from-teal-500/30', 'to-green-500/30', 'text-teal-300'], light: ['from-teal-100', 'to-green-100', 'text-teal-600'] },
    { dark: ['from-pink-500/30', 'to-rose-500/30', 'text-pink-300'], light: ['from-pink-100', 'to-rose-100', 'text-pink-600'] },
    { dark: ['from-amber-500/30', 'to-yellow-500/30', 'text-amber-300'], light: ['from-amber-100', 'to-yellow-100', 'text-amber-600'] },
];

/** 基于字符串的简单哈希，确保同一名字总返回相同索引 */
function hashStringToIndex(str: string, max: number): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % max;
}

interface CharacterListProps {
    characters: Character[];
    theme: 'dark' | 'light';
    onEdit: (character: Character) => void;
    onDelete: (id: string) => void;
    onToggleStar: (character: Character) => void;
}

const CharacterCard = memo(({ character, isDark, onEdit, onDelete, onToggleStar }: {
    character: Character;
    isDark: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onToggleStar: () => void;
}) => {
    const { t } = useTranslation();

    const roleLabel = character.role || t('world.noRole', '未设定');

    const avatarColors = useMemo(() => {
        const idx = hashStringToIndex(character.id || character.name, AVATAR_PALETTES.length);
        const palette = AVATAR_PALETTES[idx];
        return isDark ? palette.dark : palette.light;
    }, [character.id, character.name, isDark]);

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
            {/* Star Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
                className={clsx(
                    "p-1.5 -ml-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100",
                    character.isStarred ? "opacity-100 text-yellow-500" : (isDark ? "text-neutral-600 hover:text-yellow-500" : "text-neutral-300 hover:text-yellow-500")
                )}
            >
                <Star className={clsx("w-4 h-4", character.isStarred && "fill-current")} />
            </button>

            {/* Avatar */}
            <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold bg-gradient-to-br",
                avatarColors[0], avatarColors[1], avatarColors[2]
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

export default function CharacterList({ characters, theme, onEdit, onDelete, onToggleStar }: CharacterListProps) {
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
                    onToggleStar={() => onToggleStar(char)}
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
