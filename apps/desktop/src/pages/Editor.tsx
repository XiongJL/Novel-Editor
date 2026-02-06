import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, PanelLeftClose, PanelLeftOpen, Settings, Info, ChevronRight } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ActivityBar, { ActivityTab } from '../components/ActivityBar';
import SettingsModal from '../components/SettingsModal';
import { useTranslation } from 'react-i18next';
import { useEditorPreferences } from '../hooks/useEditorPreferences';
import { useShortcuts } from '../hooks/useShortcuts';
import { clsx } from 'clsx';
import LexicalChapterEditor from '../components/LexicalEditor';
import { LexicalEditor, $getRoot } from 'lexical';
import { $isMarkNode, $unwrapMarkNode } from '@lexical/mark';
import { $isIdeaMarkNode } from '../components/LexicalEditor/nodes/IdeaMarkNode';
import UnifiedSearchWorkbench from '../components/SearchWorkbench/UnifiedSearchWorkbench';
import SearchSidebar from '../components/SearchWorkbench/SearchSidebar';
import { FlowModeButton } from '../components/FlowModeButton';
import { GlobalIdeaModal } from '../components/GlobalIdeaModal';
import { RecentFile } from '../components/RecentFilesDropdown';
import { Idea } from '../types';
// TODO: Add filter state for chapter-only, search text, date range
// const filteredIdeas = ideas;

interface EditorProps {
    novelId: string;
    onBack: () => void;
}

