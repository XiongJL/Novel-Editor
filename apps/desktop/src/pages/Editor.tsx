import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Settings, ChevronRight, LayoutGrid, FileText, Sparkles, ScrollText, Loader2 } from 'lucide-react';
import NarrativeMatrix from '../components/StoryWorkbench/NarrativeMatrix';
import Sidebar from '../components/Sidebar';
import ActivityBar, { ActivityTab } from '../components/ActivityBar';
import SettingsModal from '../components/SettingsModal';
import MapSidebar from '../components/MapWorkbench/MapSidebar';
import MapCanvasView from '../components/MapWorkbench/MapCanvas';
import { useTranslation } from 'react-i18next';
import { useEditorPreferences } from '../hooks/useEditorPreferences';
import { useShortcuts } from '../hooks/useShortcuts';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import LexicalChapterEditor from '../components/LexicalEditor';
import { LexicalEditor, $getRoot, $getSelection, $isRangeSelection, $getNodeByKey, $isTextNode, $createRangeSelection, $setSelection, $createParagraphNode, $createTextNode } from 'lexical';
import { $isMarkNode, $unwrapMarkNode, $wrapSelectionInMarkNode } from '@lexical/mark';
import { $isIdeaMarkNode } from '../components/LexicalEditor/nodes/IdeaMarkNode';
import UnifiedSearchWorkbench from '../components/SearchWorkbench/UnifiedSearchWorkbench';
import SearchSidebar from '../components/SearchWorkbench/SearchSidebar';
import { FlowModeButton } from '../components/FlowModeButton';
import { GlobalIdeaModal } from '../components/GlobalIdeaModal';
import { RecentFile } from '../components/RecentFilesDropdown';
import WorldWorkbench from '../components/WorldWorkbench/WorldWorkbench';
import AIWorkbenchPanel from '../components/AIWorkbench/AIWorkbenchPanel';
import AIWorkbenchDraftDock from '../components/AIWorkbench/AIWorkbenchDraftDock';
import type { CreativeAssetsDraft, DraftSelection, DraftSessionRecord } from '../components/AIWorkbench/types';
import PlotSidebar from '../components/StoryWorkbench/PlotSidebar';
import PlotContextMenu from '../components/StoryWorkbench/PlotContextMenu';
import PlotAnchorModal from '../components/StoryWorkbench/PlotAnchorModal';
import { PlotContextMenuData } from '../components/LexicalEditor/plugins/PlotContextMenuPlugin';
import { $createPlotAnchorNode } from '../components/LexicalEditor/nodes/PlotAnchorNode';
import { $isPlotAnchorNode } from '../components/LexicalEditor/nodes/PlotAnchorNode';
import { usePlotSystem } from '../hooks/usePlotSystem';
import { PlotPointModal } from '../components/StoryWorkbench/PlotPointModal';
import { Idea, Novel, Volume, Chapter } from '../types';
import { formatAiErrorFromUnknown } from '../utils/aiError';


import { ContinueWritingModal, type ContinueWritingConfig } from '../components/Editor/ContinueWritingModal';
import type { PromptPreviewData } from '../components/AIPromptPreview/types';


// Global variable to track active chapter metadata to avoid closure staleness
let activeChapterMetadata: { id: string; title: string } | null = null;

interface EditorProps {
    novelId: string;
    onBack: () => void;
}

type TitleGenerationStage = 'requesting' | 'generating' | 'parsing';

function extractPlainTextFromLexical(content: string): string {
    if (!content?.trim()) return '';
    try {
        const parsed = JSON.parse(content);
        const texts: string[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== 'object') return;
            if (typeof node.text === 'string') {
                texts.push(node.text);
            }
            if (Array.isArray(node.children)) {
                node.children.forEach(walk);
            }
        };
        walk(parsed?.root || parsed);
        return texts.join(' ').replace(/\s+/g, ' ').trim();
    } catch {
        return content.replace(/\s+/g, ' ').trim();
    }
}

function stripRepeatedPrefixFromGeneration(existing: string, generated: string): string {
    const existingRaw = (existing || '').trim();
    const generatedRaw = (generated || '').trimStart();
    if (!generatedRaw) return '';
    if (!existingRaw) return generatedRaw;

    // Safety rule: only trim GENERATED prefix overlap; never mutate existing user text.
    if (generatedRaw.startsWith(existingRaw)) {
        return generatedRaw.slice(existingRaw.length).trimStart();
    }

    const maxOverlap = Math.min(existingRaw.length, generatedRaw.length, 2400);
    for (let len = maxOverlap; len >= 80; len -= 1) {
        if (existingRaw.slice(-len) === generatedRaw.slice(0, len)) {
            return generatedRaw.slice(len).trimStart();
        }
    }
    return generatedRaw;
}

const EMPTY_CREATIVE_DRAFT: CreativeAssetsDraft = {
    plotLines: [],
    plotPoints: [],
    characters: [],
    items: [],
    skills: [],
    maps: [],
};

const EMPTY_DRAFT_SELECTION: DraftSelection = {
    plotLines: [],
    plotPoints: [],
    characters: [],
    items: [],
    skills: [],
    maps: [],
};

