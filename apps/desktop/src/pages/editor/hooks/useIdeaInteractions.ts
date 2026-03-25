import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { LexicalEditor } from 'lexical';
import { $getRoot } from 'lexical';
import { $isMarkNode, $unwrapMarkNode } from '@lexical/mark';
import { $isIdeaMarkNode } from '../../../components/LexicalEditor/nodes/IdeaMarkNode';
import type { ActivityTab } from '../../../components/ActivityBar';
import type { Idea, Chapter } from '../../../types';

type UseIdeaInteractionsParams = {
    novelId: string;
    ideas: Idea[];
    setIdeas: React.Dispatch<React.SetStateAction<Idea[]>>;
    currentChapter: Chapter | null;
    editorRef: MutableRefObject<LexicalEditor | null>;
    handleSelectChapter: (chapterId: string) => Promise<void>;
    setActiveTab: (tab: ActivityTab) => void;
    setIsSidePanelOpen: (open: boolean) => void;
    setIsGlobalIdeaModalOpen: (open: boolean) => void;
};

export function useIdeaInteractions({
    novelId,
    ideas,
    setIdeas,
    currentChapter,
    editorRef,
    handleSelectChapter,
    setActiveTab,
    setIsSidePanelOpen,
    setIsGlobalIdeaModalOpen,
}: UseIdeaInteractionsParams) {
    const [shakingIdeaId, setShakingIdeaId] = useState<string | null>(null);
    const [highlightedIdeaId, setHighlightedIdeaId] = useState<string | null>(null);
    const [pendingJumpIdea, setPendingJumpIdea] = useState<Idea | null>(null);
    const [pendingSearchJump, setPendingSearchJump] = useState<{ chapterId: string; keyword: string; context?: string } | null>(null);

    const triggerShake = useCallback((id: string) => {
        setShakingIdeaId(id);
        window.setTimeout(() => setShakingIdeaId(null), 500);
    }, []);

    const triggerHighlight = useCallback((id: string) => {
        setHighlightedIdeaId(id);
        window.setTimeout(() => setHighlightedIdeaId(null), 2000);
    }, []);

    const executeJump = useCallback((idea: Idea) => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.update(() => {
            try {
                const domElement = editor.getRootElement()?.querySelector(`[data-idea-id="${idea.id}"]`);
                if (domElement) {
                    domElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    domElement.animate(
                        [
                            { backgroundColor: 'rgba(253, 224, 71, 0.5)' },
                            { backgroundColor: 'transparent' },
                        ],
                        { duration: 1000 },
                    );
                    return;
                }

                if (idea.cursor) {
                    const savedCursor = JSON.parse(idea.cursor);
                    const anchorKey = savedCursor.anchor?.key;
                    if (anchorKey) {
                        const element = editor.getElementByKey(anchorKey);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                        }
                    }
                }

                triggerShake(idea.id);
            } catch (error) {
                console.error('Failed to jump to idea', error);
                triggerShake(idea.id);
            }
        });
    }, [editorRef, triggerShake]);

    const highlightKeyword = useCallback((keyword: string, context?: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        const editorRoot = editor.getRootElement();
        if (!editorRoot) return;

        if ('highlights' in CSS) {
            (CSS as any).highlights.delete('search-results');
        }

        const ranges: Range[] = [];
        const lowerKeyword = keyword.toLowerCase();
        const lowerContext = context ? context.toLowerCase().replace(/\s+/g, '') : null;
        let scrollTargetRange: Range | null = null;

        const treeWalker = document.createTreeWalker(editorRoot, NodeFilter.SHOW_TEXT, null);
        let currentNode: Node | null;
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

                if (lowerContext && !scrollTargetRange) {
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

        if (!scrollTargetRange && ranges.length > 0) {
            scrollTargetRange = ranges[0];
        }

        if (scrollTargetRange) {
            const rect = scrollTargetRange.getBoundingClientRect();
            if (rect.top || rect.bottom) {
                const container = scrollTargetRange.startContainer.parentElement as HTMLElement | null;
                container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        if ('highlights' in CSS && ranges.length > 0) {
            const highlight = new (window as any).Highlight(...ranges);
            (CSS as any).highlights.set('search-results', highlight);
        }
    }, [editorRef]);

    const handleJumpToIdea = useCallback((idea: Idea) => {
        if (idea.chapterId && currentChapter?.id !== idea.chapterId) {
            handleSelectChapter(idea.chapterId).then(() => setPendingJumpIdea(idea));
            return;
        }
        executeJump(idea);
    }, [currentChapter?.id, executeJump, handleSelectChapter]);

    useEffect(() => {
        if (pendingJumpIdea && currentChapter?.id === pendingJumpIdea.chapterId) {
            window.setTimeout(() => {
                executeJump(pendingJumpIdea);
                setPendingJumpIdea(null);
            }, 300);
        }
    }, [currentChapter?.id, executeJump, pendingJumpIdea]);

    const handleJumpToChapter = useCallback((chapterId: string, keyword: string, context?: string) => {
        if (currentChapter?.id === chapterId) {
            highlightKeyword(keyword, context);
        } else {
            handleSelectChapter(chapterId).then(() => {
                setPendingSearchJump({ chapterId, keyword, context });
            });
        }
    }, [currentChapter?.id, handleSelectChapter, highlightKeyword]);

    useEffect(() => {
        if (pendingSearchJump && currentChapter?.id === pendingSearchJump.chapterId) {
            window.setTimeout(() => {
                highlightKeyword(pendingSearchJump.keyword, pendingSearchJump.context);
                setPendingSearchJump(null);
            }, 300);
        }
    }, [currentChapter?.id, highlightKeyword, pendingSearchJump]);

    const handleAddIdea = useCallback(async (id: string, quote: string, cursor: string, note: string) => {
        if (!currentChapter) return;
        const newIdea: Idea = {
            id,
            novelId,
            chapterId: currentChapter.id,
            content: note,
            quote,
            cursor,
            timestamp: Date.now(),
            isStarred: false,
        };
        setIdeas((prev) => [newIdea, ...prev]);
        setActiveTab('idea');
        setIsSidePanelOpen(true);
        try {
            await window.db.createIdea(newIdea);
        } catch (error) {
            console.error('Failed to create idea:', error);
        }
    }, [currentChapter, novelId, setActiveTab, setIdeas, setIsSidePanelOpen]);

    const handleCreateGlobalIdea = useCallback(() => {
        setIsGlobalIdeaModalOpen(true);
    }, [setIsGlobalIdeaModalOpen]);

    const handleDeleteIdea = useCallback(async (id: string) => {
        setIdeas((prev) => prev.filter((idea) => idea.id !== id));
        const editor = editorRef.current;
        if (editor) {
            editor.update(() => {
                const root = $getRoot();
                root.getAllTextNodes().forEach((textNode) => {
                    const parent = textNode.getParent();
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
        } catch (error) {
            console.error('Failed to delete idea:', error);
        }
    }, [editorRef, setIdeas]);

    const handleToggleStar = useCallback(async (id: string, isStarred: boolean) => {
        setIdeas((prev) => prev.map((idea) => (idea.id === id ? { ...idea, isStarred } : idea)));
        try {
            await window.db.updateIdea(id, { isStarred });
        } catch (error) {
            console.error(error);
        }
    }, [setIdeas]);

    const handleUpdateIdea = useCallback((id: string, data: Partial<Idea>) => {
        window.db.updateIdea(id, data).then((updated) => {
            setIdeas((prev) => prev.map((idea) => (idea.id === id ? updated : idea)));
        });
    }, [setIdeas]);

    const handleIdeaClick = useCallback((ideaId: string) => {
        const idea = ideas.find((item) => item.id === ideaId);
        if (!idea) return;
        setActiveTab('idea');
        setIsSidePanelOpen(true);
        triggerHighlight(ideaId);
    }, [ideas, setActiveTab, setIsSidePanelOpen, triggerHighlight]);

    return {
        shakingIdeaId,
        highlightedIdeaId,
        handleAddIdea,
        handleCreateGlobalIdea,
        handleDeleteIdea,
        handleToggleStar,
        handleJumpToIdea,
        handleJumpToChapter,
        handleIdeaClick,
        handleUpdateIdea,
    };
}
