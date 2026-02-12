import { memo, useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { User, Trash2, ChevronRight, Star } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Character } from '../../types';
import { AVATAR_PALETTES, hashStringToIndex } from '../../utils/avatarUtils';


interface CharacterListProps {
    characters: Character[];
    theme: 'dark' | 'light';
    highlightId?: string | null;
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
            data-character-id={character.id}
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
                    <img src={`local-resource://${character.avatar}`} alt={character.name} className="w-full h-full rounded-full object-cover" />
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

export default function CharacterList({ characters, theme, highlightId, onEdit, onDelete, onToggleStar }: CharacterListProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [deletingCharId, setDeletingCharId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Scroll to and highlight target character
    useEffect(() => {
        if (!highlightId || !containerRef.current) return;
        const el = containerRef.current.querySelector(`[data-character-id="${highlightId}"]`) as HTMLElement;
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'background-color 0.3s';
            el.style.backgroundColor = isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)';
            setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
        }
    }, [highlightId, isDark]);

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
        <div ref={containerRef} className="p-2 space-y-0.5">
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
