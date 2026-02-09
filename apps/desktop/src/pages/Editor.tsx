import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, PanelLeftClose, PanelLeftOpen, Settings, Info, ChevronRight, LayoutGrid, FileText } from 'lucide-react';
import NarrativeMatrix from '../components/StoryWorkbench/NarrativeMatrix';
import Sidebar from '../components/Sidebar';
import ActivityBar, { ActivityTab } from '../components/ActivityBar';
import SettingsModal from '../components/SettingsModal';
import { useTranslation } from 'react-i18next';
import { useEditorPreferences } from '../hooks/useEditorPreferences';
import { useShortcuts } from '../hooks/useShortcuts';
import { clsx } from 'clsx';
import LexicalChapterEditor from '../components/LexicalEditor';
import { LexicalEditor, $getRoot, $getSelection, $isRangeSelection, $getNodeByKey, $isTextNode, $createRangeSelection, $setSelection } from 'lexical';
import { $isMarkNode, $unwrapMarkNode, $wrapSelectionInMarkNode } from '@lexical/mark';
import { $isIdeaMarkNode } from '../components/LexicalEditor/nodes/IdeaMarkNode';
import UnifiedSearchWorkbench from '../components/SearchWorkbench/UnifiedSearchWorkbench';
import SearchSidebar from '../components/SearchWorkbench/SearchSidebar';
import { FlowModeButton } from '../components/FlowModeButton';
import { GlobalIdeaModal } from '../components/GlobalIdeaModal';
import { RecentFile } from '../components/RecentFilesDropdown';
import PlotSidebar from '../components/StoryWorkbench/PlotSidebar';
import PlotContextMenu from '../components/StoryWorkbench/PlotContextMenu';
import PlotAnchorModal from '../components/StoryWorkbench/PlotAnchorModal';
import { PlotContextMenuData } from '../components/LexicalEditor/plugins/PlotContextMenuPlugin';
import { $isPlotAnchorNode } from '../components/LexicalEditor/nodes/PlotAnchorNode';
import { usePlotSystem } from '../hooks/usePlotSystem';
import { PlotPointModal } from '../components/StoryWorkbench/PlotPointModal';
import { Idea, Novel, Volume, Chapter } from '../types';

// Global variable to track active chapter metadata to avoid closure staleness
let activeChapterMetadata: { id: string; title: string } | null = null;

interface EditorProps {
    novelId: string;
    onBack: () => void;
}

