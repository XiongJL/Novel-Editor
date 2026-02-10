/**
 * MentionInteractionPlugin
 * 处理对编辑器中 MentionNode (胶囊) 的点击事件
 * 显示 CharacterPreviewCard
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useState } from 'react';
import {
    CLICK_COMMAND,
    COMMAND_PRIORITY_LOW,
} from 'lexical';

import CharacterPreviewCard from '../../WorldWorkbench/CharacterPreviewCard';
import { useEditorPreferences } from '../../../hooks/useEditorPreferences';

export default function MentionInteractionPlugin() {
    const [editor] = useLexicalComposerContext();
    const [activeMention, setActiveMention] = useState<{
        id: string;
        type: 'character' | 'item';
        position: { top: number; left: number };
    } | null>(null);
    const { preferences } = useEditorPreferences();

    useEffect(() => {
        const removeClickListener = editor.registerCommand(
            CLICK_COMMAND,
            (event: MouseEvent) => {
                const target = event.target as HTMLElement;
                // Find closest mention-capsule-inner or mention-capsule
                const capsule = target.closest('.mention-capsule-inner') || target.closest('.mention-capsule');

                if (!capsule) return false;

                // To find the node, we might need to get the key from the DOM
                // But specifically for MentionNode, we can try to find the React fiber or just use the DOM dataset if we added it?
                // DecoratorNode renders a component. The span we render in decorate() is inside the editor text.

                // Better approach with Lexical:
                editor.update(() => {
                    // We can't easily map DOM to Node Key for DecoratorNode inner content if it's not the top level element
                    // But we likely don't need the Node Key if we just want the ID which is stored in the node's payload
                    // Wait, our MentionNode.decorate uses React, so props are available there.
                    // But the click handler is here in the plugin.

                    // Actually, since MentionNode renders a React component, we can handle onClick INSIDE MentionNode's decorate method?
                    // No, usually plugins are better for global behavior.

                    // Let's rely on the DOM structure we built.
                    // Note: MentionNode.decorate returns a span.
                    // We can check if the click target is within a mention node's DOM.
                    // But getting the Mention ID from DOM is easier if we put it there.
                    // In MentionNode.ts, separate createDOM (for the wrapper) and decorate (for inner content).
                    // The decorate() content is React.
                    // createDOM() creates a span with class 'mention-capsule'.
                    // decorate() creates a span with 'mention-capsule-inner'.

                    // Let's see if we can get the node key from the event.
                    // Lexical's getNearestNodeFromDOMNode might work.
                });

                // We can't use editor methods synchronously inside the event handler easily to get the node payload
                // UNLESS we check the nearest Lexical Node.

                // Let's basically assume we can get the ID.
                // In MentionNode.ts, I didn't put data-id on the inner span, but I put it on the createDOM span.
                // But React renders inside that.

                // Let's update MentionNode to include the ID in the inner span's dataset or similar?
                // Or just use the fact that I can render the PreviewCard FROM the MentionNode itself?
                // Rendering a Portal from each MentionNode is expensive? No, only when clicked?
                // But managing state (open/close) inside each node might be tricky if we want only one open.

                // Plugin approach:
                // We need to identify which mention was clicked.

                // Let's look at the nearest DOM element that has the key.
                // The DecoratorNode's root element (created by createDOM) usually wraps the React content.
                // In MentionNode.ts:
                // createDOM() returns span.mention-capsule-[type] with dataset.mentionId

                const wrapper = target.closest('span[data-mention-id]');
                if (wrapper && wrapper instanceof HTMLElement) {
                    const mentionId = wrapper.dataset.mentionId;
                    const mentionType = wrapper.dataset.mentionType as 'character' | 'item';

                    if (mentionId && mentionType) {
                        const rect = wrapper.getBoundingClientRect();
                        setActiveMention({
                            id: mentionId,
                            type: mentionType,
                            position: {
                                top: rect.bottom + 5,
                                left: rect.left
                            }
                        });
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                }

                // Fallback: check if we clicked the inner span interaction
                // The inner span doesn't have the ID in my previous code, but the wrapper (createDOM) does.
                // React portal renders INTO the wrapper? No, DecoratorNode renders React text.
                // Lexical renders the output of decorate() into the element returned by createDOM()?
                // No, DecoratorNode works by mounting React component at the node's position.
                // The element from createDOM is the container.

                return false;
            },
            COMMAND_PRIORITY_LOW
        );

        return removeClickListener;
    }, [editor]);

    if (!activeMention) return null;

    return (
        <CharacterPreviewCard
            id={activeMention.id}
            type={activeMention.type}
            position={activeMention.position}
            onClose={() => setActiveMention(null)}
            theme={preferences.theme}
            onEdit={() => {
                // TODO: Implement jump to edit
                // We could dispatch a custom event or use a command
                // For now just close
                setActiveMention(null);
                // Maybe open sidebar?
                // dispatch event 'open-character-editor'
            }}
        />
    );
}
