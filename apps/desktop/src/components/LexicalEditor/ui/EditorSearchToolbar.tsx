import { useState, useEffect, useRef, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $isTextNode, $getNodeByKey, COMMAND_PRIORITY_NORMAL, KEY_DOWN_COMMAND } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { ArrowUp, ArrowDown, X, Replace, ReplaceAll } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useEditorPreferences } from '../../../hooks/useEditorPreferences';

interface SearchMatch {
    nodeKey: string;
    start: number;
    end: number;
    text: string;
}

export default function EditorSearchToolbar() {
    const [editor] = useLexicalComposerContext();
    const { t } = useTranslation();
    const { preferences } = useEditorPreferences();
    const isDark = preferences.theme === 'dark';

    // UI State
    const [isOpen, setIsOpen] = useState(false);
    const [isReplaceOpen, setIsReplaceOpen] = useState(false);

    // Search State
    const [searchText, setSearchText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [matches, setMatches] = useState<SearchMatch[]>([]);
    const [currentIdx, setCurrentIdx] = useState(-1);

    // Options
    const [matchCase, setMatchCase] = useState(false);
    const [useRegex, setUseRegex] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);

    // Toggle Search
    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                KEY_DOWN_COMMAND,
                (event: KeyboardEvent) => {
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                        if (event.shiftKey) return false; // Let global search handle Shift+F
                        event.preventDefault();
                        setIsOpen(true);
                        setTimeout(() => inputRef.current?.select(), 50);
                        return true;
                    }
                    if (event.key === 'Escape' && isOpen) {
                        event.preventDefault();
                        handleClose();
                        return true;
                    }
                    return false;
                },
                COMMAND_PRIORITY_NORMAL
            )
        );
    }, [editor, isOpen]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setSearchText('');
        setMatches([]);
        setCurrentIdx(-1);
        clearHighlights();
        // Return focus to editor
        editor.focus();
    }, [editor]);

    // Search Logic
    const performSearch = useCallback((query: string, isCaseSensitive: boolean, isRegex: boolean) => {
        if (!query) {
            setMatches([]);
            setCurrentIdx(-1);
            clearHighlights();
            return;
        }

        editor.getEditorState().read(() => {
            const root = $getRoot();
            const textNodes = root.getAllTextNodes();
            const found: SearchMatch[] = [];

            let regex: RegExp;
            try {
                const flags = isCaseSensitive ? 'g' : 'gi';
                regex = isRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
            } catch (e) {
                return; // Invalid regex
            }

            textNodes.forEach(node => {
                const text = node.getTextContent();
                let match;
                while ((match = regex.exec(text)) !== null) {
                    found.push({
                        nodeKey: node.getKey(),
                        start: match.index,
                        end: match.index + match[0].length,
                        text: match[0]
                    });
                }
            });

            setMatches(found);
            if (found.length > 0) {
                setCurrentIdx(0);
                highlightMatches(found, 0);
                scrollToMatch(found[0]);
            } else {
                setCurrentIdx(-1);
                clearHighlights();
            }
        });
    }, [editor]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            performSearch(searchText, matchCase, useRegex);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchText, matchCase, useRegex, performSearch]);

    // Highlight Logic
    const clearHighlights = () => {
        if ('highlights' in CSS) {
            (CSS as any).highlights.delete('editor-search');
            (CSS as any).highlights.delete('editor-search-active');
        }
    };

    const highlightMatches = (currentMatches: SearchMatch[], activeIdx: number) => {
        if (!('highlights' in CSS)) return;

        editor.getEditorState().read(() => {
            const ranges: Range[] = [];
            const activeRanges: Range[] = [];

            currentMatches.forEach((match, idx) => {
                // TextNodes can be split. Lexical `getElementByKey` returns the DOM node.

                const domNode = editor.getElementByKey(match.nodeKey);
                if (!domNode) return;

                // For CSS Highlights we need Range
                const range = new Range();

                // If domNode is Element (span), we need its text child?
                // Lexical text nodes are often rendered as <span data-lexical-text="true">Text</span>.
                // In that case, startContainer should be domNode.firstChild (the text node).

                let textNode: Node = domNode;
                if (domNode.nodeType === Node.ELEMENT_NODE && domNode.firstChild && domNode.firstChild.nodeType === Node.TEXT_NODE) {
                    textNode = domNode.firstChild;
                }

                try {
                    range.setStart(textNode, match.start);
                    range.setEnd(textNode, match.end);

                    if (idx === activeIdx) {
                        activeRanges.push(range);
                    } else {
                        ranges.push(range);
                    }
                } catch (e) {
                    // Start/End might be invalid if DOM changed but React state lags
                }
            });

            const highlight = new (window as any).Highlight(...ranges);
            const activeHighlight = new (window as any).Highlight(...activeRanges);

            (CSS as any).highlights.set('editor-search', highlight);
            (CSS as any).highlights.set('editor-search-active', activeHighlight);
        });
    };

    const scrollToMatch = (match: SearchMatch) => {
        editor.getEditorState().read(() => {
            const domNode = editor.getElementByKey(match.nodeKey);
            if (domNode) {
                domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Also select it?
                // editor.update(() => { ... select ... })
                // Maybe not force selection to avoid focus stealing issue if user is typing elsewhere?
                // But for "Find", usually we want to see it.
            }
        });
    };

    // Navigation
    const nextMatch = () => {
        if (matches.length === 0) return;
        const next = (currentIdx + 1) % matches.length;
        setCurrentIdx(next);
        highlightMatches(matches, next);
        scrollToMatch(matches[next]);
    };

    const prevMatch = () => {
        if (matches.length === 0) return;
        const prev = (currentIdx - 1 + matches.length) % matches.length;
        setCurrentIdx(prev);
        highlightMatches(matches, prev);
        scrollToMatch(matches[prev]);
    };

    // Replace
    const replaceCurrent = () => {
        if (currentIdx === -1 || !matches[currentIdx]) return;
        const match = matches[currentIdx];

        editor.update(() => {
            const node = $getNodeByKey(match.nodeKey);
            // But we have key.
            // Check if node is TextNode
            if ($isTextNode(node)) {
                // Replacements affect offsets.
                // Simplest: replace, then re-search.
                node.spliceText(match.start, match.end - match.start, replaceText);
            }
        }, {
            onUpdate: () => {
                // Determine new index? Keep same index (next match becomes current)
                // performSearch will verify.
                // We trust useEffect dependency on searchText to NOT trigger immediately if text hasn't changed?
                // But text node content CHANGED.
                // We need to re-run search.
                performSearch(searchText, matchCase, useRegex);
            }
        });
    };

    const replaceAll = () => {
        if (matches.length === 0) return;

        editor.update(() => {
            // Iterate BACKWARDS to avoid offset issues
            // Group by nodeKey? 
            // Or just do it.
            // Since we capture matches at a specific snapshot, if we modify one node, other matches in SAME node might shift.
            // So we MUST process back-to-front per node.

            // 1. Group matches by NodeKey
            const byNode: Record<string, SearchMatch[]> = {};
            matches.forEach(m => {
                if (!byNode[m.nodeKey]) byNode[m.nodeKey] = [];
                byNode[m.nodeKey].push(m);
            });

            // 2. For each node, sort matches by start descending
            Object.keys(byNode).forEach(key => {
                const nodeMatches = byNode[key].sort((a, b) => b.start - a.start);
                const node = $getNodeByKey(key);
                if ($isTextNode(node)) {
                    nodeMatches.forEach(m => {
                        node.spliceText(m.start, m.end - m.start, replaceText);
                    });
                }
            });
        }, {
            onUpdate: () => {
                performSearch(searchText, matchCase, useRegex);
            }
        });
    };

    // Key handler for input
    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) prevMatch();
            else nextMatch();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className={clsx(
            "absolute top-4 right-8 z-[100] w-80 rounded-lg shadow-xl border overflow-hidden text-sm font-sans flex flex-col animate-in fade-in slide-in-from-top-2 duration-200",
            isDark ? "bg-neutral-800 border-neutral-700" : "bg-white border-gray-200"
        )}>
            {/* Find Row */}
            <div className="flex items-center p-2 gap-1 relative">
                <button
                    onClick={() => setIsReplaceOpen(!isReplaceOpen)}
                    className={clsx(
                        "p-1 rounded",
                        isDark ? "hover:bg-white/10" : "hover:bg-gray-100",
                        isReplaceOpen && (isDark ? "bg-white/10" : "bg-gray-100")
                    )}
                    title={t("search.toggleReplace")}
                >
                    <div className={clsx(
                        "w-3 h-3 border-l-2 border-b-2 transform transition-transform",
                        isDark ? "border-gray-400" : "border-gray-500",
                        isReplaceOpen ? "-rotate-45 mb-0.5" : "rotate-[-135deg] mt-0.5"
                    )} />
                </button>

                <div className="flex-1 relative flex items-center">
                    <input
                        ref={inputRef}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder={t("search.find")}
                        className={clsx(
                            "w-full border-0 rounded pl-2 pr-20 py-1 focus:ring-1 focus:ring-indigo-500 outline-none",
                            isDark ? "bg-black/30 text-gray-200" : "bg-gray-100 text-gray-800",
                            isDark ? "placeholder-gray-500" : "placeholder-gray-400"
                        )}
                        autoFocus
                    />

                    {/* Input Actions */}
                    <div className="absolute right-1 flex items-center gap-0.5">
                        <button
                            onClick={() => setMatchCase(!matchCase)}
                            className={clsx(
                                "p-0.5 rounded",
                                matchCase
                                    ? (isDark ? "bg-white/20 text-indigo-400" : "bg-gray-300 text-indigo-500")
                                    : (isDark ? "text-gray-400 hover:text-gray-300" : "text-gray-400 hover:text-gray-600")
                            )}
                            title={t("search.matchCase")}
                        >
                            <span className="text-[10px] font-bold">Aa</span>
                        </button>
                        <button
                            onClick={() => setUseRegex(!useRegex)}
                            className={clsx(
                                "p-0.5 rounded",
                                useRegex
                                    ? (isDark ? "bg-white/20 text-indigo-400" : "bg-gray-300 text-indigo-500")
                                    : (isDark ? "text-gray-400 hover:text-gray-300" : "text-gray-400 hover:text-gray-600")
                            )}
                            title={t("search.regex")}
                        >
                            <span className="text-[10px] font-bold">.*</span>
                        </button>
                    </div>
                </div>

                <span className="text-xs text-gray-400 min-w-[30px] text-center">
                    {matches.length > 0 ? `${currentIdx + 1}/${matches.length}` : '0/0'}
                </span>

                <button onClick={prevMatch} className={clsx("p-1 rounded", isDark ? "text-gray-400 hover:bg-white/10" : "text-gray-500 hover:bg-gray-100")} disabled={matches.length === 0}><ArrowUp size={14} /></button>
                <button onClick={nextMatch} className={clsx("p-1 rounded", isDark ? "text-gray-400 hover:bg-white/10" : "text-gray-500 hover:bg-gray-100")} disabled={matches.length === 0}><ArrowDown size={14} /></button>
                <button onClick={handleClose} className={clsx("p-1 rounded", isDark ? "text-gray-400 hover:bg-white/10" : "text-gray-500 hover:bg-gray-100")}><X size={14} /></button>
            </div>

            {/* Replace Row */}
            {isReplaceOpen && (
                <div className="flex items-center p-2 pt-0 gap-1 pl-8">
                    <div className="flex-1 flex items-center gap-2">
                        <input
                            value={replaceText}
                            onChange={(e) => setReplaceText(e.target.value)}
                            placeholder={t("search.replace")}
                            className={clsx(
                                "flex-1 border-0 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none",
                                isDark ? "bg-black/30 text-gray-200 placeholder-gray-500" : "bg-gray-100 text-gray-800 placeholder-gray-400"
                            )}
                        />
                        <button onClick={replaceCurrent} disabled={matches.length === 0} title={t("search.replace")} className={clsx("p-1 px-2 text-xs rounded", isDark ? "bg-white/10 hover:bg-white/20 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700")}>
                            {/* Icon or Text? Text is better for Replace */}
                            <Replace size={14} className="inline mr-1" />
                        </button>
                        <button onClick={replaceAll} disabled={matches.length === 0} title={t("search.replaceAll")} className={clsx("p-1 px-2 text-xs rounded", isDark ? "bg-white/10 hover:bg-white/20 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700")}>
                            <ReplaceAll size={14} className="inline mr-1" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
