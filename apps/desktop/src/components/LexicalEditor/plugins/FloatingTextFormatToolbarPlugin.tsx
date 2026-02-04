import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    $isRangeSelection,
    $getSelection,
    $setSelection,
    FORMAT_TEXT_COMMAND,
    LexicalEditor,
    COMMAND_PRIORITY_LOW,
    SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { $wrapSelectionInMarkNode } from '@lexical/mark';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from '@lexical/utils';
import { Bold, Italic, Underline, Strikethrough, Lightbulb, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEditorPreferences } from '../../../hooks/useEditorPreferences';

import { $createIdeaMarkNode } from '../nodes/IdeaMarkNode';

interface FloatingTextFormatToolbarPluginProps {
    anchorElem?: HTMLElement;
    onAddIdea: (id: string, quote: string, cursor: string, note: string) => void;
}

const FloatingToolbar = ({
    editor,
    anchorElem,
    isBold,
    isItalic,
    isUnderline,
    isStrikethrough,
    onAddIdea,
    isDark
}: {
    editor: LexicalEditor;
    anchorElem: HTMLElement;
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
    isStrikethrough: boolean;
    onAddIdea: (id: string, quote: string, cursor: string, note: string) => void;
    isDark: boolean;
}) => {
    const popupCharStylesEditorRef = useRef<HTMLDivElement | null>(null);
    const caretRef = useRef<HTMLDivElement | null>(null);
    const [showIdeaInput, setShowIdeaInput] = useState(false);
    const [ideaNote, setIdeaNote] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const lastSelectionRef = useRef<any>(null); // Store selection
    const { t } = useTranslation();

    const updateTextFormatFloatingToolbar = useCallback(() => {
        const selection = $getSelection();

        const popupCharStylesEditorElem = popupCharStylesEditorRef.current;
        const nativeSelection = window.getSelection();

        if (popupCharStylesEditorElem === null) {
            return;
        }

        const rootElement = editor.getRootElement();
        if (
            selection !== null &&
            nativeSelection !== null &&
            !nativeSelection.isCollapsed &&
            rootElement !== null &&
            rootElement.contains(nativeSelection.anchorNode)
        ) {
            const rangeRect = nativeSelection.getRangeAt(0).getBoundingClientRect();
            const elemRect = anchorElem.getBoundingClientRect();

            let top = rangeRect.top - elemRect.top - 60; // Increased offset to avoid overlap
            let left = rangeRect.left - elemRect.left + rangeRect.width / 2 - popupCharStylesEditorElem.offsetWidth / 2;

            if (left < 0) left = 10;
            if (top < 0) top = rangeRect.bottom - elemRect.top + 20; // Flip to bottom with gap

            popupCharStylesEditorElem.style.opacity = '1';
            popupCharStylesEditorElem.style.top = `${top}px`;
            popupCharStylesEditorElem.style.left = `${left}px`;

            // Caret Positioning (Simple center alignment for now)
            if (caretRef.current) {
                // Determine if toolbar is above or below (simple check of absolute position)
                // If top is greater than the selection top, it's below.
                const isBelow = top > (rangeRect.top - elemRect.top);
                // Reset classes
                caretRef.current.className = `absolute left-1/2 -translate-x-1/2 w-0 h-0 border-8 border-transparent ${isBelow
                    ? (isDark ? 'border-b-[#1a1a1f] -top-4' : 'border-b-white -top-4') // Point UP (at top)
                    : (isDark ? 'border-t-[#1a1a1f] -bottom-4' : 'border-t-white -bottom-4') // Point DOWN (at bottom)
                    }`;
            }
            // Save Valid Selection
            lastSelectionRef.current = selection.clone();

        } else {
            // Don't hide if interacting with toolbar
            if (popupCharStylesEditorElem.contains(document.activeElement)) {
                return;
            }

            popupCharStylesEditorElem.style.opacity = '0';
            popupCharStylesEditorElem.style.top = '-1000px';
            popupCharStylesEditorElem.style.left = '-1000px';
            setShowIdeaInput(false); // Reset input when selection is lost
        }
    }, [editor, anchorElem]);

    useEffect(() => {
        editor.getEditorState().read(() => {
            updateTextFormatFloatingToolbar();
        });
        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    updateTextFormatFloatingToolbar();
                });
            }),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    updateTextFormatFloatingToolbar();
                    return false;
                },
                COMMAND_PRIORITY_LOW,
            ),
        );
    }, [editor, updateTextFormatFloatingToolbar]);

    // Auto-focus input when shown
    useEffect(() => {
        if (showIdeaInput && inputRef.current) {
            inputRef.current.focus();
        }
    }, [showIdeaInput]);

    const handleSaveIdea = () => {
        if (!ideaNote.trim()) return;

        const id = crypto.randomUUID();

        editor.update(() => {
            let selection = $getSelection();

            // Restore selection if lost (because focus was on input)
            if (!selection && lastSelectionRef.current) {
                selection = lastSelectionRef.current;
                $setSelection(selection);
            }

            if ($isRangeSelection(selection)) {
                const quote = selection.getTextContent();
                const cursor = JSON.stringify(selection); // Keep cursor for fallback/sort

                // Wrap only the selected text in IdeaMarkNode
                if (!selection.isCollapsed()) {
                    // The 4th parameter is a custom node factory function
                    $wrapSelectionInMarkNode(selection, selection.isBackward(), id, $createIdeaMarkNode);
                }

                onAddIdea(id, quote, cursor, ideaNote);
            }
        });

        setIdeaNote('');
        setShowIdeaInput(false);
    };

    return (
        <div
            ref={popupCharStylesEditorRef}
            className={`absolute z-50 flex items-center rounded-lg shadow-xl border transition-opacity duration-200 pointer-events-auto ${isDark ? 'bg-[#1a1a1f] border-white/10' : 'bg-white border-gray-200'
                }`}
            style={{ opacity: 0, top: -10000, left: -10000, padding: '4px' }}
        >
            <div ref={caretRef} />
            {!showIdeaInput ? (
                // Standard Toolbar
                <>
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
                        className={`p-2 rounded hover:opacity-80 ${isBold ? (isDark ? 'bg-white/20 text-white' : 'bg-black/10 text-black') : (isDark ? 'text-neutral-300' : 'text-neutral-600')}`}
                        title={t('toolbar.bold')}
                    >
                        <Bold className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
                        className={`p-2 rounded hover:opacity-80 ${isItalic ? (isDark ? 'bg-white/20 text-white' : 'bg-black/10 text-black') : (isDark ? 'text-neutral-300' : 'text-neutral-600')}`}
                        title={t('toolbar.italic')}
                    >
                        <Italic className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
                        className={`p-2 rounded hover:opacity-80 ${isUnderline ? (isDark ? 'bg-white/20 text-white' : 'bg-black/10 text-black') : (isDark ? 'text-neutral-300' : 'text-neutral-600')}`}
                        title={t('toolbar.underline')}
                    >
                        <Underline className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
                        className={`p-2 rounded hover:opacity-80 ${isStrikethrough ? (isDark ? 'bg-white/20 text-white' : 'bg-black/10 text-black') : (isDark ? 'text-neutral-300' : 'text-neutral-600')}`}
                        title={t('toolbar.strikethrough')}
                    >
                        <Strikethrough className="w-4 h-4" />
                    </button>

                    <div className={`w-[1px] h-4 mx-1 ${isDark ? 'bg-white/20' : 'bg-black/10'}`} />

                    <button
                        onClick={() => setShowIdeaInput(true)}
                        className={`p-2 rounded hover:opacity-80 ${isDark ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-yellow-600 hover:bg-yellow-600/10'}`}
                        title={t('idea.create')}
                    >
                        <Lightbulb className="w-4 h-4 text-inherit" />
                    </button>
                </>
            ) : (
                // Idea Input Mode (Sticky Note Style)
                <div className="flex flex-col gap-2 p-2 w-64">
                    <div className="flex items-center justify-between border-b border-gray-200/10 pb-1 mb-1">
                        <span className={`text-xs font-medium ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                            {t('idea.create')}
                        </span>
                        <div className="flex gap-1">
                            <button
                                onClick={handleSaveIdea}
                                className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-green-500/20 text-green-400' : 'hover:bg-green-500/10 text-green-600'}`}
                            >
                                <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setShowIdeaInput(false)}
                                className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-500/10 text-red-600'}`}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                    <textarea
                        ref={inputRef as any}
                        value={ideaNote}
                        onChange={(e) => setIdeaNote(e.target.value)}
                        placeholder={t('idea.placeholder')}
                        rows={3}
                        className={`text-sm w-full px-2 py-1 rounded outline-none resize-none scrollbar-thin ${isDark
                            ? 'bg-neutral-800 text-white placeholder-neutral-500'
                            : 'bg-yellow-50 text-neutral-800 placeholder-neutral-400'
                            }`}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveIdea();
                            }
                            if (e.key === 'Escape') setShowIdeaInput(false);
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export default function FloatingTextFormatToolbarPlugin({ anchorElem = document.body, onAddIdea }: FloatingTextFormatToolbarPluginProps) {
    const [editor] = useLexicalComposerContext();
    const { preferences } = useEditorPreferences();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);

    const updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));
            setIsStrikethrough(selection.hasFormat('strikethrough'));
        }
    }, [editor]);

    useEffect(() => {
        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    updateToolbar();
                });
            }),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    updateToolbar();
                    return false;
                },
                COMMAND_PRIORITY_LOW,
            ),
        );
    }, [editor, updateToolbar]);

    return createPortal(
        <FloatingToolbar
            editor={editor}
            anchorElem={anchorElem}
            isBold={isBold}
            isItalic={isItalic}
            isUnderline={isUnderline}
            isStrikethrough={isStrikethrough}
            onAddIdea={onAddIdea}
            isDark={preferences.theme === 'dark'}
        />,
        anchorElem,
    );
}
