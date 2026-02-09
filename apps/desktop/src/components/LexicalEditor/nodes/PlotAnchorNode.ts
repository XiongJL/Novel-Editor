/**
 * PlotAnchorNode - Story Structure Anchor Node
 * 
 * Extends @lexical/mark to support Plot Point Anchors.
 * Attributes:
 * - data-plot-anchor-id: The ID of the PlotPointAnchor in the database
 */
import {
    MarkNode,
    SerializedMarkNode,
    $unwrapMarkNode
} from '@lexical/mark';
import {
    EditorConfig,
    LexicalNode,
    NodeKey
} from 'lexical';

export type SerializedPlotAnchorNode = SerializedMarkNode;

export class PlotAnchorNode extends MarkNode {
    static getType(): string {
        return 'plot-anchor';
    }

    static clone(node: PlotAnchorNode): PlotAnchorNode {
        return new PlotAnchorNode(Array.from(node.__ids), node.__key);
    }

    constructor(ids: string[], key?: NodeKey) {
        super(ids, key);
    }

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config);

        // Add standard mark class
        const className = config.theme.mark;
        if (className) {
            element.className = className;
        }

        // Add custom class for styling differentiation if needed
        element.classList.add('plot-anchor');

        // Add data attribute
        const ids = this.getIDs();
        if (ids.length > 0) {
            element.setAttribute('data-plot-anchor-id', ids[0]);
        }

        return element;
    }

    updateDOM(_prevNode: MarkNode, dom: HTMLElement): boolean {
        const ids = this.getIDs();
        if (ids.length > 0) {
            dom.setAttribute('data-plot-anchor-id', ids[0]);
        } else {
            dom.removeAttribute('data-plot-anchor-id');
        }
        return false;
    }

    static importJSON(serializedNode: SerializedPlotAnchorNode): PlotAnchorNode {
        return $createPlotAnchorNode(serializedNode.ids);
    }

    exportJSON(): SerializedPlotAnchorNode {
        return {
            ...super.exportJSON(),
            type: 'plot-anchor',
        };
    }

    unwrap(): void {
        $unwrapMarkNode(this);
    }
}

export function $createPlotAnchorNode(ids: string[]): PlotAnchorNode {
    return new PlotAnchorNode(ids);
}

export function $isPlotAnchorNode(node: LexicalNode | null | undefined): node is PlotAnchorNode {
    return node instanceof PlotAnchorNode;
}