export default function Editor({ novelId, onBack }: EditorProps) {
    const { t, i18n } = useTranslation();
    const { preferences, updatePreference } = useEditorPreferences();
    console.log('Editor rendering, novelId:', novelId);

    // Data State
    const [volumes, setVolumes] = useState<Volume[]>([]);
    const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
    const [novel, setNovel] = useState<Novel | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Idea State
    const [ideas, setIdeas] = useState<Idea[]>([]);

    const [shakingIdeaId, setShakingIdeaId] = useState<string | null>(null);
    const [highlightedIdeaId, setHighlightedIdeaId] = useState<string | null>(null);

    // UI State
    const [activeTab, setActiveTab] = useState<ActivityTab>('explorer');
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isGlobalIdeaModalOpen, setIsGlobalIdeaModalOpen] = useState(false);
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

    const [isFlowMode, setIsFlowMode] = useState(false);
    const [isFlowEntering, setIsFlowEntering] = useState(false);
    const [isFlowSwitching, setIsFlowSwitching] = useState(false);

    const toggleFlowMode = useCallback(async () => {
        // 1. Curtain Down (Start Transition)
        setIsFlowSwitching(true);

        const nextState = !isFlowMode;
        console.log('[FlowMode] Toggling state to:', nextState);

        // Allow curtain to fade in before shifting layout
        setTimeout(async () => {
            // 2. Layout & Class Sync
            try {
                if (nextState) {
                    document.body.classList.add('flow-mode-active');
                    setIsSidePanelOpen(false);
                    // Trigger entering animation (vignette)
                    setIsFlowEntering(true);
                    setTimeout(() => setIsFlowEntering(false), 1500);
                } else {
                    document.body.classList.remove('flow-mode-active');
                    setIsSidePanelOpen(true);
                }
                setIsFlowMode(nextState);
                console.log('[FlowMode] UI state updated successfully');
            } catch (err) {
                console.error('[FlowMode] Failed to update UI state:', err);
            }

            // 3. Fullscreen Handshake
            try {
                if ((window as any).electron?.toggleFullScreen) {
                    await (window as any).electron.toggleFullScreen();
                }
            } catch (e) {
                console.warn('[FlowMode] Fullscreen toggle failed:', e);
            }

            // 4. Focus Editor
            setTimeout(() => {
                if (editorRef.current) {
                    editorRef.current.focus();
                }
            }, 500);

            // 5. Curtain Up (End Transition)
            setTimeout(() => {
                setIsFlowSwitching(false);
            }, 400); // Wait for sidebar/layout transition to finish (0.3s)
        }, 100);

    }, [isFlowMode]);

    // Cleanup Flow Mode on Unmount
    useEffect(() => {
        return () => {
            document.body.classList.remove('flow-mode-active');
        };
    }, []);

    // Handle ESC key in Flow Mode (Capture Phase to override Lexical)
    useEffect(() => {
        if (!isFlowMode) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();

                if (isSidePanelOpen) {
                    setIsSidePanelOpen(false);
                } else {
                    // Trigger exit
                    toggleFlowMode();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isFlowMode, isSidePanelOpen, toggleFlowMode]);

    // Clear search highlights
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
            // Clear search highlights when leaving search tab
            if (activeTab === 'search') {
                clearSearchHighlights();
            }
            setActiveTab(tab);
            setIsSidePanelOpen(true);
        }
    };

    // Editor State
    const [title, setTitle] = useState('');
    const [content, setContent] = useState(''); // Stores JSON string or plain text

    // Lexical Instance
    const editorRef = useRef<LexicalEditor | null>(null);

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
                timestamp: Date.now()
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

    const [lastCreatedVolumeId, setLastCreatedVolumeId] = useState<string | null>(null);

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

    // Refs for latest state
    const contentRef = useRef(content);
    const titleRef = useRef(title);
    const chapterRef = useRef(currentChapter);

    useEffect(() => {
        contentRef.current = content;
        titleRef.current = title;
        chapterRef.current = currentChapter;
    }, [content, title, currentChapter]);

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

    // Shortcuts
    const { shortcuts, isMatch } = useShortcuts();

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

    const submitGlobalIdea = async (content: string) => {
        setIsGlobalIdeaModalOpen(false);

        const newIdea: Idea = {
            id: crypto.randomUUID(),
            novelId,
            content,
            timestamp: Date.now(),
            isStarred: false
        };
        setIdeas(prev => [newIdea, ...prev]);
        try {
            await window.db.createIdea(newIdea);
        } catch (e) {
            console.error('Failed to save idea:', e);
        }
    };

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

    const [pendingJumpIdea, setPendingJumpIdea] = useState<Idea | null>(null);
    const [pendingSearchJump, setPendingSearchJump] = useState<{ chapterId: string; keyword: string; context?: string } | null>(null);

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
                        {activeTab === 'outline' && (
                            <div className="flex-1 flex flex-col items-center justify-center p-4 text-neutral-500 text-sm text-center">
                                <Info className="w-8 h-8 mb-4 opacity-50" />
                                <p>{t('sidebar.outline')} {t('common.loading')}</p>
                                <p className="text-xs mt-2 opacity-50">Feature coming soon</p>
                            </div>
                        )}

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
            <div className={`flex-1 flex flex-col h-full relative transition-all ${preferences.theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>

                {/* Header */}
                <div className={clsx(
                    "flex items-center justify-between border-b z-30 top-nav transition-all duration-300 ease-in-out",
                    preferences.theme === 'dark' ? 'border-white/5 bg-[#0a0a0f] text-neutral-400' : 'border-gray-200 bg-white text-neutral-600',
                    isFlowMode
                        ? "h-0 p-0 border-b-0 opacity-0 pointer-events-none"
                        : "h-[70px] p-4" // Explicit height to allow smooth transition
                )}>
                    <div className="flex items-center gap-2">
                        <button onClick={onBack} className={`p-2 rounded-full transition-colors ${preferences.theme === 'dark' ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-black/5 hover:text-black'}`}>
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <button onClick={() => setIsSidePanelOpen(!isSidePanelOpen)} className={`p-2 rounded-full transition-colors ${preferences.theme === 'dark' ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-black/5 hover:text-black'}`}>
                            {isSidePanelOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* Title in Center (If loaded) */}
                    {currentChapter && (
                        <div className="flex-1 px-8 flex justify-center">
                            <span className={`text-xs font-mono uppercase tracking-widest hidden md:block ${preferences.theme === 'dark' ? 'text-neutral-600' : 'text-neutral-400'}`}>
                                {isLoading ? t('common.loading') : (currentChapter ? t('editor.editing') : t('editor.selectChapter'))}
                            </span>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
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

                {/* Editor Area - Now fully handled by LexicalChapterEditor including Toolbar */}
                {currentChapter ? (
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
                        />
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-neutral-600 flex-col gap-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                            <ArrowLeft className="w-6 h-6 opacity-50" />
                        </div>
                        <p>{t('editor.selectChapter')}</p>
                    </div>
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
                onSave={submitGlobalIdea}
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


        </motion.div>
    );
}
