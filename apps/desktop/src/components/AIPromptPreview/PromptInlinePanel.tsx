import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp, Copy, RefreshCcw } from 'lucide-react';
import type { PromptPreviewData } from './types';

type Props = {
    theme: 'dark' | 'light';
    title?: string;
    loading?: boolean;
    error?: string;
    data: PromptPreviewData | null;
    editablePrompt: string;
    baselinePrompt?: string;
    onEditablePromptChange: (value: string) => void;
    onRefresh: () => void;
};

type PromptEntry = { key: string; value: string };
type DynamicSummary = {
    recentChapterTitles: string[];
    selectedIdeaSnippets: string[];
    narrativeLevels: string[];
    currentChapterLen: number;
    currentLocation: string;
};

function parsePromptEntries(prompt: string): PromptEntry[] {
    const lines = (prompt || '').split('\n');
    const entries: PromptEntry[] = [];
    let current: PromptEntry | null = null;
    for (const raw of lines) {
        const line = raw ?? '';
        const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)=(.*)$/);
        if (match) {
            if (current) entries.push(current);
            current = { key: match[1], value: (match[2] || '').trim() };
            continue;
        }
        if (!current) continue;
        current.value = `${current.value}\n${line}`.trimEnd();
    }
    if (current) entries.push(current);
    return entries;
}

function findLastValue(entries: PromptEntry[], key: string): string {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].key === key) return entries[i].value || '';
    }
    return '';
}

function summarizeDynamicContext(rawValue: string): DynamicSummary | null {
    if (!rawValue.trim()) return null;
    try {
        const parsed = JSON.parse(rawValue) as Record<string, unknown>;
        const recent = Array.isArray(parsed.recentChapters) ? parsed.recentChapters : [];
        const ideas = Array.isArray(parsed.selectedIdeas) ? parsed.selectedIdeas : [];
        const summaries = Array.isArray(parsed.narrativeSummaries) ? parsed.narrativeSummaries : [];
        const current = typeof parsed.currentChapterBeforeCursor === 'string' ? parsed.currentChapterBeforeCursor : '';
        const currentLocation = typeof parsed.currentLocation === 'string' ? parsed.currentLocation.trim() : '';
        return {
            recentChapterTitles: recent
                .map((item: any) => String(item?.title || '').trim())
                .filter(Boolean)
                .slice(0, 8),
            selectedIdeaSnippets: ideas
                .map((item: any) => String(item?.content || item?.quote || '').trim().replace(/\s+/g, ' '))
                .filter(Boolean)
                .map((item) => (item.length > 28 ? `${item.slice(0, 28)}...` : item))
                .slice(0, 20),
            narrativeLevels: summaries
                .map((item: any) => String(item?.level || '').trim())
                .filter(Boolean)
                .slice(0, 4),
            currentChapterLen: current.length,
            currentLocation,
        };
    } catch {
        return null;
    }
}

function setDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    return {
        added: after.filter((item) => !beforeSet.has(item)),
        removed: before.filter((item) => !afterSet.has(item)),
    };
}