export default function Editor({ novelId, onBack }: EditorProps) {
    const { t, i18n } = useTranslation();
    const { preferences, updatePreference } = useEditorPreferences();
    const { shortcuts, isMatch } = useShortcuts();

    const [viewMode, setViewMode] = useState<'editor' | 'matrix' | 'map'>('editor');
    const [activeMapId, setActiveMapId] = useState<string | null>(null);
    const [mapCharacters, setMapCharacters] = useState<import('../types').Character[]>([]);

    // --- 1. Core Data State ---
    const [novel, setNovel] = useState<Novel | null>(null);
    const [volumes, setVolumes] = useState<Volume[]>([]);
    const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
    const [titleGenStage, setTitleGenStage] = useState<TitleGenerationStage | null>(null);
    const [titleGenStatus, setTitleGenStatus] = useState('');
    const [titleCandidates, setTitleCandidates] = useState<Array<{ title: string; styleTag: string }>>([]);
    const [isRebuildingSummary, setIsRebuildingSummary] = useState(false);
    const [summaryStatus, setSummaryStatus] = useState('');
    const [isContinueModalOpen, setIsContinueModalOpen] = useState(false);
    const [isContinuing, setIsContinuing] = useState(false);
    const [continueStatus, setContinueStatus] = useState('');
    const [isContinuePreviewOpen, setIsContinuePreviewOpen] = useState(false);
    const [continuePreviewText, setContinuePreviewText] = useState('');
    const [continuePreviewBaseTail, setContinuePreviewBaseTail] = useState('');
    const [continuePromptPreview, setContinuePromptPreview] = useState<PromptPreviewData | null>(null);
    const [continuePromptLoading, setContinuePromptLoading] = useState(false);
    const [continuePromptError, setContinuePromptError] = useState('');
    const [continuePromptOverride, setContinuePromptOverride] = useState('');
    const [continuePromptDefault, setContinuePromptDefault] = useState('');
    const [continuePromptDirty, setContinuePromptDirty] = useState(false);
    const [continueConfig, setContinueConfig] = useState<ContinueWritingConfig>({
        ideaIds: [],
        targetLength: '500',
        creativityPreset: 'balanced',
        contextChapterCount: 3,
        style: 'default',
        tone: 'balanced',
        pace: 'medium',
        userIntent: '',
        currentLocation: '',
    });

    // --- 2. Story / Plot System ---
    const { addAnchor, removeAnchor, createPlotPoint, updatePlotPoint, deletePlotPoint, plotLines, isLoading: isPlotLoading } = usePlotSystem(novelId);
    const [plotContextMenuData, setPlotContextMenuData] = useState<PlotContextMenuData | null>(null);
    const [isPlotAnchorModalOpen, setIsPlotAnchorModalOpen] = useState(false);
    const [pendingAnchorSelection, setPendingAnchorSelection] = useState<PlotContextMenuData | null>(null);
    const [isPlotPointModalOpen, setIsPlotPointModalOpen] = useState(false);
    const [plotPointCreateData, setPlotPointCreateData] = useState<any>(null);
    const [editingPlotPoint, setEditingPlotPoint] = useState<any>(null); // For future editing 
    const [isPlotPointCreateMode, setIsPlotPointCreateMode] = useState(false);

    // --- 3. UI Control State ---
    const [activeTab, setActiveTab] = useState<ActivityTab>('explorer');
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'novel' | 'shortcuts' | 'backup' | 'ai' | undefined>(undefined);
    const [isGlobalIdeaModalOpen, setIsGlobalIdeaModalOpen] = useState(false);
    const [lastCreatedVolumeId, setLastCreatedVolumeId] = useState<string | null>(null);
    const [creativeDraft, setCreativeDraft] = useState<CreativeAssetsDraft>({ ...EMPTY_CREATIVE_DRAFT });
    const [creativeSelection, setCreativeSelection] = useState<DraftSelection>({ ...EMPTY_DRAFT_SELECTION });
    const [creativeDraftSession, setCreativeDraftSession] = useState<DraftSessionRecord | null>(null);
    const [isDraftDockOpen, setIsDraftDockOpen] = useState(false);
    const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveStatusText, setSaveStatusText] = useState('');
    const [editorRefreshToken, setEditorRefreshToken] = useState(0);

    useEffect(() => {
        setCreativeDraft({ ...EMPTY_CREATIVE_DRAFT });
        setCreativeSelection({ ...EMPTY_DRAFT_SELECTION });
        setCreativeDraftSession(null);
        setIsDraftDockOpen(false);
    }, [novelId]);

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        const reloadMapCharacters = async () => {
            try {
                const next = await window.db.getCharacters(novelId);
                setMapCharacters(next);
            } catch (error) {
                console.error('[Editor] failed to refresh map characters:', error);
            }
        };
        const unsubscribeAutomation = window.automation?.onDataChanged?.(({ method }) => {
            if (
                method === 'character.create_batch' ||
                method === 'story_patch.apply' ||
                method === 'draft.commit'
            ) {
                void reloadMapCharacters();
            }
            if (
                method === 'creative_assets.generate_draft' ||
                method === 'outline.generate_draft' ||
                method === 'draft.update' ||
                method === 'draft.commit' ||
                method === 'draft.discard'
            ) {
                void (async () => {
                    try {
                        const session = await window.automation.invoke('draft.get_active', {
                            novelId,
                            workspace: 'ai-workbench',
                        }, 'desktop-ui') as DraftSessionRecord | null;

                        creativeDraftSessionRef.current = session;
                        setCreativeDraftSession(session);
                        if (!session || session.status !== 'draft') {
                            setCreativeDraft({ ...EMPTY_CREATIVE_DRAFT });
                            setCreativeSelection({ ...EMPTY_DRAFT_SELECTION });
                            return;
                        }
                        const payload = session.payload as CreativeAssetsDraft;
                        setCreativeDraft({
                            plotLines: Array.isArray(payload.plotLines) ? payload.plotLines : [],
                            plotPoints: Array.isArray(payload.plotPoints) ? payload.plotPoints : [],
                            characters: Array.isArray(payload.characters) ? payload.characters : [],
                            items: Array.isArray(payload.items) ? payload.items : [],
                            skills: Array.isArray(payload.skills) ? payload.skills : [],
                            maps: Array.isArray(payload.maps) ? payload.maps : [],
                        });
                        setCreativeSelection(session.selection ?? { ...EMPTY_DRAFT_SELECTION });

                        if (method === 'creative_assets.generate_draft' || method === 'outline.generate_draft') {
                            setIsDraftDockOpen(true);
                            setViewMode('editor');
                        }
                    } catch (error) {
                        console.error('[Editor] failed to refresh creative draft session:', error);
                    }
                })();
            }
            if (method === 'chapter.create' || method === 'chapter.save') {
                void (async () => {
                    try {
                        const refreshedVolumes = await window.db.getVolumes(novelId);
                        setVolumes(refreshedVolumes);

                        const current = chapterRef.current;
                        if (!current) return;
                        const latest = await window.db.getChapter(current.id);
                        if (!latest) return;
                        const shouldRefreshEditor =
                            latest.content !== contentRef.current ||
                            latest.title !== titleRef.current;

                        setCurrentChapter(latest);
                        setTitle(latest.title);
                        setContent(latest.content);
                        contentRef.current = latest.content;
                        titleRef.current = latest.title;
                        if (shouldRefreshEditor) {
                            setEditorRefreshToken((prev) => prev + 1);
                        }
                    } catch (error) {
                        console.error('[Editor] failed to refresh chapter after automation update:', error);
                    }
                })();
            }
            if (method === 'chapter.generate_draft') {
                if (!chapterRef.current) return;
                void (async () => {
                    try {
                        const current = chapterRef.current;
                        if (!current) return;
                        const session = await window.automation.invoke('draft.get_active', {
                            novelId,
                            workspace: 'chapter-editor',
                            type: 'chapter-draft',
                        }, 'desktop-ui') as DraftSessionRecord | null;
                        if (!session || session.status !== 'draft' || session.chapterId !== current.id) {
                            return;
                        }
                        const payload = session.payload as ChapterDraftPayload;
                        const generatedText = (payload.generatedText || '').trim();
                        if (!generatedText) return;

                        setContinuePreviewText(generatedText);
                        setContinuePreviewBaseTail((payload.baseContent || '').slice(-600));

                        const requestedPresentation = payload.presentation;
                        const normalizedPresentation = requestedPresentation === 'silent' || requestedPresentation === 'toast' || requestedPresentation === 'modal'
                            ? requestedPresentation
                            : undefined;
                        const defaultPresentation = session.origin === 'mcp-bridge' ? 'toast' : 'modal';
                        const presentation = normalizedPresentation ?? defaultPresentation;

                        if (presentation === 'modal') {
                            setIsContinuePreviewOpen(true);
                            setContinueStatus(t('editor.continueNeedConfirm'));
                            return;
                        }

                        if (presentation === 'toast') {
                            setContinueStatus(t('editor.continueDraftReadyToast', '续写草稿已生成（未自动弹窗）'));
                            toast.message(
                                t('editor.continueDraftReadyTitle', '续写草稿已生成'),
                                {
                                    description: t('editor.continueDraftReadyDescription', '为避免打断当前写作，本次未自动弹窗。'),
                                    action: {
                                        label: t('editor.continueDraftReadyAction', '查看草稿'),
                                        onClick: () => setIsContinuePreviewOpen(true),
                                    },
                                },
                            );
                            window.setTimeout(() => setContinueStatus(''), 4000);
                            return;
                        }

                        setContinueStatus(t('editor.continueDraftReadySilent', '续写草稿已生成（静默模式）'));
                        window.setTimeout(() => setContinueStatus(''), 3000);
                    } catch (error) {
                        console.error('[Editor] failed to refresh chapter draft preview:', error);
                    }
                })();
                return;
            }
            if (method === 'chapter.generate_draft') {
                if (!chapterRef.current) return;
                void (async () => {
                    try {
                        const current = chapterRef.current;
                        if (!current) return;
                        const session = await window.automation.invoke('draft.get_active', {
                            novelId,
                            workspace: 'chapter-editor',
                            type: 'chapter-draft',
                        }, 'desktop-ui') as DraftSessionRecord | null;
                        if (!session || session.status !== 'draft' || session.chapterId !== current.id) {
                            return;
                        }
                        const payload = session.payload as ChapterDraftPayload;
                        const generatedText = (payload.generatedText || '').trim();
                        if (!generatedText) return;
                        setContinuePreviewText(generatedText);
                        setContinuePreviewBaseTail((payload.baseContent || '').slice(-600));
                        setIsContinuePreviewOpen(true);
                        setContinueStatus(t('editor.continueNeedConfirm', '续写已生成，请先确认再插入'));
                    } catch (error) {
                        console.error('[Editor] failed to refresh chapter draft preview:', error);
                    }
                })();
            }
        });
        return () => unsubscribeAutomation?.();
    }, [novelId, t]);

    // --- 4. Flow Mode State ---
    const [isFlowMode, setIsFlowMode] = useState(false);
    const [isFlowEntering, setIsFlowEntering] = useState(false);
    const [isFlowSwitching, setIsFlowSwitching] = useState(false);

    // --- 5. Jump & Temporary State ---
    const [shakingIdeaId, setShakingIdeaId] = useState<string | null>(null);
    const [highlightedIdeaId, setHighlightedIdeaId] = useState<string | null>(null);
    const [pendingJumpIdea, setPendingJumpIdea] = useState<Idea | null>(null);
    const [pendingSearchJump, setPendingSearchJump] = useState<{ chapterId: string; keyword: string; context?: string } | null>(null);
    const hasContinuePreviewDraft = continuePreviewText.trim().length > 0;

    // --- 6. Refs ---
    const editorRef = useRef<LexicalEditor | null>(null);
    const contentRef = useRef(content);
    const titleRef = useRef(title);
    const chapterRef = useRef(currentChapter);
    const creativeDraftSessionRef = useRef<DraftSessionRecord | null>(null);
    const creativeDraftUpdateQueueRef = useRef(Promise.resolve());
    const isSwitchingChapterRef = useRef(false);
    const saveQueueRef = useRef(Promise.resolve());
    const saveStatusTimerRef = useRef<number | null>(null);
    const titleGenTimersRef = useRef<number[]>([]);
    const titleGenStatusTimerRef = useRef<number | null>(null);
    const titleGenActiveRef = useRef(false);
    const continuePromptTimerRef = useRef<number | null>(null);

    useEffect(() => {
        contentRef.current = content;
        titleRef.current = title;
        chapterRef.current = currentChapter;
        creativeDraftSessionRef.current = creativeDraftSession;

        // Sync global metadata whenever currentChapter changes
        if (currentChapter) {
            activeChapterMetadata = { id: currentChapter.id, title: currentChapter.title };
        }
    }, [content, title, currentChapter, creativeDraftSession]);

    const applyCreativeDraftSession = useCallback((session: DraftSessionRecord | null) => {
        creativeDraftSessionRef.current = session;
        setCreativeDraftSession(session);
        if (!session || session.status !== 'draft') {
            setCreativeDraft({ ...EMPTY_CREATIVE_DRAFT });
            setCreativeSelection({ ...EMPTY_DRAFT_SELECTION });
            return;
        }
        const payload = session.payload as CreativeAssetsDraft;
        setCreativeDraft({
            plotLines: Array.isArray(payload.plotLines) ? payload.plotLines : [],
            plotPoints: Array.isArray(payload.plotPoints) ? payload.plotPoints : [],
            characters: Array.isArray(payload.characters) ? payload.characters : [],
            items: Array.isArray(payload.items) ? payload.items : [],
            skills: Array.isArray(payload.skills) ? payload.skills : [],
            maps: Array.isArray(payload.maps) ? payload.maps : [],
        });
        setCreativeSelection(session.selection ?? { ...EMPTY_DRAFT_SELECTION });
    }, []);

    const refreshCreativeDraftSession = useCallback(async () => {
        try {
            const session = await window.automation.invoke('draft.get_active', {
                novelId,
                workspace: 'ai-workbench',
            }, 'desktop-ui') as DraftSessionRecord | null;
            applyCreativeDraftSession(session);
        } catch (error) {
            console.error('[Editor] failed to refresh creative draft session:', error);
        }
    }, [applyCreativeDraftSession, novelId]);

    useEffect(() => {
        void refreshCreativeDraftSession();
        const timer = window.setInterval(() => {
            void refreshCreativeDraftSession();
        }, 2500);
        return () => window.clearInterval(timer);
    }, [refreshCreativeDraftSession]);

    const queueCreativeDraftSync = useCallback((nextDraft: CreativeAssetsDraft, nextSelection: DraftSelection) => {
        const currentSession = creativeDraftSessionRef.current;
        setCreativeDraft(nextDraft);
        setCreativeSelection(nextSelection);
        if (!currentSession?.draftSessionId || currentSession.status !== 'draft') {
            return;
        }
        const optimisticSession: DraftSessionRecord = {
            ...currentSession,
            payload: nextDraft,
            selection: nextSelection,
        };
        creativeDraftSessionRef.current = optimisticSession;
        setCreativeDraftSession(optimisticSession);
        creativeDraftUpdateQueueRef.current = creativeDraftUpdateQueueRef.current
            .then(async () => {
                const sessionForUpdate = creativeDraftSessionRef.current;
                if (!sessionForUpdate?.draftSessionId || sessionForUpdate.status !== 'draft') return;
                const updated = await window.automation.invoke('draft.update', {
                    draftSessionId: sessionForUpdate.draftSessionId,
                    version: sessionForUpdate.version,
                    payload: nextDraft,
                    selection: nextSelection,
                }, 'desktop-ui') as DraftSessionRecord;
                applyCreativeDraftSession(updated);
            })
            .catch((error) => {
                console.error('[Editor] failed to sync creative draft session:', error);
                void refreshCreativeDraftSession();
            });
    }, [applyCreativeDraftSession, refreshCreativeDraftSession]);

    const handleCreativeDraftChange = useCallback((next: CreativeAssetsDraft) => {
        queueCreativeDraftSync(next, creativeSelection);
    }, [creativeSelection, queueCreativeDraftSync]);

    const handleCreativeSelectionChange = useCallback((next: DraftSelection) => {
        queueCreativeDraftSync(creativeDraft, next);
    }, [creativeDraft, queueCreativeDraftSync]);

    const handleCreativeDraftAndSelectionChange = useCallback((nextDraft: CreativeAssetsDraft, nextSelection: DraftSelection) => {
        queueCreativeDraftSync(nextDraft, nextSelection);
    }, [queueCreativeDraftSync]);

    const handleCreativeDraftSessionChange = useCallback((next: DraftSessionRecord | null) => {
        applyCreativeDraftSession(next);
    }, [applyCreativeDraftSession]);

    const clearTitleGenTimers = useCallback(() => {
        titleGenTimersRef.current.forEach((id) => window.clearTimeout(id));
        titleGenTimersRef.current = [];
    }, []);

    const clearTitleGenStatusTimer = useCallback(() => {
        if (titleGenStatusTimerRef.current !== null) {
            window.clearTimeout(titleGenStatusTimerRef.current);
            titleGenStatusTimerRef.current = null;
        }
    }, []);

    const clearSaveStatusTimer = useCallback(() => {
        if (saveStatusTimerRef.current !== null) {
            window.clearTimeout(saveStatusTimerRef.current);
            saveStatusTimerRef.current = null;
        }
    }, []);

    const scheduleSaveStatusReset = useCallback((delay = 2200) => {
        clearSaveStatusTimer();
        saveStatusTimerRef.current = window.setTimeout(() => {
            setSaveState('idle');
            setSaveStatusText('');
            saveStatusTimerRef.current = null;
        }, delay);
    }, [clearSaveStatusTimer]);

    const normalizeContinueTargetLength = useCallback((value: string) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 500;
        return Math.max(100, Math.min(4000, parsed));
    }, []);

    useEffect(() => {
        return () => {
            clearTitleGenTimers();
            clearTitleGenStatusTimer();
            clearSaveStatusTimer();
            titleGenActiveRef.current = false;
            if (continuePromptTimerRef.current !== null) {
                window.clearTimeout(continuePromptTimerRef.current);
                continuePromptTimerRef.current = null;
            }
        };
    }, [clearSaveStatusTimer, clearTitleGenStatusTimer, clearTitleGenTimers]);

    // --- 7. UI Actions ---
    const toggleFlowMode = useCallback(async () => {
        setIsFlowSwitching(true);
        const nextState = !isFlowMode;

        setTimeout(async () => {
            try {
                if (nextState) {
                    document.body.classList.add('flow-mode-active');
                    setIsSidePanelOpen(false);
                    setIsFlowEntering(true);
                    setTimeout(() => setIsFlowEntering(false), 1500);
                } else {
                    document.body.classList.remove('flow-mode-active');
                    setIsSidePanelOpen(true);
                }
                setIsFlowMode(nextState);
            } catch (err) {
                console.error('FlowMode toggle error:', err);
            }

            try {
                if ((window as any).electron?.toggleFullScreen) {
                    await (window as any).electron.toggleFullScreen();
                }
            } catch (e) { }

            setTimeout(() => {
                if (editorRef.current) editorRef.current.focus();
            }, 500);

            setTimeout(() => {
                setIsFlowSwitching(false);
            }, 400);
        }, 100);
    }, [isFlowMode]);

    const clearSearchHighlights = () => {
        if ('highlights' in CSS) {
            (CSS as any).highlights.delete('search-results');
        }
    };

    const resetContinuePromptPreview = useCallback(() => {
        setContinuePromptPreview(null);
        setContinuePromptDefault('');
        setContinuePromptDirty(false);
        setContinuePromptOverride('');
        setContinuePromptError('');
        setContinuePromptLoading(false);
    }, []);

    const closeContinueModal = useCallback(() => {
        setIsContinueModalOpen(false);
        resetContinuePromptPreview();
        setContinueConfig((prev) => ({ ...prev, userIntent: '', currentLocation: '' }));
    }, [resetContinuePromptPreview]);


    const handleTabChange = (tab: ActivityTab) => {
        if (tab === 'settings') {
            setSettingsInitialTab('general');
            setIsSettingsOpen(true);
            return;
        }
        if (activeTab === tab) {
            setIsSidePanelOpen(!isSidePanelOpen);
        } else {
            if (activeTab === 'search') clearSearchHighlights();
            setActiveTab(tab);
            setIsSidePanelOpen(true);
        }
    };

    const handleGenerateTitle = useCallback(async () => {
        if (!currentChapter) return;
        const chapterContent = contentRef.current || '';
        if (!chapterContent.trim()) return;

        setIsGeneratingTitle(true);
        clearTitleGenTimers();
        clearTitleGenStatusTimer();
        titleGenActiveRef.current = true;
        setTitleGenStage('requesting');
        setTitleGenStatus(t('editor.titleGenRequesting', '正在请求模型...'));
        titleGenTimersRef.current.push(window.setTimeout(() => {
            if (!titleGenActiveRef.current) return;
            setTitleGenStage('generating');
            setTitleGenStatus(t('editor.titleGenGenerating', '正在生成标题候选...'));
        }, 500));
        titleGenTimersRef.current.push(window.setTimeout(() => {
            if (!titleGenActiveRef.current) return;
            setTitleGenStage('parsing');
            setTitleGenStatus(t('editor.titleGenParsing', '正在整理结果...'));
        }, 1400));
        try {
            const result = await window.ai.generateTitle({
                novelId,
                chapterId: currentChapter.id,
                content: chapterContent,
                count: 6,
            });

            setTitleGenStage('parsing');
            setTitleGenStatus(t('editor.titleGenParsing', '正在整理结果...'));
            const candidates = (result.candidates || [])
                .map((item) => ({
                    title: String(item?.title || '').trim(),
                    styleTag: String(item?.styleTag || '').trim() || t('editor.aiTitleStyle.stable', '稳健推进'),
                }))
                .filter((item) => Boolean(item.title))
                .slice(0, 10);

            setTitleCandidates(candidates);

            // Auto-fill first candidate as a quick win, user can still pick others in dropdown.
            if (candidates[0]) setTitle(candidates[0].title);
            setTitleGenStatus(t('editor.titleGenDone', '标题候选已更新'));
            clearTitleGenStatusTimer();
            titleGenStatusTimerRef.current = window.setTimeout(() => setTitleGenStatus(''), 2600);
        } catch (error) {
            console.error('[Editor] AI title generation failed:', error);
            setTitleGenStatus(formatAiErrorFromUnknown(error, t('editor.titleGenFailed', '标题生成失败，请稍后重试')));
            clearTitleGenStatusTimer();
            titleGenStatusTimerRef.current = window.setTimeout(() => setTitleGenStatus(''), 4200);
        } finally {
            titleGenActiveRef.current = false;
            clearTitleGenTimers();
            setTitleGenStage(null);
            setIsGeneratingTitle(false);
        }
    }, [clearTitleGenStatusTimer, clearTitleGenTimers, currentChapter, novelId, t]);

    const handleRebuildChapterSummary = useCallback(async () => {
        if (!currentChapter) return;
        setIsRebuildingSummary(true);
        try {
            const result = await window.ai.rebuildChapterSummary(currentChapter.id);
            if (result.ok) {
                setSummaryStatus(t('editor.summaryRebuildQueued', '已触发摘要生成任务'));
            } else {
                setSummaryStatus(`${t('editor.summaryRebuildFailed', '摘要触发失败')}: ${result.detail || ''}`);
            }
        } catch (error) {
            console.error('[Editor] chapter summary rebuild failed:', error);
            setSummaryStatus(formatAiErrorFromUnknown(error, t('editor.summaryRebuildFailed', '摘要触发失败')));
        } finally {
            setIsRebuildingSummary(false);
            window.setTimeout(() => setSummaryStatus(''), 4000);
        }
    }, [currentChapter, t]);

    const appendGeneratedTextToEditor = useCallback((generated: string, existingPlainText?: string) => {
        if (!generated.trim()) return;
        const deduped = stripRepeatedPrefixFromGeneration(existingPlainText || '', generated);
        if (!deduped.trim()) return;
        const editor = editorRef.current;
        if (!editor) return;
        editor.update(() => {
            const root = $getRoot();
            const normalized = deduped.replace(/\r\n/g, '\n').trim();
            // 按单个换行分割，每行一个段落，确保每段都能获得 CSS text-indent 首行缩进
            // 同时去除段首的全角/半角空格（缩进由 CSS text-indent 统一控制）
            const blocks = normalized.split(/\n+/).map((block) => block.replace(/^[\s\u3000]+/, '').trim()).filter(Boolean);
            if (blocks.length === 0) return;
            blocks.forEach((block) => {
                const paragraph = $createParagraphNode();
                paragraph.append($createTextNode(block));
                root.append(paragraph);
            });
        });
    }, []);

    const handleConfirmContinueInsert = useCallback(() => {
        if (!continuePreviewText.trim()) {
            setIsContinuePreviewOpen(false);
            return;
        }
        appendGeneratedTextToEditor(continuePreviewText);
        setIsContinuePreviewOpen(false);
        setContinuePreviewText('');
        setContinuePreviewBaseTail('');
        setContinueStatus(t('editor.continueDone', '续写已完成并插入到正文末尾'));
        window.setTimeout(() => setContinueStatus(''), 5000);
    }, [appendGeneratedTextToEditor, continuePreviewText, t]);

    const refreshContinuePromptPreview = useCallback(async () => {
        if (!currentChapter || !isContinueModalOpen) return;
        const currentText = extractPlainTextFromLexical(contentRef.current || '');
        const mode: 'new_chapter' | 'continue_chapter' = currentText.trim().length === 0 ? 'new_chapter' : 'continue_chapter';
        const temperature = continueConfig.creativityPreset === 'safe'
            ? 0.4
            : continueConfig.creativityPreset === 'creative'
                ? 0.95
                : 0.7;
        setContinuePromptLoading(true);
        setContinuePromptError('');
        try {
            const preview = await window.ai.previewContinuePrompt({
                locale: i18n.language,
                mode,
                novelId,
                chapterId: currentChapter.id,
                currentContent: contentRef.current || '',
                ideaIds: continueConfig.ideaIds,
                contextChapterCount: continueConfig.contextChapterCount,
                targetLength: normalizeContinueTargetLength(continueConfig.targetLength),
                style: continueConfig.style,
                tone: continueConfig.tone,
                pace: continueConfig.pace,
                temperature,
                userIntent: continueConfig.userIntent,
                currentLocation: continueConfig.currentLocation,
            });
            setContinuePromptPreview(preview as unknown as PromptPreviewData);
            const nextDefault = preview.editableUserPrompt || '';
            setContinuePromptDefault(nextDefault);
            if (!continuePromptDirty) {
                setContinuePromptOverride(nextDefault);
            }
        } catch (error) {
            setContinuePromptError(formatAiErrorFromUnknown(error, t('editor.promptPreviewFailed')));
        } finally {
            setContinuePromptLoading(false);
        }
    }, [continueConfig, continuePromptDirty, currentChapter, isContinueModalOpen, normalizeContinueTargetLength, novelId, t]);

    useEffect(() => {
        if (!isContinueModalOpen || !currentChapter) return;
        if (continuePromptTimerRef.current !== null) {
            window.clearTimeout(continuePromptTimerRef.current);
        }
        continuePromptTimerRef.current = window.setTimeout(() => {
            void refreshContinuePromptPreview();
        }, 800);
        return () => {
            if (continuePromptTimerRef.current !== null) {
                window.clearTimeout(continuePromptTimerRef.current);
                continuePromptTimerRef.current = null;
            }
        };
    }, [
        continueConfig.ideaIds,
        continueConfig.targetLength,
        continueConfig.creativityPreset,
        continueConfig.contextChapterCount,
        continueConfig.style,
        continueConfig.tone,
        continueConfig.pace,
        currentChapter,
        isContinueModalOpen,
        refreshContinuePromptPreview,
    ]);

    const handleStartContinueWriting = useCallback(async () => {
        if (!currentChapter || isContinuing) return;

        const currentText = extractPlainTextFromLexical(contentRef.current || '');
        const hasOutline = plotLines.some((line) => (line.points?.length || 0) > 0) || plotLines.length > 0;
        const isFirstChapter = currentChapter.order === 1;
        const isBlocked = isFirstChapter && !hasOutline && currentText.length < 120;
        if (isBlocked) {
            setContinueStatus(t('editor.continueBlocked', '第一章缺少大纲且正文不足，无法直接续写。请先补大纲或先手写开头。'));
            return;
        }

        const targetLength = normalizeContinueTargetLength(continueConfig.targetLength);
        const temperature = continueConfig.creativityPreset === 'safe'
            ? 0.4
            : continueConfig.creativityPreset === 'creative'
                ? 0.95
                : 0.7;

        closeContinueModal();
        setIsContinuing(true);
        setContinueStatus(t('editor.continueGenerating', 'AI 正在续写...'));
        try {
            const mode: 'new_chapter' | 'continue_chapter' = currentText.trim().length === 0 ? 'new_chapter' : 'continue_chapter';
            const result = await window.ai.executeAction('chapter.generate', {
                locale: i18n.language,
                mode,
                novelId,
                chapterId: currentChapter.id,
                currentContent: contentRef.current || '',
                ideaIds: continueConfig.ideaIds,
                contextChapterCount: continueConfig.contextChapterCount,
                targetLength,
                style: continueConfig.style,
                tone: continueConfig.tone,
                pace: continueConfig.pace,
                temperature,
                userIntent: continueConfig.userIntent,
                currentLocation: continueConfig.currentLocation,
                overrideUserPrompt: continuePromptOverride.trim() || undefined,
            }) as {
                text: string;
                warnings?: string[];
                consistency: {
                    ok: boolean;
                    issues: string[];
                };
            };
            const dedupedText = stripRepeatedPrefixFromGeneration(currentText, result.text || '');
            if (!dedupedText.trim()) {
                setContinueStatus(t('editor.continueNoNewText', '未检测到可新增内容，请调整参数后重试'));
                return;
            }
            setContinuePreviewText(dedupedText);
            setContinuePreviewBaseTail(currentText.slice(-600));
            setIsContinuePreviewOpen(true);
            if (result.consistency?.ok === false && result.consistency.issues?.length) {
                setContinueStatus(`${t('editor.continueDoneWithIssues', '续写已完成，但有一致性提醒')}: ${result.consistency.issues[0]}`);
            } else {
                setContinueStatus(t('editor.continueNeedConfirm', '续写已生成，请先确认再插入'));
            }
        } catch (error) {
            console.error('[Editor] continue writing failed:', error);
            setContinueStatus(formatAiErrorFromUnknown(error, t('editor.continueFailed', '续写失败，请检查模型配置或稍后重试')));
        } finally {
            setIsContinuing(false);
            window.setTimeout(() => setContinueStatus(''), 6000);
        }
    }, [closeContinueModal, continueConfig, continuePromptOverride, currentChapter, isContinuing, normalizeContinueTargetLength, novelId, plotLines, t]);

    // Load Novel Details
    useEffect(() => {
        window.db.getNovels().then(novels => {
            const found = novels.find(n => n.id === novelId);
            if (found) setNovel(found);
        });
    }, [novelId]);

    // Load Recent Files
    useEffect(() => {
        if (!novelId) return;
        try {
            const stored = localStorage.getItem(`recent_files_${novelId}`);
            if (stored) {
                setRecentFiles(JSON.parse(stored));
            } else {
                setRecentFiles([]);
            }
        } catch (e) {
            console.error('Failed to load recent files');
        }
    }, [novelId]);

    // Update Recent Files Helper - UPDATED FIX
    const addToRecentFiles = useCallback((chapter: Chapter) => {
        setRecentFiles(prev => {
            // Remove existing if present
            const filtered = prev.filter(f => f.id !== chapter.id);
            const newFile: RecentFile = {
                id: chapter.id,
                title: chapter.title,
                timestamp: Date.now(),
                initialData: {
                    novelId,
                    chapterId: chapter.id // FIXED: Use passed chapter.id
                }
            };
            // Add to top, limit to 25
            const updated = [newFile, ...filtered].slice(0, 25);
            localStorage.setItem(`recent_files_${novelId}`, JSON.stringify(updated));
            return updated;
        });
    }, [novelId]);

    const handleDeleteRecent = (id: string) => {
        setRecentFiles(prev => {
            const updated = prev.filter(f => f.id !== id);
            localStorage.setItem(`recent_files_${novelId}`, JSON.stringify(updated));
            return updated;
        });
    };

    // Sync isFlowMode with manual fullscreen exit (ESC/F11 via Electron Events)
    useEffect(() => {
        if (!(window as any).electron?.onFullScreenChange) return;

        const unsubscribe = (window as any).electron.onFullScreenChange((isFullScreen: boolean) => {
            if (!isFullScreen && isFlowMode) {
                // User exited fullscreen (e.g., via ESC)
                document.body.classList.remove('flow-mode-active');
                setIsFlowMode(false);
                setIsSidePanelOpen(true);
            }
        });

        return () => unsubscribe();
    }, [isFlowMode]);

    // Load Volumes
    const loadVolumes = useCallback(async () => {
        try {
            const data = await window.db.getVolumes(novelId);
            setVolumes(data);

            // Auto-navigate logic
            if (!currentChapter && data.length > 0) {
                const lastChapterId = localStorage.getItem(`last_chapter_${novelId}`);
                let targetChapterId = lastChapterId;

                const exists = data.some(v => v.chapters.some(c => c.id === lastChapterId));

                if (!exists) {
                    if (data[0].chapters.length > 0) {
                        targetChapterId = data[0].chapters[0].id;
                    } else {
                        targetChapterId = null;
                    }
                }

                if (targetChapterId) {
                    // Pre-set global metadata if we have the info in volumes, though handleSelectChapter will also update it
                    const targetChapter = data.flatMap(v => v.chapters).find(c => c.id === targetChapterId);
                    if (targetChapter) {
                        activeChapterMetadata = { id: targetChapterId, title: targetChapter.title };
                    }
                    handleSelectChapter(targetChapterId);
                }
            }
        } catch (error) {
            console.error('Failed to load volumes:', error);
        }
    }, [novelId, currentChapter]);

    useEffect(() => {
        loadVolumes();
        // Load Ideas
        window.db.getIdeas(novelId).then(setIdeas).catch(console.error);
    }, [loadVolumes, novelId]);

    // Save Logic (Moved Before handleSelectChapter)
    const saveChanges = useCallback(async (trigger: 'manual' | 'auto' | 'lifecycle' = 'manual') => {
        const runSave = async () => {
            const currentRef = chapterRef.current;
            if (!currentRef) return;

            const contentToSave = contentRef.current;
            const titleToSave = titleRef.current;

            if (chapterRef.current?.id !== currentRef.id) return;

            const hasContentChanges = contentToSave !== currentRef.content;
            const hasTitleChanges = titleToSave !== currentRef.title;

            if (!hasContentChanges && !hasTitleChanges) {
                if (trigger === 'manual') {
                    setSaveState('saved');
                    setSaveStatusText(t('editor.saveUpToDate'));
                    scheduleSaveStatusReset();
                }
                return;
            }

            clearSaveStatusTimer();
            if (trigger !== 'auto') {
                setSaveState('saving');
                setSaveStatusText(t('editor.saveSaving'));
            }

            let chapterUpdated = false;

            try {
                if (hasContentChanges) {
                    await window.db.saveChapter({
                        chapterId: currentRef.id,
                        content: contentToSave
                    });
                    chapterUpdated = true;
                }

                if (chapterRef.current?.id !== currentRef.id) return;

                if (hasTitleChanges) {
                    await window.db.renameChapter({
                        chapterId: currentRef.id,
                        title: titleToSave
                    });
                    loadVolumes();
                    chapterUpdated = true;
                }

                if (chapterRef.current?.id !== currentRef.id) return;

                if (chapterUpdated) {
                    const updatedChapter = {
                        ...currentRef,
                        content: contentToSave,
                        title: titleToSave
                    };
                    setCurrentChapter(updatedChapter);
                    addToRecentFiles(updatedChapter);
                }

                if (trigger === 'auto') {
                    setSaveState('idle');
                    setSaveStatusText('');
                } else {
                    setSaveState('saved');
                    setSaveStatusText(t('editor.saveSaved'));
                    scheduleSaveStatusReset();
                }
            } catch (error) {
                console.error('[Editor] saveChanges failed:', error);
                setSaveState('error');
                setSaveStatusText(t('editor.saveFailed'));
                scheduleSaveStatusReset(3200);
                throw error;
            }
        };

        const queued = saveQueueRef.current.then(runSave, runSave);
        saveQueueRef.current = queued.catch(() => undefined);
        return queued;
    }, [addToRecentFiles, clearSaveStatusTimer, loadVolumes, scheduleSaveStatusReset, t]);

    // Auto-Save Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentChapter) {
                if (content !== currentChapter.content || title !== currentChapter.title) {
                    void saveChanges('auto');
                }
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [content, title, currentChapter, saveChanges]);

    // Save on Unmount / BeforeUnload
    useEffect(() => {
        const handleUnload = () => {
            if (chapterRef.current && (contentRef.current !== chapterRef.current.content || titleRef.current !== chapterRef.current.title)) {
                void saveChanges('lifecycle');
            }
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            handleUnload();
        };
    }, [saveChanges]);


    // Track the intended active chapter ID to prevent race conditions during rapid switching
    const activeChapterIdRef = useRef<string | null>(null);
    const chapterCache = useRef(new Map<string, Chapter>());

    // Load Chapter Content
    const handleSelectChapter = useCallback(async (chapterId: string) => {
        // Prevent reentry if already switching to the same chapter
        if (isSwitchingChapterRef.current && activeChapterIdRef.current === chapterId) return;
        if (currentChapter?.id === chapterId) return;

        console.log(`[Editor] Switching to chapter ${chapterId}`);
        isSwitchingChapterRef.current = true;
        activeChapterMetadata = { id: chapterId, title: 'Loading...' };
        activeChapterIdRef.current = chapterId; // Lock target ID

        // Switch to editor view if currently in map mode (matrix has its own chapter navigation)
        if (viewMode === 'map') {
            setViewMode('editor');
        }

        // 1. Background Save (Fire & Forget) - Non-blocking
        const oldChapter = currentChapter;
        const oldContent = contentRef.current;
        const oldTitle = titleRef.current;

        if (oldChapter) {
            const savePromise = async () => {
                let saved = false;
                if (oldContent !== oldChapter.content) {
                    await window.db.saveChapter({ chapterId: oldChapter.id, content: oldContent });
                    saved = true;
                }
                if (oldTitle !== oldChapter.title) {
                    await window.db.renameChapter({ chapterId: oldChapter.id, title: oldTitle });
                    loadVolumes();
                    saved = true;
                }
                // Update Cache with latest user edits so if return, we see them
                if (saved || !chapterCache.current.has(oldChapter.id)) {
                    chapterCache.current.set(oldChapter.id, {
                        ...oldChapter,
                        content: oldContent,
                        title: oldTitle
                    });
                }
            };
            // Execute in background
            savePromise().catch(e => console.error("[Editor] Background save failed", e));
        }

        // 2. Optimistic Cache Check
        const cached = chapterCache.current.get(chapterId);
        if (cached) {
            console.log(`[Editor] Cache hit for ${chapterId}`);
            activeChapterMetadata = { id: cached.id, title: cached.title };
            setTitle(cached.title);
            setContent(cached.content);
            setCurrentChapter(cached);
            setIsLoading(false); // Skip loading state
        } else {
            // 3. Cache Miss: Clear State & Show Loading
            setCurrentChapter(null);
            setIsLoading(true);
        }

        try {
            // 4. Async Fetch (Always fetch to ensure data consistency)
            const chapter = await window.db.getChapter(chapterId);

            // 5. Safety Check: Is this still the chapter we want?
            if (activeChapterIdRef.current !== chapterId) {
                console.warn(`[Editor] Aborting switch to ${chapterId} because target changed to ${activeChapterIdRef.current}`);
                return;
            }

                if (chapter) {
                    // Update Cache & State
                    chapterCache.current.set(chapterId, chapter);

                    activeChapterMetadata = { id: chapter.id, title: chapter.title };
                    setTitle(chapter.title);
                    setContent(chapter.content);
                    setCurrentChapter(chapter);
                    setTitleCandidates([]);

                localStorage.setItem(`last_chapter_${novelId}`, chapterId);
                addToRecentFiles(chapter);
            }
        } catch (error) {
            console.error('Failed to load chapter:', error);
        } finally {
            if (activeChapterIdRef.current === chapterId) {
                setIsLoading(false);
                setTimeout(() => {
                    isSwitchingChapterRef.current = false;
                }, 300);
            }
        }
    }, [isSwitchingChapterRef, activeChapterIdRef, currentChapter, contentRef, titleRef, loadVolumes, setCurrentChapter, setTitle, setContent, setIsLoading, novelId, addToRecentFiles]);

    // Plot Interaction Handlers
    const handlePlotContextMenu = useCallback((data: PlotContextMenuData) => {
        setPlotContextMenuData(data);
    }, []);

    const handleAddAnchorClick = () => {
        if (plotContextMenuData?.text) {
            setPendingAnchorSelection(plotContextMenuData);
            setIsPlotAnchorModalOpen(true);
        }
        setPlotContextMenuData(null);
    };

    const handleRemoveAnchor = async () => {
        if (!plotContextMenuData?.anchorId) return;
        const anchorId = plotContextMenuData.anchorId;

        try {
            // Find which point has this anchor
            const allLines = await window.db.getPlotLines(novelId);
            let targetPointId: string | null = null;
            for (const line of allLines) {
                for (const point of line.points || []) {
                    if (point.anchors?.some(a => a.id === anchorId)) {
                        targetPointId = point.id;
                        break;
                    }
                }
                if (targetPointId) break;
            }

            if (targetPointId) {
                await removeAnchor(anchorId, targetPointId);
            } else {
                // Just try delete anyway in case local state is out of sync
                await window.db.deletePlotPointAnchor(anchorId);
            }

            // Remove from Editor
            const editor = editorRef.current;
            if (editor) {
                editor.update(() => {
                    // Traverse and find the node with this ID
                    // We don't have a direct index, so we might need to scan or if we have the node key in memory?
                    // But anchors can be many.
                    // Let's use a DFS or similar if needed.
                    // Or relies on data attribute? Lexical doesn't index by data attribute.
                    // We can iterate all MarkNodes/PlotAnchorNodes.

                    // Optimization: We can't easily find a node by custom ID without traversing.
                    // But typically the document is not huge or we can limit scope.
                    // Actually, for now, let's traverse all nodes or rely on selection if it was clicked?
                    // Context menu provides `anchorId`.

                    // Traverse all text nodes to find parent plot anchors
                    const rootNode = $getRoot();
                    rootNode.getAllTextNodes().forEach(textNode => {
                        const parent = textNode.getParent();
                        if ($isPlotAnchorNode(parent)) {
                            const ids = parent.getIDs();
                            if (ids.includes(anchorId)) {
                                parent.unwrap();
                            }
                        }
                    });
                });
            }

            setPlotContextMenuData(null);
        } catch (e) {
            console.error('Failed to remove anchor:', e);
        }
    };

    const handleSubmitAnchor = async (plotPointId: string, type: 'setup' | 'payoff') => {
        if (!currentChapter || !pendingAnchorSelection) return;

        try {
            // Create DB Entry
            const newAnchor = await addAnchor({
                plotPointId,
                chapterId: currentChapter.id,
                type,
                lexicalKey: pendingAnchorSelection.nodeKey,
                offset: pendingAnchorSelection.offset,
                length: pendingAnchorSelection.length,
            });

            if (newAnchor) {
                if (pendingAnchorSelection.hasSelection) {
                    applyPlotAnchor(newAnchor.id);
                } else {
                    applyPlotAnchorFromData(newAnchor.id, pendingAnchorSelection);
                }
            }

            setIsPlotAnchorModalOpen(false);
            setPendingAnchorSelection(null);
        } catch (e) {
            console.error('Create anchor failed:', e);
        }
    };

    // Handle Create New Point from Selection
    const handleCreatePointFromSelection = () => {
        if (plotContextMenuData?.text) {
            setPlotPointCreateData({
                title: plotContextMenuData.text.slice(0, 20),
                description: plotContextMenuData.text,
                chapterId: currentChapter?.id
            });
            setPendingAnchorSelection(plotContextMenuData);
            setIsPlotPointCreateMode(true);
            setIsPlotPointModalOpen(true);
        }
        setPlotContextMenuData(null);
    };

    const handleCreatePlotPoint = async (data: Partial<any>, initialChapterId?: string) => {
        try {
            // 1. Create Point
            const newPoint = await createPlotPoint(data);

            // Logic to handle anchor creation if pending selection exists
            const targetChapterId = initialChapterId || (pendingAnchorSelection && currentChapter?.id);

            // Only anchor to selection if the target chapter matches the current chapter where selection was made
            const shouldAnchorToSelection = pendingAnchorSelection && currentChapter?.id && targetChapterId === currentChapter.id;

            if (newPoint && shouldAnchorToSelection && pendingAnchorSelection) {
                const newAnchor = await addAnchor({
                    plotPointId: newPoint.id,
                    chapterId: targetChapterId!,
                    type: 'setup', // Default to setup for new points from text
                    lexicalKey: pendingAnchorSelection.nodeKey,
                    offset: pendingAnchorSelection.offset,
                    length: pendingAnchorSelection.length,
                });
                if (newAnchor) {
                    if (pendingAnchorSelection.hasSelection) {
                        applyPlotAnchor(newAnchor.id);
                    } else {
                        applyPlotAnchorFromData(newAnchor.id, pendingAnchorSelection);
                    }
                }
            } else if (newPoint && targetChapterId) {
                // Fallback for manual creation or if chapter changed (just associate with chapter)
                await addAnchor({
                    plotPointId: newPoint.id,
                    chapterId: targetChapterId,
                    type: 'setup'
                });
            }

            setIsPlotPointModalOpen(false);
            setPendingAnchorSelection(null);
        } catch (e) {
            console.error('Failed to create point from selection:', e);
        }
    };

    // Placeholder for future edit
    const handleSavePlotPoint = async (id: string, data: Partial<any>) => {
        await updatePlotPoint(id, data);
        setIsPlotPointModalOpen(false);
    };

    const handleViewDetails = () => {
        if (!plotContextMenuData?.anchorId) return;
        const anchorId = plotContextMenuData.anchorId;

        // Find point
        for (const line of plotLines) {
            const point = line.points?.find((p: any) => p.anchors?.some((a: any) => a.id === anchorId));
            if (point) {
                setEditingPlotPoint(point);
                setIsPlotPointCreateMode(false);
                setIsPlotPointModalOpen(true);
                break;
            }
        }
        setPlotContextMenuData(null);
    };

    // Helper to Apply Anchor
    const applyPlotAnchor = (anchorId: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.focus();
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $wrapSelectionInMarkNode(selection as any, selection.isCollapsed(), anchorId, $createPlotAnchorNode);
            }
        });
    };

    const applyPlotAnchorFromData = (anchorId: string, data: PlotContextMenuData) => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.update(() => {
            // Need to import $createRangeSelection, $getNodeByKey, $setSelection if not available?
            // They are likely available globally or imported from lexical.
            // Check imports later. Assuming they are imported or I should check.
            // If not imported, this will fail. $getNodeByKey is standard.

            // To be safe, I'll assume they are imported or add them.
            // Editor.tsx usually imports everything from lexical.

            if (!data.nodeKey || data.offset === undefined || data.length === undefined) return;
            const { nodeKey, offset, length } = data;
            const node = $getNodeByKey(nodeKey);
            if (node && $isTextNode(node)) {
                const selection = $createRangeSelection();
                selection.anchor.set(nodeKey, offset, 'text');
                selection.focus.set(nodeKey, offset + length, 'text');
                $setSelection(selection);

                $wrapSelectionInMarkNode(selection as any, false, anchorId, $createPlotAnchorNode);
            }
        });
    };

    // Create Chapter
    const handleCreateChapter = useCallback(async (volumeId: string) => {
        const newTitle = '';
        const volume = volumes.find(v => v.id === volumeId);
        const order = volume ? volume.chapters.length + 1 : 1;

        try {
            const newChapter = await window.db.createChapter({ volumeId, title: newTitle, order });
            await loadVolumes();
            handleSelectChapter(newChapter.id);
        } catch (error) {
            console.error('Failed to create chapter:', error);
        }
    }, [volumes, loadVolumes, handleSelectChapter]);

    // Create Volume
    const handleCreateVolume = useCallback(async () => {
        const title = '';
        try {
            const newVol = await window.db.createVolume({ novelId, title });
            await loadVolumes();
            setLastCreatedVolumeId(newVol.id);
        } catch (error) {
            console.error('Failed to create volume:', error);
        }
    }, [novelId, loadVolumes, setLastCreatedVolumeId]);

    // Rename Logic
    const handleRenameVolume = useCallback(async (volumeId: string, title: string) => {
        try {
            await window.db.renameVolume({ volumeId, title });
            await loadVolumes();
        } catch (error) {
            console.error('Failed to rename volume:', error);
        }
    }, [loadVolumes]);

    const handleRenameChapter = useCallback(async (chapterId: string, title: string) => {
        try {
            await window.db.renameChapter({ chapterId, title });
            if (currentChapter?.id === chapterId) {
                setTitle(title);
            }
            await loadVolumes();
        } catch (error) {
            console.error('Failed to rename chapter:', error);
        }
    }, [loadVolumes, currentChapter, setTitle]);



    // Global Search Shortcut (Ctrl+Shift+F)
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setActiveTab('search');
                setIsSidePanelOpen(true);
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    // Idea Handlers
    const handleAddIdea = async (id: string, quote: string, cursor: string, note: string) => {
        if (!currentChapter) return;

        const newIdea: Idea = {
            id, // Use ID generated in plugin
            novelId,
            chapterId: currentChapter.id,
            content: note,
            quote,
            cursor, // Still saving cursor for fallback
            timestamp: Date.now(),
            isStarred: false
        };

        // Optimistic Update
        setIdeas(prev => [newIdea, ...prev]);
        setActiveTab('idea');
        setIsSidePanelOpen(true);

        try {
            await window.db.createIdea(newIdea);
        } catch (e) {
            console.error('Failed to create idea:', e);
            // Revert?
        }
    };

    const handleCreateGlobalIdea = () => {
        setIsGlobalIdeaModalOpen(true);
    };

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (isMatch(e, 'create_idea')) {
                e.preventDefault();
                handleCreateGlobalIdea();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isMatch, handleCreateGlobalIdea]);

    const handleDeleteIdea = async (id: string) => {
        setIdeas(prev => prev.filter(i => i.id !== id));

        // Remove Mark from Editor
        const editor = editorRef.current;
        if (editor) {
            editor.update(() => {
                const root = $getRoot();
                // Traverse to find MarkNodes/IdeaMarkNodes with this ID
                root.getAllTextNodes().forEach(textNode => {
                    const parent = textNode.getParent();
                    // Check both IdeaMarkNode (new) and MarkNode (legacy)
                    if (($isIdeaMarkNode(parent) || $isMarkNode(parent)) && parent.hasID(id)) {
                        parent.deleteID(id);
                        if (parent.getIDs().length === 0) {
                            $unwrapMarkNode(parent);
                        }
                    }
                });
            });
        }

        try {
            await window.db.deleteIdea(id);
        } catch (e) {
            console.error('Failed to delete idea:', e);
        }
    };

    const handleToggleStar = async (id: string, isStarred: boolean) => {
        setIdeas(prev => prev.map(i => i.id === id ? { ...i, isStarred } : i));
        try {
            await window.db.updateIdea(id, { isStarred });
        } catch (e) {
            console.error(e);
        }
    };

    const handleJumpToIdea = (idea: Idea) => {
        // If idea is not in current chapter, switch chapter first
        if (idea.chapterId && currentChapter?.id !== idea.chapterId) {
            handleSelectChapter(idea.chapterId).then(() => {
                // Determine how to wait for content load + render?
                // This is tricky. handleSelectChapter is async but React render is separate.
                // We might need a temporary "pendingJumpIdea" state that triggers in useEffect.
                setPendingJumpIdea(idea);
            });
            return;
        }

        // Same chapter navigation
        executeJump(idea);
    };

    useEffect(() => {
        if (pendingJumpIdea && currentChapter?.id === pendingJumpIdea.chapterId) {
            // Check if Lexical is ready? We rely on it being mounted.
            // Small timeout to ensure DOM is ready after content switch
            setTimeout(() => {
                executeJump(pendingJumpIdea);
                setPendingJumpIdea(null);
            }, 300);
        }
    }, [pendingJumpIdea, currentChapter]);

    // Handle search result jump with keyword highlighting
    useEffect(() => {
        if (pendingSearchJump && currentChapter?.id === pendingSearchJump.chapterId) {
            setTimeout(() => {
                highlightKeyword(pendingSearchJump.keyword, pendingSearchJump.context);
                setPendingSearchJump(null);
            }, 300);
        }
    }, [pendingSearchJump, currentChapter]);

    const handleJumpToChapter = (chapterId: string, keyword: string, context?: string) => {
        if (currentChapter?.id === chapterId) {
            // Same chapter, just highlight
            highlightKeyword(keyword, context);
        } else {
            // Switch chapter first, then highlight
            handleSelectChapter(chapterId).then(() => {
                setPendingSearchJump({ chapterId, keyword, context });
            });
        }
    };

    const highlightKeyword = (keyword: string, context?: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        const editorRoot = editor.getRootElement();
        if (!editorRoot) return;

        // Clear previous highlights
        if ('highlights' in CSS) {
            (CSS as any).highlights.delete('search-results');
        }

        const ranges: Range[] = [];
        const lowerKeyword = keyword.toLowerCase();

        // Prepare context for matching (simplified)
        const lowerContext = context ? context.toLowerCase().replace(/\s+/g, '') : null;
        let scrollTargetRange: Range | null = null;

        // Use TreeWalker to find text nodes
        const treeWalker = document.createTreeWalker(
            editorRoot,
            NodeFilter.SHOW_TEXT,
            null
        );

        let currentNode;
        while ((currentNode = treeWalker.nextNode())) {
            const textNode = currentNode as Text;
            const textContent = textNode.textContent || '';
            const lowerText = textContent.toLowerCase();
            let startPos = 0;

            while (startPos < textContent.length) {
                const index = lowerText.indexOf(lowerKeyword, startPos);
                if (index === -1) break;

                const range = new Range();
                range.setStart(textNode, index);
                range.setEnd(textNode, index + keyword.length);
                ranges.push(range);

                // Context Matching Logic
                if (lowerContext && !scrollTargetRange) {
                    // Get surrounding text from the node (heuristic)
                    // We grab a window around the match
                    const windowStart = Math.max(0, index - 10);
                    const windowEnd = Math.min(textNode.length, index + keyword.length + 10);
                    const surrounding = lowerText.substring(windowStart, windowEnd).replace(/\s+/g, '');

                    if (lowerContext.includes(surrounding)) {
                        scrollTargetRange = range;
                    }
                }

                startPos = index + keyword.length;
            }
        }

        // Fallback: if context matched nothing (e.g. split nodes), use first match
        if (!scrollTargetRange && ranges.length > 0) {
            scrollTargetRange = ranges[0];
        }

        // Scroll to target
        if (scrollTargetRange) {
            const rect = scrollTargetRange.getBoundingClientRect();
            // Only scroll if valid rect
            if (rect.top || rect.bottom) {
                const container = (scrollTargetRange.startContainer.parentElement as HTMLElement);
                if (container) {
                    container.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                    // Optional: Flash visual cue?
                }
            }
        }

        // Apply CSS Highlight API if supported
        if ('highlights' in CSS && ranges.length > 0) {
            const highlight = new (window as any).Highlight(...ranges);
            (CSS as any).highlights.set('search-results', highlight);
        }
    };


    const executeJump = (idea: Idea) => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.update(() => {
            try {
                // DOM lookup logic using data-idea-id attribute
                const domElement = editor.getRootElement()?.querySelector(`[data-idea-id="${idea.id}"]`);
                if (domElement) {
                    domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight logic (CSS class?)
                    // Already has class. flash it?
                    domElement.animate([
                        { backgroundColor: 'rgba(253, 224, 71, 0.5)' }, // yellow
                        { backgroundColor: 'transparent' }
                    ], { duration: 1000 });
                    return;
                }

                // 2. Fallback to Cursor logic if DOM not found (deleted manually but preserved in DB?)
                if (idea.cursor) {
                    const savedCursor = JSON.parse(idea.cursor);
                    const anchorKey = savedCursor.anchor?.key;
                    // Try to scroll to key? Keys might change if re-parsed? 
                    // Lexical Keys are transient per session unless serialized state is preserved perfectly?
                    // Yes, keys are consistent if loaded from same JSON.

                    if (anchorKey) {
                        const element = editor.getElementByKey(anchorKey);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                        }
                    }
                }

                // 3. Failed
                triggerShake(idea.id);

            } catch (e) {
                console.error("Failed to jump to idea", e);
                triggerShake(idea.id);
            }
        });
    };

    const triggerShake = (id: string) => {
        setShakingIdeaId(id);
        setTimeout(() => setShakingIdeaId(null), 500);
    };

    const [highlightedPlotPointId, setHighlightedPlotPointId] = useState<string | null>(null);

    // Handle Plot Anchor Click
    const handlePlotAnchorClick = (anchorId: string) => {
        console.log('[Editor] handlePlotAnchorClick:', anchorId);
        // Find the plot point associated with this anchor
        for (const line of plotLines) {
            const point = line.points?.find((p: any) => p.anchors?.some((a: any) => a.id === anchorId));
            if (point) {
                console.log('[Editor] Found plot point:', point);
                setHighlightedPlotPointId(point.id);
                setActiveTab('outline');
                setIsSidePanelOpen(true);

                // Clear highlight after 2 seconds
                setTimeout(() => {
                    setHighlightedPlotPointId(null);
                }, 2000);
                return;
            }
        }
    };

    // Handle Plot Point Jump
    const handleJumpToPlotPoint = (point: any): boolean => {
        if (!point.anchors || point.anchors.length === 0) return false;

        const isDarkTheme = preferences.theme === 'dark';
        const editor = editorRef.current;
        if (!editor) return false;

        const editorRoot = editor.getRootElement();
        if (!editorRoot) return false;

        // Try to find the first visible anchor in the editor
        // We iterate through all anchors of the point
        for (const anchor of point.anchors) {
            // Find DOM element with this ID
            const element = editorRoot.querySelector(`[data-plot-anchor-id="${anchor.id}"]`);
            if (element) {
                (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Add temporary highlight
                const originalBg = (element as HTMLElement).style.backgroundColor;
                (element as HTMLElement).style.transition = 'background-color 0.5s';
                (element as HTMLElement).style.backgroundColor = isDarkTheme ? 'rgba(234, 179, 8, 0.4)' : 'rgba(250, 204, 21, 0.4)'; // Yellow-500/400

                setTimeout(() => {
                    (element as HTMLElement).style.backgroundColor = originalBg;
                }, 2000);

                return true;
            }
        }

        // If we reach here, it means hooks exist but are not currently in the DOM (maybe executed on clean up? or just not found)
        console.warn('[Editor] Anchors exist but DOM elements not found for point:', point.id);
        return false;
    };

    const triggerHighlight = (id: string) => {
        setHighlightedIdeaId(id);
        // We keep it highlighted for a while to allow animation to complete
        setTimeout(() => setHighlightedIdeaId(null), 2000);
    };

    const handleIdeaClick = (ideaId: string) => {
        const idea = ideas.find(i => i.id === ideaId);
        if (idea) {
            setActiveTab('idea');
            setIsSidePanelOpen(true);
            triggerHighlight(ideaId);
        }
    };

    // Style Calculation
    const getEditorContentClass = () => {
        const base = "w-full resize-none outline-none selection:bg-purple-500/30 transition-all duration-300";
        // Wide (Default) or Mobile container sizing is now handled by LexicalChapterEditor wrapper
        // But for specific text content styling:

        let fontClass = 'font-serif';
        if (preferences.fontFamily === 'sans') fontClass = 'font-sans';
        if (preferences.fontFamily === 'kaiti') fontClass = "font-['Kaiti']";

        const isDark = preferences.theme === 'dark';
        return clsx(base, fontClass, "bg-transparent", isDark ? "text-neutral-300 placeholder-white/10" : "text-neutral-900 placeholder-black/30");
    };


    const handleUpdateIdea = (id: string, data: Partial<Idea>) => {
        window.db.updateIdea(id, data).then(updated => {
            setIdeas(prev => prev.map(i => i.id === id ? updated : i));
        });
    };

    // --- 8. Global Plot Point Modal Logic ---


    useEffect(() => {
        const handleOpenModal = (e: CustomEvent) => {
            const { isCreateMode, pointId, initialData } = e.detail;
            setIsPlotPointCreateMode(isCreateMode);

            if (isCreateMode) {
                // Enhance initialData with chapter context if missing
                let data = initialData || {};
                // Force use global metadata if chapterId is missing
                if (!data.chapterId) {
                    const active = activeChapterMetadata;
                    if (active) {
                        data = { ...data, chapterId: active.id, title: data.title || active.title };
                        console.log('[Editor] handleOpenModal: Auto-filled chapter from global metadata:', active);
                    }
                }

                // [NEW] Handle Anchor Data from Floating Toolbar
                const { anchorData } = e.detail;
                if (anchorData) {
                    setPendingAnchorSelection(anchorData);
                }

                setPlotPointCreateData(data);
                setEditingPlotPoint(null);
            } else {
                if (pointId) {
                    // Find point from loaded plotLines (from usePlotSystem)
                    let found = null;
                    for (const line of plotLines) {
                        const p = line.points?.find((pt: any) => pt.id === pointId);
                        if (p) {
                            found = p;
                            break;
                        }
                    }
                    setEditingPlotPoint(found);
                }
            }
            setIsPlotPointModalOpen(true);
        };

        window.addEventListener('open-plot-point-modal', handleOpenModal as EventListener);
        return () => window.removeEventListener('open-plot-point-modal', handleOpenModal as EventListener);
    }, [plotLines]);



    const handleDeletePlotPoint = async (id: string) => {
        try {
            console.log('[Editor] handleDeletePlotPoint triggered for:', id);
            // Find the point and its anchors
            let anchorsToRemove: string[] = [];
            for (const line of plotLines) {
                const point = line.points?.find(p => p.id === id);
                if (point && point.anchors) {
                    anchorsToRemove = point.anchors.map(a => a.id);
                    break;
                }
            }
            console.log('[Editor] Anchors to remove:', anchorsToRemove);

            // Cleanup Editor Nodes
            if (anchorsToRemove.length > 0 && editorRef.current) {
                editorRef.current.update(() => {
                    const rootNode = $getRoot();
                    rootNode.getAllTextNodes().forEach(textNode => {
                        const parent = textNode.getParent();
                        if ($isPlotAnchorNode(parent)) {
                            const ids = parent.getIDs();
                            // If any of the node's IDs are in the anchorsToRemove list, unwrap it.
                            if (ids.some(id => anchorsToRemove.includes(id))) {
                                console.log('[Editor] Unwrapping anchor node:', ids);
                                parent.unwrap();
                            }
                        }
                    });
                });
            }

            await deletePlotPoint(id); // Ensure correct arguments for deletePlotPoint
        } catch (e) {
            console.error('Failed to delete plot point:', e);
        }
    };

    const draftCount = useMemo(() => (
        (creativeDraft.plotLines?.length ?? 0)
        + (creativeDraft.plotPoints?.length ?? 0)
        + (creativeDraft.characters?.length ?? 0)
        + (creativeDraft.items?.length ?? 0)
        + (creativeDraft.skills?.length ?? 0)
        + (creativeDraft.maps?.length ?? 0)
    ), [creativeDraft]);
    const isCompactDraftDock = viewportWidth < 1700;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`fixed inset-0 z-50 flex ${preferences.theme === 'dark' ? 'bg-[#0a0a0f] text-neutral-200' : 'bg-white text-neutral-800'}`}
        >
            {/* Activity Bar (Leftmost) */}
            <ActivityBar
                activeTab={isSidePanelOpen ? activeTab : null}
                onTabChange={handleTabChange}
                theme={preferences.theme}
            />

            {/* Side Panel */}
            <AnimatePresence mode='wait'>
                {isSidePanelOpen && (
                    <motion.div
                        id="sidebar-root"
                        initial={{ x: -100, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -100, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "circOut" }}
                        className={clsx(
                            "h-full flex flex-col border-r w-64", // Fixed width
                            isFlowMode ? "absolute left-12 z-40 shadow-2xl" : "flex-shrink-0 relative transition-all duration-300",
                            preferences.theme === 'dark' ? 'border-white/5 bg-[#0F0F13]' : 'border-gray-200 bg-gray-50',
                            isSidePanelOpen && "sidebar-open"
                        )}
                    >
                        {/* Dynamic Content based on Active Tab - Implemented with Keep-Alive for heavy components */}

                        {/* Explorer (Keep Alive) */}
                        <div className={clsx("flex-1 h-full flex flex-col min-h-0", activeTab !== 'explorer' && "hidden")}>
                            <Sidebar
                                volumes={volumes}
                                currentChapterId={currentChapter?.id || null}
                                formatting={novel?.formatting}
                                onSelectChapter={handleSelectChapter}
                                onCreateChapter={handleCreateChapter}
                                onCreateVolume={handleCreateVolume}
                                onRenameVolume={handleRenameVolume}
                                onRenameChapter={handleRenameChapter}
                                theme={preferences.theme}
                                lastCreatedVolumeId={lastCreatedVolumeId}
                            />
                        </div>

                        {/* Idea (Keep Alive) */}
                        <div className={clsx("flex-1 h-full flex flex-col min-h-0", activeTab !== 'idea' && "hidden")}>
                            <UnifiedSearchWorkbench
                                ideas={ideas}
                                novelId={novelId}
                                onJump={handleJumpToIdea}
                                onUpdateIdea={handleUpdateIdea}
                                onDeleteIdea={handleDeleteIdea}
                                onToggleStar={handleToggleStar}
                                onCreateIdea={handleCreateGlobalIdea}
                                theme={preferences.theme}
                                onClose={() => setIsSidePanelOpen(false)}
                                shakingIdeaId={shakingIdeaId}
                                highlightedIdeaId={highlightedIdeaId}
                            />
                        </div>

                        {/* Search (Keep Alive) */}
                        <div className={clsx("flex-1 h-full flex flex-col min-h-0", activeTab !== 'search' && "hidden")}>
                            <SearchSidebar
                                theme={preferences.theme}
                                novelId={novelId}
                                onClose={() => {
                                    clearSearchHighlights();
                                    setIsSidePanelOpen(false);
                                }}
                                onJumpToChapter={handleJumpToChapter}
                                onJumpToIdea={(ideaId) => {
                                    const idea = ideas.find(i => i.id === ideaId);
                                    if (idea) handleJumpToIdea(idea);
                                }}
                                onJumpToEntity={(category, entityId) => {
                                    if (category === 'map') {
                                        // Switch to maps tab and select the map
                                        setActiveTab('map');
                                        setIsSidePanelOpen(true);
                                        setTimeout(() => {
                                            window.dispatchEvent(new CustomEvent('navigate-to-map', {
                                                detail: { mapId: entityId }
                                            }));
                                        }, 100);
                                    } else {
                                        // Switch to WorldWorkbench tab and dispatch event
                                        setActiveTab('characters');
                                        setIsSidePanelOpen(true);
                                        setTimeout(() => {
                                            window.dispatchEvent(new CustomEvent('navigate-to-world-entity', {
                                                detail: { category, entityId }
                                            }));
                                        }, 100);
                                    }
                                }}
                                onSearchChange={(keyword) => {
                                    if (!keyword.trim()) {
                                        clearSearchHighlights();
                                    }
                                }}
                            />
                        </div>

                        {/* Placeholders (Conditional) */}
                        {/* Plot Sidebar (Keep Alive) */}
                        <div className={clsx("flex-1 h-full flex flex-col min-h-0", activeTab !== 'outline' && "hidden")}>
                            <PlotSidebar
                                novelId={novelId}
                                theme={preferences.theme}
                                onClose={() => setIsSidePanelOpen(false)}
                                highlightedPointId={highlightedPlotPointId}
                                onDeletePoint={handleDeletePlotPoint}
                                onJump={handleJumpToPlotPoint}
                            />
                        </div>

                        {/* World Workbench (Keep Alive) */}
                        <div className={clsx("flex-1 h-full flex flex-col min-h-0", activeTab !== 'characters' && "hidden")}>
                            <WorldWorkbench
                                novelId={novelId}
                                theme={preferences.theme}
                            />
                        </div>

                        {/* AI Workbench */}
                        <div className={clsx("flex-1 h-full flex flex-col min-h-0", activeTab !== 'ai_workbench' && "hidden")}>
                            <AIWorkbenchPanel
                                novelId={novelId}
                                theme={preferences.theme}
                                draft={creativeDraft}
                                selection={creativeSelection}
                                draftSession={creativeDraftSession}
                                onDraftChange={handleCreativeDraftChange}
                                onSelectionChange={handleCreativeSelectionChange}
                                onDraftSessionChange={handleCreativeDraftSessionChange}
                                onDraftGenerated={() => {
                                    setIsDraftDockOpen(true);
                                    setViewMode('editor');
                                }}
                            />
                        </div>

                        {activeTab === 'map' && (
                            <div className="flex-1 flex flex-col min-h-0">
                                <MapSidebar
                                    novelId={novelId}
                                    theme={preferences.theme}
                                    activeMapId={activeMapId}
                                    onSelectMap={(mapId) => {
                                        if (mapId) {
                                            setActiveMapId(mapId);
                                            setViewMode('map');
                                            // Always reload characters to stay current
                                            window.db.getCharacters(novelId).then(setMapCharacters).catch(console.error);
                                        } else {
                                            setActiveMapId(null);
                                            setViewMode('editor');
                                        }
                                    }}
                                />
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <div className={`flex-1 flex flex-col h-full relative transition-all min-w-0 overflow-hidden ${preferences.theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>

                {/* Header */}
                {/* Header */}
                {/* Header - Robust 3-Column Layout */}
                <div
                    className={clsx(
                        "flex items-center justify-between relative border-b",
                        preferences.theme === 'dark' ? 'border-white/5 bg-[#0a0a0f] text-neutral-400' : 'border-gray-200 bg-white text-neutral-600',
                        "h-[70px] px-4 shrink-0"
                    )}
                    style={{ zIndex: 40 }}
                >
                    {/* Left: Navigation (Width fixed to ensure center alignment) */}
                    <div className="flex items-center gap-2 w-[180px] shrink-0">
                        <button onClick={onBack} className={`p-2 rounded-full transition-colors ${preferences.theme === 'dark' ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-black/5 hover:text-black'}`}>
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <button onClick={() => setIsSidePanelOpen(!isSidePanelOpen)} className={`p-2 rounded-full transition-colors ${preferences.theme === 'dark' ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-black/5 hover:text-black'}`}>
                            {isSidePanelOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* Center: Title & View Switcher (Flex-1 to take available space) */}
                    <div className="flex-1 flex justify-center items-center gap-4 min-w-0">
                        {currentChapter && (
                            <span className={clsx("text-xs font-mono uppercase tracking-widest hidden lg:block whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]", preferences.theme === 'dark' ? 'text-neutral-600' : 'text-neutral-400')}>
                                {isLoading ? t('common.loading') : t('editor.editing')}
                            </span>
                        )}

                        {/* View Mode Toggle */}
                        <div className={clsx(
                            "flex items-center p-1 rounded-full border shadow-sm shrink-0",
                            preferences.theme === 'dark' ? "border-white/20 bg-black/40" : "border-gray-300 bg-white"
                        )}>
                            <button
                                onClick={() => setViewMode('editor')}
                                className={clsx("p-2 rounded-full transition-all flex items-center gap-2", viewMode === 'editor' ? (preferences.theme === 'dark' ? "bg-white/20 text-white" : "bg-gray-200 text-black") : "opacity-60 hover:opacity-100")}
                                title={t('editor.mode.editor', 'Editor Mode')}
                            >
                                <FileText className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('matrix')}
                                className={clsx("p-2 rounded-full transition-all flex items-center gap-2", viewMode === 'matrix' ? (preferences.theme === 'dark' ? "bg-white/20 text-white" : "bg-gray-200 text-black") : "opacity-60 hover:opacity-100")}
                                title={t('editor.mode.matrix', 'Matrix Mode')}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                    onClick={() => {
                                        setViewMode('editor');
                                        setIsDraftDockOpen((prev) => !prev);
                                    }}
                                    className={clsx(
                                        "relative p-2 rounded-full transition-all flex items-center gap-2",
                                        isDraftDockOpen && viewMode === 'editor'
                                            ? (preferences.theme === 'dark' ? "bg-white/20 text-white" : "bg-gray-200 text-black")
                                            : "opacity-60 hover:opacity-100",
                                    )}
                                    title={isDraftDockOpen ? t('aiWorkbench.closeDraftDock') : t('aiWorkbench.openDraftDock')}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    {draftCount > 0 && (
                                        <span className={clsx(
                                            "absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 text-center",
                                            preferences.theme === 'dark' ? "bg-indigo-500 text-white" : "bg-indigo-600 text-white",
                                        )}>
                                            {draftCount}
                                        </span>
                                    )}
                                </button>
                        </div>
                    </div>

                    {/* Right: Actions (Width fixed to match left) */}
                    <div className="flex items-center gap-2 justify-end min-w-fit shrink-0">
                        <FlowModeButton
                            isActive={isFlowMode}
                            onClick={toggleFlowMode}
                            className="mr-1 shrink-0"
                        />
                        <button
                            onClick={() => {
                                setSettingsInitialTab('general');
                                setIsSettingsOpen(true);
                            }}
                            className={`shrink-0 p-2 rounded-full transition-colors ${preferences.theme === 'dark' ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-black/5 hover:text-black'}`}
                            title={t('editor.settings')}
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Editor Area, Matrix, or Map */}
                {viewMode === 'map' && activeMapId ? (
                    <MapCanvasView
                        mapId={activeMapId}
                        novelId={novelId}
                        theme={preferences.theme}
                        characters={mapCharacters}
                    />
                ) : viewMode === 'matrix' ? (
                    <NarrativeMatrix
                        novelId={novelId}
                        theme={preferences.theme}
                        activeChapterId={currentChapter?.id}
                        volumes={volumes}
                        formatting={novel?.formatting}
                        recentFiles={recentFiles}
                        plotLines={plotLines}
                        isPlotLoading={isPlotLoading}
                    />
                ) : (
                    isLoading && !currentChapter ? (
                        <div className={clsx(
                            "flex-1 flex flex-col items-center justify-start pt-20 gap-6 animate-pulse select-none",
                            preferences.theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-white'
                        )}>
                            <div className={clsx("h-10 w-1/3 rounded", preferences.theme === 'dark' ? "bg-white/5" : "bg-gray-200")} />
                            <div className="w-full max-w-3xl px-12 flex flex-col gap-4 mt-8">
                                <div className={clsx("h-4 w-full rounded", preferences.theme === 'dark' ? "bg-white/5" : "bg-gray-200")} />
                                <div className={clsx("h-4 w-5/6 rounded", preferences.theme === 'dark' ? "bg-white/5" : "bg-gray-200")} />
                                <div className={clsx("h-4 w-full rounded", preferences.theme === 'dark' ? "bg-white/5" : "bg-gray-200")} />
                                <div className={clsx("h-4 w-4/5 rounded", preferences.theme === 'dark' ? "bg-white/5" : "bg-gray-200")} />
                            </div>
                        </div>
                    ) : currentChapter ? (
                        <div className={clsx(
                            "flex-1 min-h-0 editor-shell layout-transition relative flex",
                            preferences.theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-white'
                        )}>
                            <div className="flex-1 min-w-0 relative">
                                <LexicalChapterEditor
                                    key={`${currentChapter.id}:${editorRefreshToken}`}
                                    namespace={currentChapter.id}
                                    initialContent={currentChapter.content}
                                    onChange={(editorState) => {
                                        if (isSwitchingChapterRef.current) return;
                                        editorState.read(() => {
                                            const jsonString = JSON.stringify(editorState.toJSON());
                                            setContent(jsonString);
                                        });
                                    }}
                                    className={getEditorContentClass()}
                                    editorRef={editorRef}
                                    preferences={preferences}
                                    onUpdatePreference={updatePreference}
                                    shortcuts={shortcuts}
                                    onSave={saveChanges}
                                    onCreateIdea={handleCreateGlobalIdea}
                                    language={i18n.language}
                                    saveIndicatorState={saveState}
                                    saveIndicatorText={saveStatusText}
                                    toolbarActions={
                                        <>
                                            <button
                                                onClick={() => setIsContinueModalOpen(true)}
                                                disabled={!currentChapter || isContinuing}
                                                title={t('editor.continueWriting', 'AI 续写')}
                                                className={clsx(
                                                    "shrink-0 px-2.5 py-2 rounded-lg border transition-colors inline-flex items-center gap-1.5 text-xs",
                                                    preferences.theme === 'dark'
                                                        ? "border-white/10 text-neutral-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        : "border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                )}
                                            >
                                                {isContinuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                <span>{t('editor.continueWriting', 'AI 续写')}</span>
                                            </button>
                                            {hasContinuePreviewDraft && (
                                                <button
                                                    onClick={() => setIsContinuePreviewOpen(true)}
                                                    title={t('editor.continueViewDraft', 'View Continue Draft')}
                                                    className={clsx(
                                                        "shrink-0 px-2.5 py-2 rounded-lg border transition-colors inline-flex items-center gap-1.5 text-xs",
                                                        preferences.theme === 'dark'
                                                            ? "border-white/10 text-neutral-300 hover:bg-white/5"
                                                            : "border-gray-200 text-gray-600 hover:bg-gray-50"
                                                    )}
                                                >
                                                    <FileText className="w-4 h-4" />
                                                    <span>{t('editor.continueViewDraft', 'View Continue Draft')}</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => void handleRebuildChapterSummary()}
                                                disabled={isRebuildingSummary || !currentChapter}
                                                title={t('editor.rebuildSummary', '手动生成摘要')}
                                                className={clsx(
                                                    "shrink-0 p-2 rounded-lg border transition-colors",
                                                    preferences.theme === 'dark'
                                                        ? "border-white/10 text-neutral-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        : "border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                )}
                                            >
                                                <ScrollText className={clsx("w-4 h-4", isRebuildingSummary && "animate-pulse")} />
                                            </button>
                                        </>
                                    }
                                    headerContent={
                                        <div className="w-full mb-4 relative">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                placeholder={t('editor.chapterTitle')}
                                                className={`flex-1 min-w-[260px] bg-transparent text-2xl md:text-3xl font-bold outline-none text-left md:text-center font-serif ${preferences.theme === 'dark' ? 'text-neutral-100 placeholder-neutral-600' : 'text-neutral-900 placeholder-neutral-300'}`}
                                            />
                                            <button
                                                onClick={() => void handleGenerateTitle()}
                                                disabled={isGeneratingTitle || !currentChapter || !content.trim()}
                                                title={t('editor.aiTitle', 'AI 生成标题')}
                                                className={clsx(
                                                    "shrink-0 p-2 rounded-lg border transition-colors",
                                                    preferences.theme === 'dark'
                                                        ? "border-white/10 text-neutral-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        : "border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                )}
                                            >
                                                <Sparkles className={clsx("w-4 h-4", isGeneratingTitle && "animate-pulse")} />
                                            </button>
                                        </div>
                                        {summaryStatus && (
                                            <p className={clsx(
                                                "mt-2 text-xs text-right",
                                                preferences.theme === 'dark' ? 'text-neutral-400' : 'text-gray-500'
                                            )}>
                                                {summaryStatus}
                                            </p>
                                        )}
                                        {continueStatus && (
                                            <p className={clsx(
                                                "mt-1 text-xs text-right",
                                                preferences.theme === 'dark' ? 'text-neutral-400' : 'text-gray-500'
                                            )}>
                                                {continueStatus}
                                            </p>
                                        )}
                                        {titleGenStatus && (
                                            <div className="mt-1">
                                                <p className={clsx(
                                                    "text-xs text-right",
                                                    preferences.theme === 'dark' ? 'text-neutral-400' : 'text-gray-500'
                                                )}>
                                                    {titleGenStatus}
                                                </p>
                                                {titleGenStage && (
                                                    <div className={clsx(
                                                        "mt-1 h-1.5 w-full rounded-full overflow-hidden",
                                                        preferences.theme === 'dark' ? 'bg-white/10' : 'bg-gray-100'
                                                    )}>
                                                        <div
                                                            className={clsx(
                                                                "h-full rounded-full transition-all duration-300",
                                                                preferences.theme === 'dark' ? 'bg-neutral-300/80' : 'bg-gray-500'
                                                            )}
                                                            style={{
                                                                width: titleGenStage === 'requesting'
                                                                    ? '33%'
                                                                    : titleGenStage === 'generating'
                                                                        ? '66%'
                                                                        : '100%',
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {titleCandidates.length > 0 && (
                                            <div
                                                className={clsx(
                                                    "absolute right-0 top-full mt-2 z-20 w-[360px] max-h-56 overflow-y-auto rounded-xl border shadow-xl",
                                                    preferences.theme === 'dark'
                                                        ? "bg-[#121218] border-white/10"
                                                        : "bg-white border-gray-200"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "flex items-center justify-between px-3 py-2 border-b text-xs",
                                                    preferences.theme === 'dark' ? "border-white/10 text-neutral-400" : "border-gray-100 text-gray-500"
                                                )}>
                                                    <span>{t('editor.aiTitleCandidates', '标题候选')}</span>
                                                    <button
                                                        onClick={() => void handleGenerateTitle()}
                                                        disabled={isGeneratingTitle}
                                                        className={clsx(
                                                            "px-2 py-1 rounded-md border transition-colors",
                                                            preferences.theme === 'dark'
                                                                ? "border-white/10 hover:bg-white/5 disabled:opacity-40"
                                                                : "border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                                                        )}
                                                    >
                                                        {t('editor.regenerate', '再生成')}
                                                    </button>
                                                </div>
                                                {titleCandidates.map((candidate, index) => (
                                                    <button
                                                        key={`${candidate.title}-${index}`}
                                                        onClick={() => {
                                                            setTitle(candidate.title);
                                                            setTitleCandidates([]);
                                                        }}
                                                        className={clsx(
                                                            "w-full text-left px-3 py-2 transition-colors border-b last:border-b-0",
                                                            preferences.theme === 'dark'
                                                                ? "border-white/5 text-neutral-200 hover:bg-white/5"
                                                                : "border-gray-100 text-gray-700 hover:bg-gray-50"
                                                        )}
                                                    >
                                                        <div className="text-sm">{candidate.title}</div>
                                                        <div className={clsx(
                                                            "mt-1 inline-block text-[11px] px-1.5 py-0.5 rounded-full",
                                                            preferences.theme === 'dark'
                                                                ? "bg-white/5 text-neutral-400"
                                                                : "bg-gray-100 text-gray-500"
                                                        )}>
                                                            {candidate.styleTag}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                }
                                    onAddIdea={handleAddIdea}
                                    onIdeaClick={handleIdeaClick}
                                    recentFiles={recentFiles}
                                    onDeleteRecent={handleDeleteRecent}
                                    onRecentFileSelect={handleSelectChapter}
                                    onPlotContextMenu={handlePlotContextMenu}
                                    onPlotAnchorClick={handlePlotAnchorClick}
                                    novelId={novelId}
                                />
                                {/* Floating Elements */}
                                {plotContextMenuData && (
                                    <PlotContextMenu
                                        data={plotContextMenuData}
                                        onClose={() => setPlotContextMenuData(null)}
                                        onAddAnchor={handleAddAnchorClick}
                                        onRemoveAnchor={handleRemoveAnchor}
                                        onViewDetails={handleViewDetails}
                                        onCreatePoint={handleCreatePointFromSelection}
                                        theme={preferences.theme}
                                    />
                                )}

                                <PlotAnchorModal
                                    novelId={novelId}
                                    isOpen={isPlotAnchorModalOpen}
                                    onClose={() => setIsPlotAnchorModalOpen(false)}
                                    onSubmit={handleSubmitAnchor}
                                    theme={preferences.theme}
                                />
                            </div>
                            {isDraftDockOpen && !isCompactDraftDock && (
                                <div className={clsx(
                                    "w-[420px] min-w-[360px] max-w-[520px] shrink-0 border-l",
                                    preferences.theme === 'dark' ? 'border-white/10 bg-[#0F0F13]' : 'border-gray-200 bg-gray-50',
                                )}>
                                    <AIWorkbenchDraftDock
                                        theme={preferences.theme}
                                        draft={creativeDraft}
                                        selection={creativeSelection}
                                        onDraftChange={handleCreativeDraftChange}
                                        onSelectionChange={handleCreativeSelectionChange}
                                        onDraftAndSelectionChange={handleCreativeDraftAndSelectionChange}
                                    />
                                </div>
                            )}
                            {isDraftDockOpen && isCompactDraftDock && (
                                <>
                                    <button
                                        type="button"
                                        className="absolute inset-0 z-20 bg-black/20"
                                        onClick={() => setIsDraftDockOpen(false)}
                                        aria-label="Close draft dock overlay"
                                    />
                                    <div
                                        className={clsx(
                                            "absolute right-0 top-0 bottom-0 z-30 w-[min(92vw,420px)] border-l shadow-2xl",
                                            preferences.theme === 'dark' ? 'border-white/10 bg-[#0F0F13]' : 'border-gray-200 bg-gray-50',
                                        )}
                                    >
                                        <AIWorkbenchDraftDock
                                            theme={preferences.theme}
                                            draft={creativeDraft}
                                            selection={creativeSelection}
                                            onDraftChange={handleCreativeDraftChange}
                                            onSelectionChange={handleCreativeSelectionChange}
                                            onDraftAndSelectionChange={handleCreativeDraftAndSelectionChange}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-neutral-600 flex-col gap-4">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                <ArrowLeft className="w-6 h-6 opacity-50" />
                            </div>
                            <p>{t('editor.selectChapter')}</p>
                        </div>
                    )
                )}

            </div>
            {
                novel && (
                    <SettingsModal
                        isOpen={isSettingsOpen}
                        onClose={() => {
                            setIsSettingsOpen(false);
                            setSettingsInitialTab(undefined);
                        }}
                        initialTab={settingsInitialTab}
                        novelContext={{
                            initialFormatting: novel.formatting || '{}',
                            onSaveFormatting: async (newFormatting) => {
                                await window.db.updateNovel({
                                    id: novelId,
                                    data: { formatting: newFormatting }
                                });
                                setNovel(prev => prev ? ({ ...prev, formatting: newFormatting }) : null);
                            }
                        }}
                    />
                )
            }

            {/* Global Idea Modal */}
            <GlobalIdeaModal
                isOpen={isGlobalIdeaModalOpen}
                onClose={() => setIsGlobalIdeaModalOpen(false)}
                onSave={async (content) => {
                    const newIdea: Idea = {
                        id: crypto.randomUUID(),
                        novelId,
                        chapterId: currentChapter?.id || '',
                        content,
                        timestamp: Date.now(),
                        isStarred: false
                    };

                    setIdeas(prev => [newIdea, ...prev]);
                    setActiveTab('idea');
                    setIsSidePanelOpen(true);

                    try {
                        await window.db.createIdea(newIdea);
                    } catch (e) {
                        console.error('Failed to create global idea:', e);
                    }
                }}
                theme={preferences.theme}
            />

            {isContinueModalOpen && currentChapter && (
                <ContinueWritingModal
                    isOpen={isContinueModalOpen}
                    theme={preferences.theme}
                    onClose={closeContinueModal}
                    blocked={
                        currentChapter.order === 1 && 
                        !plotLines.some((line) => (line.points?.length || 0) > 0) && plotLines.length === 0 &&
                        extractPlainTextFromLexical(contentRef.current || '').length < 120
                    }
                    onNavigateToOutline={() => {
                        setActiveTab('outline');
                        setIsSidePanelOpen(true);
                        closeContinueModal();
                    }}
                    onNavigateToAiWorkbench={() => {
                        setActiveTab('ai_workbench');
                        setIsSidePanelOpen(true);
                        closeContinueModal();
                    }}
                    config={continueConfig}
                    setConfig={setContinueConfig}
                    normalizeTargetLength={normalizeContinueTargetLength}
                    ideas={ideas}
                    isContinuing={isContinuing}
                    onStartContinueWriting={() => void handleStartContinueWriting()}
                    promptLoading={continuePromptLoading}
                    promptError={continuePromptError || ''}
                    promptPreview={continuePromptPreview}
                    promptOverride={continuePromptOverride}
                    promptDefault={continuePromptDefault}
                    onPromptOverrideChange={(value) => {
                        setContinuePromptOverride(value);
                        setContinuePromptDirty(value.trim() !== continuePromptDefault.trim());
                    }}
                    onRefreshPromptPreview={() => void refreshContinuePromptPreview()}
                />
            )}

            {isContinuePreviewOpen && (
                <div className="fixed inset-0 z-[121] flex items-center justify-center bg-black/55 px-4">
                    <div className={clsx(
                        "w-full max-w-4xl rounded-2xl border shadow-2xl",
                        preferences.theme === 'dark' ? 'bg-[#11131a] border-white/10' : 'bg-white border-gray-200'
                    )}>
                        <div className={clsx(
                            "px-5 py-4 border-b flex items-center justify-between",
                            preferences.theme === 'dark' ? 'border-white/10' : 'border-gray-100'
                        )}>
                            <h3 className={clsx("text-sm font-semibold", preferences.theme === 'dark' ? 'text-neutral-100' : 'text-gray-900')}>
                                {t('editor.continuePreviewTitle', '续写预览（确认后写入）')}
                            </h3>
                            <button
                                onClick={() => {
                                    setIsContinuePreviewOpen(false);
                                }}
                                className={clsx("text-xs px-2 py-1 rounded border", preferences.theme === 'dark' ? 'border-white/10 text-neutral-300' : 'border-gray-200 text-gray-600')}
                            >
                                {t('common.close', 'Close')}
                            </button>
                        </div>

                        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <div className={clsx("text-xs mb-2", preferences.theme === 'dark' ? 'text-neutral-400' : 'text-gray-500')}>
                                    {t('editor.continuePreviewContext', '当前正文末尾（参考）')}
                                </div>
                                <pre className={clsx(
                                    "whitespace-pre-wrap rounded-lg border p-3 text-xs leading-relaxed",
                                    preferences.theme === 'dark' ? 'border-white/10 bg-black/20 text-neutral-300' : 'border-gray-200 bg-gray-50 text-gray-700'
                                )}>
                                    {continuePreviewBaseTail || '...'}
                                </pre>
                            </div>
                            <div>
                                <div className={clsx("text-xs mb-2", preferences.theme === 'dark' ? 'text-neutral-400' : 'text-gray-500')}>
                                    {t('editor.continuePreviewInsert', '拟新增内容（将追加）')}
                                </div>
                                <pre className={clsx(
                                    "whitespace-pre-wrap rounded-lg border p-3 text-xs leading-relaxed",
                                    preferences.theme === 'dark' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                )}>
                                    {continuePreviewText}
                                </pre>
                            </div>
                        </div>

                        <div className={clsx(
                            "px-5 py-3 border-t flex items-center justify-end gap-2",
                            preferences.theme === 'dark' ? 'border-white/10' : 'border-gray-100'
                        )}>
                            <button
                                onClick={() => {
                                    setIsContinuePreviewOpen(false);
                                    setContinuePreviewText('');
                                    setContinuePreviewBaseTail('');
                                }}
                                className={clsx("text-xs px-3 py-1.5 rounded border", preferences.theme === 'dark' ? 'border-white/10 text-neutral-300' : 'border-gray-200 text-gray-600')}
                            >
                                {t('editor.discardGenerated', '放弃本次生成')}
                            </button>
                            <button
                                onClick={handleConfirmContinueInsert}
                                className={clsx(
                                    "text-xs px-3 py-1.5 rounded border",
                                    preferences.theme === 'dark' ? 'border-white/20 text-neutral-100 hover:bg-white/10' : 'border-gray-300 text-gray-800 hover:bg-gray-50'
                                )}
                            >
                                {t('editor.confirmInsert', '确认插入')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Flow Mode Specific Overlays --- */}
            <div className={clsx("flow-curtain", isFlowSwitching && "active")} />
            <div className={clsx("flow-vignette", isFlowEntering && "active")} />

            {/* Hover Trigger for Exit Hint */}
            {isFlowMode && (
                <>
                    <div className="flow-top-trigger" />
                    <div className="flow-exit-hint" onClick={toggleFlowMode}>
                        {t('common.exitFlow', '按 ESC 退出心流模式')}
                    </div>
                </>
            )}

            <div
                className={clsx("flow-sidebar-backdrop", isFlowMode && isSidePanelOpen && "active")}
                onClick={() => setIsSidePanelOpen(false)}
            />

            <div
                className="flow-edge-trigger"
                onClick={() => setIsSidePanelOpen(true)}
                title="呼出侧边栏"
            >
                <ChevronRight className="w-5 h-5 trigger-icon" />
            </div>

            <PlotPointModal
                isOpen={isPlotPointModalOpen}
                onClose={() => setIsPlotPointModalOpen(false)}
                point={editingPlotPoint}
                isCreateMode={isPlotPointCreateMode}
                initialData={plotPointCreateData}
                theme={preferences.theme}
                onSave={handleSavePlotPoint}
                onCreate={handleCreatePlotPoint}
                onDelete={handleDeletePlotPoint}
                onAddAnchor={addAnchor}
                onRemoveAnchor={removeAnchor}
                formatting={novel?.formatting}
                volumes={volumes}
                plotLines={plotLines}
            />

        </motion.div>
    );
}



