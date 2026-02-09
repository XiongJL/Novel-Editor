/**
 * PlotContextMenuPlugin
 * 
 * Beacons 'contextmenu' events to the parent component.
 * Allows right-click interaction for adding Plot Anchors or managing existing ones.
 */
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $getSelection, $isRangeSelection, $getNearestNodeFromDOMNode } from 'lexical';
import { $isPlotAnchorNode } from '../nodes/PlotAnchorNode';

export interface PlotContextMenuData {
    x: number;
    y: number;
    anchorId?: string;
    hasSelection: boolean;
    text?: string;
    nodeKey?: string;
    offset?: number;
    length?: number;
}

interface PlotContextMenuPluginProps {
    onOpenMenu: (data: PlotContextMenuData) => void;
}

export default function PlotContextMenuPlugin({ onOpenMenu }: PlotContextMenuPluginProps) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        const handleContextMenu = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.isConnected) return;

            // Only intervene if inside the editor
            const rootElement = editor.getRootElement();
            if (!rootElement || !rootElement.contains(target)) return;

            // Check if we clicked on an existing PlotAnchor
            let anchorId: string | undefined;

            // 1. Check DOM attribute
            const anchorElement = target.closest('[data-plot-anchor-id]');
            if (anchorElement) {
                anchorId = anchorElement.getAttribute('data-plot-anchor-id') || undefined;
            }

            // 2. Check Lexical Node (fallback)
            if (!anchorId) {
                editor.getEditorState().read(() => {
                    const node = $getNearestNodeFromDOMNode(target);
                    if ($isPlotAnchorNode(node)) {
                        const ids = node.getIDs();
                        if (ids.length > 0) anchorId = ids[0];
                    } else if (node && $isPlotAnchorNode(node.getParent())) {
                        const parent = node.getParent();
                        if (parent && $isPlotAnchorNode(parent)) {
                            const ids = parent.getIDs();
                            if (ids.length > 0) anchorId = ids[0];
                        }
                    }
                });
            }

            let hasSelection = false;
            let selectedText = '';
            let nodeKey: string | undefined;
            let offset: number | undefined;
            let length: number | undefined;

            editor.getEditorState().read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection) && !selection.isCollapsed()) {
                    hasSelection = true;
                    selectedText = selection.getTextContent();
                    nodeKey = selection.anchor.key;
                    offset = selection.anchor.offset;
                    length = Math.abs(selection.focus.offset - selection.anchor.offset);
                }
            });

            // If we have an anchor OR a selection, suppress default and show our menu
            if (anchorId || hasSelection) {
                event.preventDefault();
                onOpenMenu({
                    x: event.clientX,
                    y: event.clientY,
                    anchorId,
                    hasSelection,
                    text: selectedText,
                    nodeKey,
                    offset,
                    length
                });
            }
        };

        // Attach to the root element's parent or document
        // Ideally editor.RegisterRootListener? Or just attach to document since we check contains
        document.addEventListener('contextmenu', handleContextMenu);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [editor, onOpenMenu]);

    return null;
}