export default function PromptInlinePanel({
    theme,
    title,
    loading = false,
    error = '',
    data,
    editablePrompt,
    baselinePrompt,
    onEditablePromptChange,
    onRefresh,
}: Props) {
    const { t } = useTranslation();
    const isDark = theme === 'dark';
    const [isExpanded, setIsExpanded] = useState(false);
    const [view, setView] = useState<'structured' | 'raw'>('structured');
    const [copyStatus, setCopyStatus] = useState('');
    const [showRawDiff, setShowRawDiff] = useState(false);

    const paramsText = useMemo(() => {
        if (!data?.structured?.params) return '{}';
        try {
            return JSON.stringify(data.structured.params, null, 2);
        } catch {
            return '{}';
        }
    }, [data]);

    const paramEntries = useMemo(() => {
        if (!data?.structured?.params || typeof data.structured.params !== 'object') return [] as Array<{ key: string; value: unknown }>;
        return Object.entries(data.structured.params).map(([key, value]) => ({ key, value }));
    }, [data]);

    const renderParamDesc = (key: string): string => {
        if (key === 'mode') return t('editor.paramMode');
        if (key === 'contextChapterCount') return t('editor.paramContextCount');
        if (key === 'targetLength') return t('editor.paramTargetLength');
        if (key === 'style') return t('editor.paramStyle');
        if (key === 'tone') return t('editor.paramTone');
        if (key === 'pace') return t('editor.paramPace');
        if (key === 'userIntent') return t('editor.paramUserIntent');
        if (key === 'currentLocation') return t('editor.paramCurrentLocation');
        return '';
    };

    const basePrompt = baselinePrompt ?? data?.editableUserPrompt ?? '';
    const isOverridden = useMemo(
        () => (editablePrompt || '').trim() !== (basePrompt || '').trim(),
        [basePrompt, editablePrompt],
    );

    const diffMeta = useMemo(() => {
        const baseLines = (basePrompt || '').split('\n').map((line) => line.trim()).filter(Boolean);
        const currentLines = (editablePrompt || '').split('\n').map((line) => line.trim()).filter(Boolean);
        const baseSet = new Set(baseLines);
        const currentSet = new Set(currentLines);
        return {
            added: currentLines.filter((line) => !baseSet.has(line)),
            removed: baseLines.filter((line) => !currentSet.has(line)),
        };
    }, [basePrompt, editablePrompt]);

    const semanticDiff = useMemo(() => {
        const baseEntries = parsePromptEntries(basePrompt || '');
        const currentEntries = parsePromptEntries(editablePrompt || '');
        const items: string[] = [];

        const baseDynamic = summarizeDynamicContext(findLastValue(baseEntries, 'DynamicContext'));
        const currentDynamic = summarizeDynamicContext(findLastValue(currentEntries, 'DynamicContext'));
        if (baseDynamic && currentDynamic) {
            const ideaDiff = setDiff(baseDynamic.selectedIdeaSnippets, currentDynamic.selectedIdeaSnippets);
            if (ideaDiff.added.length > 0) {
                for (const item of ideaDiff.added.slice(0, 3)) {
                    items.push(t('editor.promptDiffIdeaAdded', { value: item }));
                }
            }
            if (ideaDiff.removed.length > 0) {
                for (const item of ideaDiff.removed.slice(0, 3)) {
                    items.push(t('editor.promptDiffIdeaRemoved', { value: item }));
                }
            }

            if (baseDynamic.recentChapterTitles.length !== currentDynamic.recentChapterTitles.length) {
                items.push(t('editor.promptDiffRecentChapterCount', {
                    from: baseDynamic.recentChapterTitles.length,
                    to: currentDynamic.recentChapterTitles.length,
                }));
            }
            if (baseDynamic.narrativeLevels.length !== currentDynamic.narrativeLevels.length) {
                items.push(t('editor.promptDiffNarrativeCount', {
                    from: baseDynamic.narrativeLevels.length,
                    to: currentDynamic.narrativeLevels.length,
                }));
            }
            if (baseDynamic.currentChapterLen !== currentDynamic.currentChapterLen) {
                items.push(t('editor.promptDiffCurrentLen', {
                    from: baseDynamic.currentChapterLen,
                    to: currentDynamic.currentChapterLen,
                }));
            }
            if (baseDynamic.currentLocation !== currentDynamic.currentLocation) {
                items.push(
                    t('editor.promptDiffCurrentLocation', {
                        from: baseDynamic.currentLocation || t('editor.promptDiffEmpty'),
                        to: currentDynamic.currentLocation || t('editor.promptDiffEmpty'),
                    }),
                );
            }
        }

        const baseIntent = findLastValue(baseEntries, 'UserIntent');
        const currentIntent = findLastValue(currentEntries, 'UserIntent');
        if (baseIntent !== currentIntent) {
            items.push(
                t('editor.promptDiffUserIntent', {
                    from: baseIntent ? (baseIntent.length > 28 ? `${baseIntent.slice(0, 28)}...` : baseIntent) : t('editor.promptDiffEmpty'),
                    to: currentIntent ? (currentIntent.length > 28 ? `${currentIntent.slice(0, 28)}...` : currentIntent) : t('editor.promptDiffEmpty'),
                }),
            );
        }

        const baseLocation = findLastValue(baseEntries, 'CurrentLocation');
        const currentLocation = findLastValue(currentEntries, 'CurrentLocation');
        if (baseLocation !== currentLocation) {
            items.push(
                t('editor.promptDiffCurrentLocation', {
                    from: baseLocation || t('editor.promptDiffEmpty'),
                    to: currentLocation || t('editor.promptDiffEmpty'),
                }),
            );
        }

        const baseWriteParams = findLastValue(baseEntries, 'WriteParams');
        const currentWriteParams = findLastValue(currentEntries, 'WriteParams');
        if (baseWriteParams !== currentWriteParams) {
            items.push(t('editor.promptDiffWriteParams'));
        }

        const baseConstraintCount = baseEntries.filter((item) => item.key === 'Constraint').length;
        const currentConstraintCount = currentEntries.filter((item) => item.key === 'Constraint').length;
        if (baseConstraintCount !== currentConstraintCount) {
            items.push(t('editor.promptDiffConstraintCount', { from: baseConstraintCount, to: currentConstraintCount }));
        }

        return items.slice(0, 8);
    }, [basePrompt, editablePrompt, t]);

    const summarizeDiffLine = (line: string): string => {
        const normalized = line.replace(/\s+/g, ' ').trim();
        if (normalized.length > 220) return `${normalized.slice(0, 220)}...`;
        return normalized;
    };

    const renderContextRef = (item: string): string => {
        if (item === 'world_settings_full') return t('editor.ctxRefWorldSettings');
        if (item === 'plot_outline_full') return t('editor.ctxRefPlotOutline');
        if (item === 'characters_items_maps_snapshot') return t('editor.ctxRefEntities');
        if (item === 'current_chapter_before_cursor') return t('editor.ctxRefCurrentBeforeCursor');
        if (item.startsWith('recent_chapter_summary_memory_preferred_')) {
            const count = Number(item.split('_').pop() || '0') || 0;
            return t('editor.ctxRefRecentSummary', { count });
        }
        if (item.startsWith('recent_chapter_raw_text_')) {
            const count = Number(item.split('_').pop() || '0') || 0;
            return t('editor.ctxRefRecentRaw', { count });
        }
        if (item.startsWith('narrative_summaries_')) {
            const count = Number(item.split('_').pop() || '0') || 0;
            return t('editor.ctxRefNarrativeSummary', { count });
        }
        if (item.startsWith('selected_ideas_')) {
            const count = Number(item.split('_').pop() || '0') || 0;
            return t('editor.ctxRefSelectedIdeas', { count });
        }
        if (item.startsWith('selected_idea_entities_')) {
            const count = Number(item.split('_').pop() || '0') || 0;
            return t('editor.ctxRefSelectedIdeaEntities', { count });
        }
        if (item === 'current_location') return t('editor.ctxRefCurrentLocation');
        return item;
    };

    const handleCopyRaw = async () => {
        if (!data?.rawPrompt?.trim()) return;
        try {
            await navigator.clipboard.writeText(data.rawPrompt);
            setCopyStatus(t('common.copied'));
            window.setTimeout(() => setCopyStatus(''), 1200);
        } catch {
            setCopyStatus(t('common.copyFailed'));
            window.setTimeout(() => setCopyStatus(''), 1500);
        }
    };

    return (
        <div className={clsx('rounded-xl border', isDark ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50')}>
            <button
                onClick={() => setIsExpanded((prev) => !prev)}
                className={clsx(
                    'w-full px-3 py-2 flex items-center justify-between text-xs',
                    isDark ? 'text-neutral-200 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-100',
                )}
            >
                <span>{title || t('editor.promptPreview')}</span>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {isExpanded && (
                <div
                    className={clsx(
                        'border-t px-3 py-3 space-y-3 max-h-[48vh] overflow-y-auto overscroll-contain',
                        isDark ? 'border-white/10' : 'border-gray-200',
                    )}
                >
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setView('structured')}
                            className={clsx(
                                'text-[11px] px-2 py-1 rounded border',
                                view === 'structured'
                                    ? (isDark ? 'border-white/30 text-neutral-100' : 'border-gray-400 text-gray-900')
                                    : (isDark ? 'border-white/10 text-neutral-400' : 'border-gray-200 text-gray-600'),
                            )}
                        >
                            {t('editor.promptViewStructured')}
                        </button>
                        <button
                            onClick={() => setView('raw')}
                            className={clsx(
                                'text-[11px] px-2 py-1 rounded border',
                                view === 'raw'
                                    ? (isDark ? 'border-white/30 text-neutral-100' : 'border-gray-400 text-gray-900')
                                    : (isDark ? 'border-white/10 text-neutral-400' : 'border-gray-200 text-gray-600'),
                            )}
                        >
                            {t('editor.promptViewRaw')}
                        </button>
                        <button
                            onClick={onRefresh}
                            className={clsx('text-[11px] px-2 py-1 rounded border inline-flex items-center gap-1', isDark ? 'border-white/10 text-neutral-300' : 'border-gray-200 text-gray-700')}
                        >
                            <RefreshCcw className="w-3 h-3" />
                            {t('common.refresh')}
                        </button>
                    </div>

                    {loading && (
                        <div className={clsx('text-[11px]', isDark ? 'text-neutral-400' : 'text-gray-500')}>
                            {t('editor.promptLoading')}
                        </div>
                    )}
                    {error && (
                        <div className={clsx('text-[11px]', isDark ? 'text-rose-200' : 'text-rose-700')}>
                            {error}
                        </div>
                    )}

                    {!loading && data && view === 'structured' && (
                        <div className="space-y-2">
                            <div className={clsx('text-[11px]', isDark ? 'text-neutral-300' : 'text-gray-700')}>
                                <span className={clsx('font-medium', isDark ? 'text-neutral-100' : 'text-gray-900')}>
                                    {t('editor.promptGoal')}:&nbsp;
                                </span>
                                {data.structured.goal}
                            </div>
                            <div>
                                <div className={clsx('text-[11px] font-medium mb-1', isDark ? 'text-neutral-100' : 'text-gray-900')}>
                                    {t('editor.promptContextRefs')}
                                </div>
                                <div className={clsx('text-[11px] space-y-1', isDark ? 'text-neutral-300' : 'text-gray-700')}>
                                    {(data.structured.contextRefs || []).map((item, index) => (
                                        <div key={`${item}-${index}`}>{renderContextRef(item)}</div>
                                    ))}
                                </div>
                            </div>
                            {Array.isArray(data.usedWorldLore) && data.usedWorldLore.length > 0 && (
                                <div>
                                    <div className={clsx('text-[11px] font-medium mb-1', isDark ? 'text-neutral-100' : 'text-gray-900')}>
                                        {t('map.promptUsedLore')}
                                    </div>
                                    <div className={clsx('space-y-1', isDark ? 'text-neutral-300' : 'text-gray-700')}>
                                        {data.usedWorldLore.map((lore) => (
                                            <div key={lore.id} className="text-[11px]">
                                                {lore.title}: {lore.excerpt}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <div className={clsx('text-[11px] font-medium mb-1', isDark ? 'text-neutral-100' : 'text-gray-900')}>
                                    {t('editor.promptParams')}
                                </div>
                                {paramEntries.length > 0 && (
                                    <div className={clsx('mb-2 space-y-1', isDark ? 'text-neutral-300' : 'text-gray-700')}>
                                        {paramEntries.map((entry) => (
                                            <div key={entry.key} className="text-[11px]">
                                                <span className={clsx('font-medium', isDark ? 'text-neutral-100' : 'text-gray-900')}>{entry.key}</span>
                                                : {String(entry.value)}
                                                {renderParamDesc(entry.key) ? (
                                                    <span className={clsx('ml-2', isDark ? 'text-neutral-400' : 'text-gray-500')}>
                                                        ({renderParamDesc(entry.key)})
                                                    </span>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <pre className={clsx('whitespace-pre-wrap text-[11px] rounded border p-2', isDark ? 'border-white/10 bg-black/20 text-neutral-300' : 'border-gray-200 bg-white text-gray-700')}>
                                    {paramsText}
                                </pre>
                            </div>
                            <div>
                                <div className={clsx('text-[11px] font-medium mb-1', isDark ? 'text-neutral-100' : 'text-gray-900')}>
                                    {t('editor.promptConstraints')}
                                </div>
                                <div className={clsx('text-[11px] space-y-1', isDark ? 'text-neutral-300' : 'text-gray-700')}>
                                    {(data.structured.constraints || []).map((item, index) => (
                                        <div key={`${item}-${index}`}>{item}</div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && data && view === 'raw' && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => void handleCopyRaw()}
                                    className={clsx('text-[11px] px-2 py-1 rounded border inline-flex items-center gap-1', isDark ? 'border-white/10 text-neutral-300' : 'border-gray-200 text-gray-700')}
                                >
                                    <Copy className="w-3 h-3" />
                                    {t('common.copy')}
                                </button>
                                {copyStatus && (
                                    <span className={clsx('text-[11px]', isDark ? 'text-neutral-400' : 'text-gray-500')}>
                                        {copyStatus}
                                    </span>
                                )}
                            </div>
                            <pre className={clsx('whitespace-pre-wrap text-[11px] rounded border p-2 max-h-56 overflow-auto', isDark ? 'border-white/10 bg-black/20 text-neutral-300' : 'border-gray-200 bg-white text-gray-700')}>
                                {data.rawPrompt}
                            </pre>
                        </div>
                    )}

                    <div>
                        <label className={clsx('block text-[11px] mb-1', isDark ? 'text-neutral-300' : 'text-gray-700')}>
                            {t('editor.promptOverride')}
                        </label>
                        <div className="mb-1 flex items-center gap-2">
                            {isOverridden && (
                                <span className={clsx('text-[11px]', isDark ? 'text-amber-300' : 'text-amber-700')}>
                                    {t('editor.promptOverrideChanged')}
                                </span>
                            )}
                            <button
                                onClick={() => onEditablePromptChange(data?.editableUserPrompt || '')}
                                className={clsx('text-[11px] px-2 py-0.5 rounded border', isDark ? 'border-white/10 text-neutral-300' : 'border-gray-200 text-gray-700')}
                                type="button"
                            >
                                {t('editor.promptOverrideReset')}
                            </button>
                        </div>
                        {isOverridden && (
                            <div className={clsx('mb-2 rounded border p-2 text-[11px] space-y-1', isDark ? 'border-white/10 bg-black/20 text-neutral-300' : 'border-gray-200 bg-white text-gray-700')}>
                                <div className={clsx('font-medium', isDark ? 'text-neutral-100' : 'text-gray-900')}>
                                    {t('editor.promptDiffTitle')}
                                </div>
                                <div>
                                    {t('editor.promptDiffSummary', {
                                        added: diffMeta.added.length,
                                        removed: diffMeta.removed.length,
                                    })}
                                </div>
                                {semanticDiff.length > 0 && (
                                    <div className="space-y-0.5">
                                        {semanticDiff.map((item, index) => (
                                            <div key={`${item}-${index}`}>- {item}</div>
                                        ))}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setShowRawDiff((prev) => !prev)}
                                    className={clsx('text-[11px] underline', isDark ? 'text-neutral-300' : 'text-gray-700')}
                                >
                                    {showRawDiff ? t('editor.promptDiffHideRaw') : t('editor.promptDiffShowRaw')}
                                </button>
                                {showRawDiff && (
                                    <div className="space-y-1">
                                        {diffMeta.added.length > 0 && (
                                            <div>
                                                <div className={clsx('font-medium', isDark ? 'text-emerald-200' : 'text-emerald-700')}>
                                                    {t('editor.promptDiffAdded')}
                                                </div>
                                                <div className="space-y-0.5">
                                                    {diffMeta.added.slice(0, 8).map((line, index) => (
                                                        <div key={`added-${index}`}>+ {summarizeDiffLine(line)}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {diffMeta.removed.length > 0 && (
                                            <div>
                                                <div className={clsx('font-medium', isDark ? 'text-rose-200' : 'text-rose-700')}>
                                                    {t('editor.promptDiffRemoved')}
                                                </div>
                                                <div className="space-y-0.5">
                                                    {diffMeta.removed.slice(0, 8).map((line, index) => (
                                                        <div key={`removed-${index}`}>- {summarizeDiffLine(line)}</div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        <textarea
                            value={editablePrompt}
                            onChange={(event) => onEditablePromptChange(event.target.value)}
                            rows={5}
                            className={clsx('w-full rounded border px-2 py-2 text-[11px] resize-y', isDark ? 'bg-black/20 border-white/10 text-neutral-200 placeholder:text-neutral-500' : 'bg-white border-gray-200 text-gray-800 placeholder:text-gray-400')}
                            placeholder={t('editor.promptOverridePlaceholder')}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