export default function Editor({ novelId, onBack }: EditorProps) {
    const { t, i18n } = useTranslation();
    const { preferences, updatePreference } = useEditorPreferences();
    const { shortcuts, isMatch } = useShortcuts();

    const [viewMode, setViewMode] = useState<'editor' | 'matrix'>('editor');

    // --- 1. Core Data State ---
    const [novel, setNovel] = useState<Novel | null>(null);
    const [volumes, setVolumes] = useState<Volume[]>([]);
    const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [ideas, setIdeas] = useState<Idea[]>([]);

    // --- 2. Story / Plot System ---
    const { addAnchor, removeAnchor, createPlotPoint, updatePlotPoint, plotLines } = usePlotSystem(novelId);
    const [plotContextMenuData, setPlotContextMenuData] = useState<PlotContextMenuData | null>(null);
    const [isPlotAnchorModalOpen, setIsPlotAnchorModalOpen] = useState(false);
    const [pendingAnchorSelection, setPendingAnchorSelection] = useState<PlotContextMenuData | null>(null);

    // --- 3. UI Control State ---
    const [activeTab, setActiveTab] = useState<ActivityTab>('explorer');
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isGlobalIdeaModalOpen, setIsGlobalIdeaModalOpen] = useState(false);
    const [lastCreatedVolumeId, setLastCreatedVolumeId] = useState<string | null>(null);

    // --- 4. Flow Mode State ---
    const [isFlowMode, setIsFlowMode] = useState(false);
    const [isFlowEntering, setIsFlowEntering] = useState(false);
    const [isFlowSwitching, setIsFlowSwitching] = useState(false);

    // --- 5. Jump & Temporary State ---
    const [shakingIdeaId, setShakingIdeaId] = useState<string | null>(null);
    const [highlightedIdeaId, setHighlightedIdeaId] = useState<string | null>(null);
    const [pendingJumpIdea, setPendingJumpIdea] = useState<Idea | null>(null);
    const [pendingSearchJump, setPendingSearchJump] = useState<{ chapterId: string; keyword: string; context?: string } | null>(null);

    // --- 6. Refs ---
    const editorRef = useRef<LexicalEditor | null>(null);
    const contentRef = useRef(content);
    const titleRef = useRef(title);
    const chapterRef = useRef(currentChapter);

    useEffect(() => {
        contentRef.current = content;
        titleRef.current = title;
        chapterRef.current = currentChapter;

        // Sync global metadata whenever currentChapter changes
        if (currentChapter) {
            activeChapterMetadata = { id: currentChapter.id, title: currentChapter.title };
            console.log('[Editor] Updated activeChapterMetadata:', activeChapterMetadata);
        }
    }, [content, title, currentChapter]);

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

    const handleTabChange = (tab: ActivityTab) => {
        if (tab === 'settings') {
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

    // Update Recent Files Helper
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
                    chapterId: currentChapter?.id // Auto-fill current chapter
                }
            };
            // Add to top, limit to 25
            const updated = [newFile, ...filtered].slice(0, 25);
            localStorage.setItem(`recent_files_${novelId}`, JSON.stringify(updated));
            return updated;
        });
    }, [novelId, currentChapter]);

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

    // Load Chapter Content
    const handleSelectChapter = async (chapterId: string) => {
        setIsLoading(true);
        try {
            const chapter = await window.db.getChapter(chapterId);
            if (chapter) {
                setCurrentChapter(chapter);
                activeChapterMetadata = { id: chapter.id, title: chapter.title }; // Update Global Metadata
                setTitle(chapter.title);
                setContent(chapter.content);
                localStorage.setItem(`last_chapter_${novelId}`, chapterId);
                addToRecentFiles(chapter); // Add to recent files on selection
            }
        } catch (error) {
            console.error('Failed to load chapter:', error);
        } finally {
            setIsLoading(false);
        }
    };

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
                    const root = $getRoot();
                    root.getAllTextNodes().forEach(textNode => {
                        const parent = textNode.getParent();
                        if ($isPlotAnchorNode(parent) && parent.hasID(anchorId)) {
                            parent.deleteID(anchorId);
                            if (parent.getIDs().length === 0) {
                                $unwrapMarkNode(parent);
                            }
                        }
                    });
                });
            }
        } catch (e) {
            console.error('Failed to remove anchor:', e);
        }
        setPlotContextMenuData(null);
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
                applyPlotAnchor(newAnchor.id);
            }

            setIsPlotAnchorModalOpen(false);
            setPendingAnchorSelection(null);
        } catch (e) {
            console.error('Create anchor failed:', e);
        }
    };

    // Helper to Apply Anchor
    const applyPlotAnchor = (anchorId: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.focus();
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $wrapSelectionInMarkNode(selection as any, selection.isCollapsed(), anchorId);
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

                if ($isRangeSelection(selection)) {
                    $wrapSelectionInMarkNode(selection as any, false, anchorId);
                }
            }
        });
    };

    // Create Chapter
    const handleCreateChapter = async (volumeId: string) => {
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
    };

    // Create Volume
    const handleCreateVolume = async () => {
        const title = '';
        try {
            const newVol = await window.db.createVolume({ novelId, title });
            await loadVolumes();
            setLastCreatedVolumeId(newVol.id);
        } catch (error) {
            console.error('Failed to create volume:', error);
        }
    };

    // Rename Logic
    const handleRenameVolume = async (volumeId: string, title: string) => {
        try {
            await window.db.renameVolume({ volumeId, title });
            await loadVolumes();
        } catch (error) {
            console.error('Failed to rename volume:', error);
        }
    };

    const handleRenameChapter = async (chapterId: string, title: string) => {
        try {
            await window.db.renameChapter({ chapterId, title });
            if (currentChapter?.id === chapterId) {
                setTitle(title);
            }
            await loadVolumes();
        } catch (error) {
            console.error('Failed to rename chapter:', error);
        }
    };

    // Save Logic
    const saveChanges = useCallback(async () => {
        const currentRef = chapterRef.current;
        if (!currentRef) return;

        let chapterUpdated = false;

        // Save Content
        if (contentRef.current !== currentRef.content) {
            await window.db.saveChapter({
                chapterId: currentRef.id,
                content: contentRef.current
            });
            chapterUpdated = true;
        }

        // Save Title
        if (titleRef.current !== currentRef.title) {
            await window.db.renameChapter({
                chapterId: currentRef.id,
                title: titleRef.current
            });
            loadVolumes(); // Reload volumes to reflect title change in sidebar
            chapterUpdated = true;
        }

        // Update currentChapter state and recent files if anything changed
        if (chapterUpdated) {
            const updatedChapter = {
                ...currentRef,
                content: contentRef.current,
                title: titleRef.current
            };
            setCurrentChapter(updatedChapter);
            addToRecentFiles(updatedChapter);
        }
    }, [loadVolumes, addToRecentFiles]);

    // Auto-Save Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentChapter) {
                if (content !== currentChapter.content || title !== currentChapter.title) {
                    saveChanges();
                }
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [content, title, currentChapter, saveChanges]);

    // Save on Unmount / BeforeUnload
    useEffect(() => {
        const handleUnload = () => {
            if (chapterRef.current && (contentRef.current !== chapterRef.current.content || titleRef.current !== chapterRef.current.title)) {
                saveChanges();
            }
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            handleUnload();
        };
    }, [saveChanges]);

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
    const [isPlotPointModalOpen, setIsPlotPointModalOpen] = useState(false);
    const [editingPlotPoint, setEditingPlotPoint] = useState<any>(null); // Resolve type if possible or stick to any for now
    const [plotPointCreateData, setPlotPointCreateData] = useState<any>(null);
    const [isPlotPointCreateMode, setIsPlotPointCreateMode] = useState(false);

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

    const handleCreatePointFromSelection = () => {
        if (plotContextMenuData?.text) {
            setPendingAnchorSelection(plotContextMenuData);

            // Use global metadata if available (to avoid stale closure), otherwise fallback to currentChapter state
            let chapter: any = activeChapterMetadata || currentChapter;
            console.log('Creating point from selection, Chapter (Global/State):', activeChapterMetadata, currentChapter);

            // Fallback: If no current chapter, try to find from localStorage
            if (!chapter) {
                // Try recent files first
                if (recentFiles.length > 0) {
                    const recentId = recentFiles[0].id;
                    console.log('Using recent file as fallback:', recentId);
                    for (const v of volumes) {
                        const found = v.chapters.find(c => c.id === recentId);
                        if (found) {
                            chapter = found;
                            break;
                        }
                    }
                }

                if (!chapter) {
                    const lastChapterId = localStorage.getItem(`last_chapter_${novelId}`);
                    if (lastChapterId) {
                        // Try to find in volumes
                        for (const v of volumes) {
                            const found = v.chapters.find(c => c.id === lastChapterId);
                            if (found) {
                                chapter = found;
                                console.log('Found fallback chapter from localStorage:', chapter);
                                break;
                            }
                        }
                    }
                }
            }

            // Open Modal in Create Mode
            setIsPlotPointCreateMode(true);
            setPlotPointCreateData({
                description: plotContextMenuData.text, // Use selection as default description
                chapterId: chapter?.id,
                title: chapter?.title // Default title is chapter title
            });
            setEditingPlotPoint(null);
            setIsPlotPointModalOpen(true);
        }
        setPlotContextMenuData(null);
    };

    const handleCreatePlotPoint = async (data: any, initialChapterId?: string) => {
        try {
            const newPoint = await createPlotPoint(data);
            // Logic to handle anchor creation if pending selection exists
            const targetChapterId = initialChapterId || (pendingAnchorSelection && currentChapter?.id);

            // Only anchor to selection if the target chapter matches the current chapter where selection was made
            // Otherwise we might anchor to wrong text in different chapter or create invalid anchor
            const shouldAnchorToSelection = pendingAnchorSelection && currentChapter?.id && targetChapterId === currentChapter.id;

            if (newPoint && shouldAnchorToSelection && pendingAnchorSelection) {
                await addAnchor({
                    plotPointId: newPoint.id,
                    chapterId: targetChapterId!,
                    type: 'setup',
                    lexicalKey: pendingAnchorSelection.nodeKey,
                    offset: pendingAnchorSelection.offset,
                    length: pendingAnchorSelection.length
                });
                applyPlotAnchorFromData(newPoint.id, pendingAnchorSelection);
                setPendingAnchorSelection(null);
            } else if (newPoint && targetChapterId) {
                // Fallback for manual creation or if chapter changed (just associate with chapter)
                await addAnchor({
                    plotPointId: newPoint.id,
                    chapterId: targetChapterId,
                    type: 'setup'
                });
            }
        } catch (e) {
            console.error("Failed to create plot point", e);
        }
    };

    const handleSavePlotPoint = async (id: string, data: any) => {
        try {
            await updatePlotPoint(id, data);
        } catch (e) {
            console.error("Failed to update plot point", e);
        }
    };

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
                            />
                        </div>

                        {activeTab === 'characters' && (
                            <div className="flex-1 flex flex-col items-center justify-center p-4 text-neutral-500 text-sm text-center">
                                <Info className="w-8 h-8 mb-4 opacity-50" />
                                <p>{t('sidebar.characters')} {t('common.loading')}</p>
                            </div>
                        )}

                        {activeTab === 'map' && (
                            <div className="flex-1 flex flex-col items-center justify-center p-4 text-neutral-500 text-sm text-center">
                                <Info className="w-8 h-8 mb-4 opacity-50" />
                                <p>{t('sidebar.map')} {t('common.loading')}</p>
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
                        </div>
                    </div>

                    {/* Right: Actions (Width fixed to match left) */}
                    <div className="flex items-center gap-2 justify-end w-[180px] shrink-0">
                        <FlowModeButton
                            isActive={isFlowMode}
                            onClick={toggleFlowMode}
                            className="mr-1"
                        />
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className={`p-2 rounded-full transition-colors ${preferences.theme === 'dark' ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-black/5 hover:text-black'}`}
                            title={t('editor.settings')}
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => saveChanges()}
                            className={`p-2 rounded-full transition-colors active:scale-90 ${preferences.theme === 'dark' ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-black/5 hover:text-black'}`}
                            title={t('editor.save')}
                        >
                            <Save className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Editor Area or Matrix */}
                {viewMode === 'matrix' ? (
                    <NarrativeMatrix novelId={novelId} theme={preferences.theme} activeChapterId={currentChapter?.id} volumes={volumes} formatting={novel?.formatting} />
                ) : (
                    currentChapter ? (
                        <div className={clsx(
                            "flex-1 min-h-0 editor-shell layout-transition",
                            preferences.theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-white'
                        )}>
                            <LexicalChapterEditor
                                key={currentChapter.id}
                                namespace={currentChapter.id}
                                initialContent={currentChapter.content}
                                onChange={(editorState) => {
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
                                headerContent={
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder={t('editor.chapterTitle')}
                                        className={`w-full bg-transparent text-3xl font-bold outline-none text-center font-serif mb-4 ${preferences.theme === 'dark' ? 'text-neutral-100 placeholder-neutral-600' : 'text-neutral-900 placeholder-neutral-300'}`}
                                    />
                                }
                                onAddIdea={handleAddIdea}
                                onIdeaClick={handleIdeaClick}
                                recentFiles={recentFiles}
                                onDeleteRecent={handleDeleteRecent}
                                onRecentFileSelect={handleSelectChapter}
                                onPlotContextMenu={handlePlotContextMenu} // [NEW]
                            />
                            {/* Floating Elements */}
                            {plotContextMenuData && (
                                <PlotContextMenu
                                    data={plotContextMenuData}
                                    onClose={() => setPlotContextMenuData(null)}
                                    onAddAnchor={handleAddAnchorClick}
                                    onRemoveAnchor={handleRemoveAnchor}
                                    onViewDetails={() => {
                                        // Open sidebar to specific point?
                                        console.log('View details for anchor:', plotContextMenuData.anchorId);
                                        setPlotContextMenuData(null);
                                    }}
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
                        onClose={() => setIsSettingsOpen(false)}
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
                onSave={async () => { }}
                theme={preferences.theme}
            />

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
                novelId={novelId}
                theme={preferences.theme}
                onSave={handleSavePlotPoint}
                onCreate={handleCreatePlotPoint}
                onAddAnchor={addAnchor}
                onRemoveAnchor={removeAnchor}
                formatting={novel?.formatting}
            />

        </motion.div>
    );
}
