import { useMemo } from 'react';
import { clsx } from 'clsx';
import { MentionType } from '../LexicalEditor/nodes/MentionNode';

interface PlotPointDescriptionRendererProps {
    content: string; // JSON string from Lexical
    isDark: boolean;
    onClickMention?: (id: string, type: MentionType) => void;
    className?: string;
}

/**
 * 渲染情节要点的详细描述
 * 支持解析 Lexical 生成的 JSON 格式，并以只读方式渲染 Mention 等特殊节点
 */
export function PlotPointDescriptionRenderer({
    content,
    isDark,
    onClickMention,
    className
}: PlotPointDescriptionRendererProps) {
    const renderedContent = useMemo(() => {
        if (!content) return null;

        // If it's not JSON, render as plain text
        if (!content.trim().startsWith('{')) {
            return <p className="whitespace-pre-wrap">{content}</p>;
        }

        try {
            const data = JSON.parse(content);
            const root = data.root;

            if (!root || !root.children) return null;

            return root.children.map((block: any, blockIdx: number) => {
                if (block.type === 'paragraph') {
                    return (
                        <p key={blockIdx} className="mb-1 last:mb-0 min-h-[1em]">
                            {block.children.map((child: any, childIdx: number) => {
                                if (child.type === 'text') {
                                    return (
                                        <span key={childIdx} className={clsx(
                                            child.format & 1 && "font-bold",
                                            child.format & 2 && "italic",
                                            child.format & 4 && "underline"
                                        )}>
                                            {child.text}
                                        </span>
                                    );
                                }
                                if (child.type === 'mention') {
                                    return (
                                        <span
                                            key={childIdx}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onClickMention?.(child.mentionId, child.mentionType as MentionType);
                                            }}
                                            className={clsx(
                                                "mention-node-inline px-1 py-0.5 rounded transition-all cursor-pointer",
                                                child.mentionType === 'character'
                                                    ? (isDark ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-indigo-50 text-indigo-600 border border-indigo-200")
                                                    : (isDark ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-amber-50 text-amber-600 border border-amber-200"),
                                                "hover:opacity-80 active:scale-95 mx-0.5 align-baseline text-[10px] font-medium"
                                            )}
                                        >
                                            {child.mentionType === 'character' ? '👤 ' : '📦 '}
                                            {child.mentionName}
                                        </span>
                                    );
                                }
                                return null;
                            })}
                        </p>
                    );
                }
                return null;
            });
        } catch (e) {
            console.warn('Failed to parse description for rendering:', e);
            return <p className="whitespace-pre-wrap">{content}</p>;
        }
    }, [content, isDark, onClickMention]);

    return (
        <div className={clsx("text-xs leading-relaxed", className)}>
            {renderedContent}
        </div>
    );
}
