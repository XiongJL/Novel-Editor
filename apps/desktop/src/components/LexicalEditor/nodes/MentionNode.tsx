/**
 * MentionNode - 自定义 Lexical DecoratorNode
 * 用于在编辑器中渲染角色/物品的行内胶囊标签
 */
import {
    DecoratorNode,
    DOMExportOutput,
    LexicalNode,
    NodeKey,
    SerializedLexicalNode,
    Spread,
} from 'lexical';
import { ReactNode } from 'react';

export type MentionType = 'character' | 'item';

export type SerializedMentionNode = Spread<
    {
        mentionId: string;
        mentionName: string;
        mentionType: MentionType;
    },
    SerializedLexicalNode
>;

export class MentionNode extends DecoratorNode<ReactNode> {
    __mentionId: string;
    __mentionName: string;
    __mentionType: MentionType;

    static getType(): string {
        return 'mention';
    }

    static clone(node: MentionNode): MentionNode {
        return new MentionNode(
            node.__mentionId,
            node.__mentionName,
            node.__mentionType,
            node.__key
        );
    }

    constructor(
        mentionId: string,
        mentionName: string,
        mentionType: MentionType,
        key?: NodeKey
    ) {
        super(key);
        this.__mentionId = mentionId;
        this.__mentionName = mentionName;
        this.__mentionType = mentionType;
    }

    createDOM(): HTMLElement {
        const span = document.createElement('span');
        span.className = `mention-capsule mention-${this.__mentionType}`;
        span.dataset.mentionId = this.__mentionId;
        span.dataset.mentionType = this.__mentionType;
        return span;
    }

    updateDOM(): boolean {
        return false;
    }

    exportDOM(): DOMExportOutput {
        const element = document.createElement('span');
        element.className = `mention-capsule mention-${this.__mentionType}`;
        element.dataset.mentionId = this.__mentionId;
        element.dataset.mentionType = this.__mentionType;
        element.textContent = `@${this.__mentionName}`;
        return { element };
    }

    static importJSON(serializedNode: SerializedMentionNode): MentionNode {
        return $createMentionNode(
            serializedNode.mentionId,
            serializedNode.mentionName,
            serializedNode.mentionType
        );
    }

    exportJSON(): SerializedMentionNode {
        return {
            type: 'mention',
            version: 1,
            mentionId: this.__mentionId,
            mentionName: this.__mentionName,
            mentionType: this.__mentionType,
        };
    }

    getTextContent(): string {
        return `@${this.__mentionName}`;
    }

    getMentionId(): string {
        return this.__mentionId;
    }

    getMentionName(): string {
        return this.__mentionName;
    }

    getMentionType(): MentionType {
        return this.__mentionType;
    }

    isInline(): boolean {
        return true;
    }

    decorate(): ReactNode {
        const isChar = this.__mentionType === 'character';
        return (
            <span
                className={`mention-capsule-inner ${isChar ? 'mention-character' : 'mention-item'}`}
                title={`${isChar ? '角色' : '物品'}: ${this.__mentionName}`}
            >
                <span className="mention-icon">{isChar ? '👤' : '📦'}</span>
                <span className="mention-text">{this.__mentionName}</span>
            </span>
        );
    }
}

export function $createMentionNode(
    mentionId: string,
    mentionName: string,
    mentionType: MentionType
): MentionNode {
    return new MentionNode(mentionId, mentionName, mentionType);
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
    return node instanceof MentionNode;
}
