// 精选美观渐变色调色板 (dark: [from, to, text], light: [from, to, text])
export const AVATAR_PALETTES = [
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
export function hashStringToIndex(str: string, max: number): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % max;
}

/** 获取角色的头像配色 */
export function getAvatarColors(id: string, name: string, isDark: boolean): string[] {
    const idx = hashStringToIndex(id || name, AVATAR_PALETTES.length);
    const palette = AVATAR_PALETTES[idx];
    return isDark ? palette.dark : palette.light;
}
