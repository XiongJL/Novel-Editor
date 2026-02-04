import { CLICK_COMMAND, COMMAND_PRIORITY_LOW, $getNearestNodeFromDOMNode } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $isMarkNode } from '@lexical/mark';
import { $isIdeaMarkNode } from '../nodes/IdeaMarkNode';

interface IdeaInteractionPluginProps {
    onIdeaClick?: (ideaId: string) => void;
}

export default function IdeaInteractionPlugin({ onIdeaClick }: IdeaInteractionPluginProps) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerCommand(
            CLICK_COMMAND,
            (event: MouseEvent) => {
                const target = event.target as HTMLElement;
                if (!target.isConnected) return false;

                // Priority 1: Check data-idea-id attribute
                const ideaElement = target.closest('[data-idea-id]');
                if (ideaElement) {
                    const id = ideaElement.getAttribute('data-idea-id');
                    if (id && onIdeaClick) {
                        onIdeaClick(id);
                        return true; // Stop propagation if handled
                    }
                }

                // Priority 2: Check Lexical node
                // Note: Inside a command, we are already in an update/read context usually?
                // CLICK_COMMAND handler usually runs in a read context.
                try {
                    const node = $getNearestNodeFromDOMNode(target);
                    if (node) {
                        if ($isIdeaMarkNode(node) || $isMarkNode(node)) {
                            const ids = node.getIDs();
                            if (ids.length > 0 && onIdeaClick) {
                                onIdeaClick(ids[0]);
                                return true;
                            }
                        }
                        const parent = node.getParent();
                        if ($isIdeaMarkNode(parent) || $isMarkNode(parent)) {
                            const ids = parent.getIDs();
                            if (ids.length > 0 && onIdeaClick) {
                                onIdeaClick(ids[0]);
                                return true;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('IdeaInteractionPlugin click error:', e);
                }

                return false;
            },
            COMMAND_PRIORITY_LOW
        );
    }, [editor, onIdeaClick]);

    return null;
}
