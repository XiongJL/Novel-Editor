import { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
    X, Search,
    // Shapes
    Circle, Square, Triangle, Hexagon, Octagon, Star, Heart, Cloud, Sun, Moon,
    // Objects
    Sword, Shield, Crown, Scroll, Book, Map, Compass, Anchor, Flag, Target,
    // Nature
    Flame, Droplets, Wind, Mountain, TreePine, Flower, Leaf, Snowflake,
    // Tech / Magic
    Zap, Sparkles, Ghost, Skull, FlaskConical, Atom, Cpu, Wifi,
    // People / Roles
    User, Users, Baby, Hand, Eye, Ear, Footprints,
    // Misc
    Music, Camera, Video, Mic, PenTool, Brush, Palette,
    // UI
    Home, Settings, Menu, Bell, Mail, Calendar, Clock, Lock, Key
} from 'lucide-react';
import { BaseModal } from './BaseModal';

// Map of icon names to components
export const ICON_MAP: Record<string, any> = {
    // Shapes
    Circle, Square, Triangle, Hexagon, Octagon, Star, Heart, Cloud, Sun, Moon,
    // Objects
    Sword, Shield, Crown, Scroll, Book, Map, Compass, Anchor, Flag, Target,
    // Nature
    Flame, Droplets, Wind, Mountain, TreePine, Flower, Leaf, Snowflake,
    // Tech / Magic
    Zap, Sparkles, Ghost, Skull, FlaskConical, Atom, Cpu, Wifi,
    // People / Roles
    User, Users, Baby, Hand, Eye, Ear, Footprints,
    // Misc
    Music, Camera, Video, Mic, PenTool, Brush, Palette,
    // UI
    Home, Settings, Menu, Bell, Mail, Calendar, Clock, Lock, Key
};

interface IconPickerProps {
    value?: string | null;
    onChange: (iconName: string | null) => void;
    theme: 'dark' | 'light';
    trigger?: React.ReactNode;
}

export function IconPicker({ value, onChange, theme, trigger }: IconPickerProps) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredIcons = Object.keys(ICON_MAP).filter(name =>
        name.toLowerCase().includes(search.toLowerCase())
    );

    const SelectedIcon = value && ICON_MAP[value] ? ICON_MAP[value] : null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={clsx(
                    "flex items-center justify-center p-2 rounded-lg border transition-colors",
                    isDark
                        ? "bg-white/5 border-white/10 hover:bg-white/10"
                        : "bg-gray-50 border-gray-200 hover:bg-gray-100",
                    !trigger && "w-10 h-10"
                )}
                title={t('common.selectIcon', 'Select Icon')}
            >
                {trigger ? trigger : (
                    SelectedIcon ? <SelectedIcon className="w-5 h-5" /> : <Search className="w-4 h-4 opacity-50" />
                )}
            </button>

            <BaseModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={t('common.selectIcon', 'Select Icon')}
                theme={theme}
                maxWidth="max-w-md"
            >
                <div className="space-y-4 h-[60vh] flex flex-col">
                    {/* Search */}
                    <div className={clsx(
                        "flex items-center px-3 py-2 rounded-lg border",
                        isDark ? "bg-black/20 border-white/10" : "bg-gray-50 border-gray-200"
                    )}>
                        <Search className="w-4 h-4 opacity-50 mr-2" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={t('common.searchIcons', 'Search icons...')}
                            className="bg-transparent border-none outline-none text-sm w-full"
                            autoFocus
                        />
                        {search && (
                            <button onClick={() => setSearch('')}>
                                <X className="w-3 h-3 opacity-50 hover:opacity-100" />
                            </button>
                        )}
                    </div>

                    {/* Grid */}
                    <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar pr-1">
                        <div className="grid grid-cols-6 gap-2">
                            <button
                                onClick={() => { onChange(null); setIsOpen(false); }}
                                className={clsx(
                                    "flex flex-col items-center justify-center p-2 rounded-lg border transition-all aspect-square",
                                    !value
                                        ? (isDark ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-indigo-50 border-indigo-200 text-indigo-600")
                                        : (isDark ? "bg-white/5 border-white/5 hover:bg-white/10" : "bg-white border-gray-100 hover:bg-gray-50")
                                )}
                                title={t('common.noIcon', 'No Icon')}
                            >
                                <X className="w-5 h-5 mb-1" />
                                <span className="text-[10px] opacity-60 truncate w-full text-center">None</span>
                            </button>

                            {filteredIcons.map(name => {
                                const Icon = ICON_MAP[name];
                                const isSelected = value === name;
                                return (
                                    <button
                                        key={name}
                                        onClick={() => { onChange(name); setIsOpen(false); }}
                                        className={clsx(
                                            "flex flex-col items-center justify-center p-2 rounded-lg border transition-all aspect-square group",
                                            isSelected
                                                ? (isDark ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-indigo-50 border-indigo-200 text-indigo-600")
                                                : (isDark ? "bg-white/5 border-white/5 hover:bg-white/10" : "bg-white border-gray-100 hover:bg-gray-50")
                                        )}
                                        title={name}
                                    >
                                        <Icon className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] opacity-60 truncate w-full text-center">{name}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {filteredIcons.length === 0 && (
                            <div className="text-center py-8 opacity-50 text-sm">
                                {t('common.noIconsFound', 'No icons found')}
                            </div>
                        )}
                    </div>
                </div>
            </BaseModal>
        </>
    );
}
