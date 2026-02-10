/**
 * MentionsPlugin - Lexical 插件
 * 监听 @ 字符输入，显示角色/物品候选列表，插入 MentionNode
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    COMMAND_PRIORITY_LOW,
    KEY_ARROW_DOWN_COMMAND,
    KEY_ARROW_UP_COMMAND,
    KEY_ENTER_COMMAND,
    KEY_ESCAPE_COMMAND,
    KEY_TAB_COMMAND,
    TextNode,
} from 'lexical';
import { $createMentionNode, MentionType } from '../nodes/MentionNode';
import { MentionableItem } from '../../../types';

interface MentionsPluginProps {
    novelId: string;
}

export default function MentionsPlugin({ novelId }: MentionsPluginProps) {
    const [editor] = useLexicalComposerContext();
    const [queryString, setQueryString] = useState<string | null>(null);
    const [results, setResults] = useState<MentionableItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const allMentionables = useRef<MentionableItem[]>([]);
    const triggerOffset = useRef<number | null>(null);

    // Load mentionables once
    useEffect(() => {
        if (!novelId) return;
        window.db.getMentionables(novelId).then(data => {
            allMentionables.current = data;
        }).catch(console.error);
    }, [novelId]);

    // Filter results based on query
    useEffect(() => {
        if (queryString === null) {
            setResults([]);
            return;
        }
        const q = queryString.toLowerCase();
        const filtered = allMentionables.current.filter(m => m.name.toLowerCase().includes(q));
        setResults(filtered.slice(0, 8));
        setSelectedIndex(0);
    }, [queryString]);

    // Listen for text changes to detect @ trigger
    useEffect(() => {
        const removeListener = editor.registerTextContentListener(() => {
            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                    setQueryString(null);
                    setMenuPosition(null);
                    return;
                }

                const anchor = selection.anchor;
                if (anchor.type !== 'text') {
                    setQueryString(null);
                    setMenuPosition(null);
                    return;
                }

                const node = anchor.getNode();
                if (!$isTextNode(node)) {
                    setQueryString(null);
                    setMenuPosition(null);
                    return;
                }

                const text = node.getTextContent().substring(0, anchor.offset);
                const atIdx = text.lastIndexOf('@');

                if (atIdx === -1) {
                    setQueryString(null);
                    setMenuPosition(null);
                    return;
                }

                // Make sure @ is at start of word (preceded by space or at start)
                if (atIdx > 0 && text[atIdx - 1] !== ' ' && text[atIdx - 1] !== '\n') {
                    setQueryString(null);
                    setMenuPosition(null);
                    return;
                }

                const query = text.substring(atIdx + 1);
                // Don't trigger if there's a space in the query (completed mention)
                if (query.includes(' ')) {
                    setQueryString(null);
                    setMenuPosition(null);
                    return;
                }

                triggerOffset.current = atIdx;
                setQueryString(query);

                // Calculate position
                const domSelection = window.getSelection();
                if (domSelection && domSelection.rangeCount > 0) {
                    const range = domSelection.getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    setMenuPosition({
                        top: rect.bottom + 4,
                        left: rect.left
                    });
                }
            });
        });

        return removeListener;
    }, [editor]);

    // Insert mention
    const insertMention = useCallback((item: MentionableItem) => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const anchor = selection.anchor;
            const node = anchor.getNode();
            if (!$isTextNode(node)) return;

            const text = node.getTextContent();
            const atIdx = triggerOffset.current;
            if (atIdx === null) return;

            // Split the text node: part before @, mention node, then space after
            const beforeAt = text.substring(0, atIdx);
            const afterQuery = text.substring(anchor.offset);

            // Replace the text node content
            node.setTextContent(beforeAt);

            const mentionNode = $createMentionNode(
                item.id,
                item.name,
                item.type as MentionType
            );

            // Insert mention after the current node
            node.insertAfter(mentionNode);

            // Add a space after mention for continued typing
            const spaceNode = new TextNode(' ' + afterQuery);
            mentionNode.insertAfter(spaceNode);

            // Move cursor after the space
            spaceNode.select(1, 1);
        });

        setQueryString(null);
        setMenuPosition(null);
    }, [editor]);

    // Keyboard navigation
    useEffect(() => {
        if (queryString === null) return;

        const unregisterDown = editor.registerCommand(
            KEY_ARROW_DOWN_COMMAND,
            (e) => {
                if (results.length === 0) return false;
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % results.length);
                return true;
            },
            COMMAND_PRIORITY_LOW
        );

        const unregisterUp = editor.registerCommand(
            KEY_ARROW_UP_COMMAND,
            (e) => {
                if (results.length === 0) return false;
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
                return true;
            },
            COMMAND_PRIORITY_LOW
        );

        const unregisterEnter = editor.registerCommand(
            KEY_ENTER_COMMAND,
            (e) => {
                if (results.length === 0) return false;
                e?.preventDefault();
                insertMention(results[selectedIndex]);
                return true;
            },
            COMMAND_PRIORITY_LOW
        );

        const unregisterTab = editor.registerCommand(
            KEY_TAB_COMMAND,
            (e) => {
                if (results.length === 0) return false;
                e.preventDefault();
                insertMention(results[selectedIndex]);
                return true;
            },
            COMMAND_PRIORITY_LOW
        );

        const unregisterEsc = editor.registerCommand(
            KEY_ESCAPE_COMMAND,
            () => {
                setQueryString(null);
                setMenuPosition(null);
                return true;
            },
            COMMAND_PRIORITY_LOW
        );

        return () => {
            unregisterDown();
            unregisterUp();
            unregisterEnter();
            unregisterTab();
            unregisterEsc();
        };
    }, [editor, queryString, results, selectedIndex, insertMention]);

    if (queryString === null || !menuPosition || results.length === 0) return null;

    return createPortal(
        <div
            className="mention-menu"
            style={{
                position: 'fixed',
                top: menuPosition.top,
                left: menuPosition.left,
                zIndex: 9999
            }}
        >
            {results.map((item, i) => (
                <div
                    key={item.id}
                    className={`mention-menu-item ${i === selectedIndex ? 'selected' : ''}`}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(item);
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                >
                    <span className="mention-menu-icon">
                        {item.type === 'character' ? '👤' : '📦'}
                    </span>
                    <span className="mention-menu-name">{item.name}</span>
                    {item.role && (
                        <span className="mention-menu-role">{item.role}</span>
                    )}
                </div>
            ))}
        </div>,
        document.body
    );
}
