/**
 * IdeaMarkNode - 自定义 MarkNode 扩展
 * 
 * 扩展 @lexical/mark 的 MarkNode，添加 data-idea-id 属性以便：
 * 1. 点击检测 (IdeaInteractionPlugin)
 * 2. 跳转定位 (Editor.tsx executeJump)
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

export type SerializedIdeaMarkNode = SerializedMarkNode;

export class IdeaMarkNode extends MarkNode {
    static getType(): string {
        return 'idea-mark';
    }

    static clone(node: IdeaMarkNode): IdeaMarkNode {
        return new IdeaMarkNode(Array.from(node.__ids), node.__key);
    }

    constructor(ids: string[], key?: NodeKey) {
        super(ids, key);
    }

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config);

        // Add data-idea-id attribute for the first ID (primary idea)
        const ids = this.getIDs();
        if (ids.length > 0) {
            element.setAttribute('data-idea-id', ids[0]);
        }

        // Apply theme class if exists
        const markClass = config.theme.mark;
        if (markClass) {
            element.className = markClass;
        }

        return element;
    }

    updateDOM(_prevNode: MarkNode, dom: HTMLElement): boolean {
        // MarkNode's updateDOM returns false by default
        // We just need to update our custom attribute
        const ids = this.getIDs();
        if (ids.length > 0) {
            dom.setAttribute('data-idea-id', ids[0]);
        } else {
            dom.removeAttribute('data-idea-id');
        }

        return false;
    }

    static importJSON(serializedNode: SerializedIdeaMarkNode): IdeaMarkNode {
        const node = $createIdeaMarkNode(serializedNode.ids);
        return node;
    }

    exportJSON(): SerializedIdeaMarkNode {
        return {
            ...super.exportJSON(),
            type: 'idea-mark',
        };
    }

    // Helper method to unwrap this node
    unwrap(): void {
        $unwrapMarkNode(this);
    }
}

export function $createIdeaMarkNode(ids: string[]): IdeaMarkNode {
    return new IdeaMarkNode(ids);
}

export function $isIdeaMarkNode(node: LexicalNode | null | undefined): node is IdeaMarkNode {
    return node instanceof IdeaMarkNode;
}
