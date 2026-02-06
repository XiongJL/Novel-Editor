import { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

interface WordCountPluginProps {
    className?: string;
    isDark?: boolean;
}

export default function WordCountPlugin({ className, isDark }: WordCountPluginProps) {
    const [editor] = useLexicalComposerContext();
    const [wordCount, setWordCount] = useState(0);
    const { t } = useTranslation();

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        return editor.registerUpdateListener(({ editorState }) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                editorState.read(() => {
                    const root = $getRoot();
                    const text = root.getTextContent();
                    // Simple character count for CJK, stripping whitespace
                    const count = text.replace(/\s+/g, '').length;
                    setWordCount(count);
                });
            }, 1500);
        });
    }, [editor]);

    // Initial count
    useEffect(() => {
        editor.getEditorState().read(() => {
            const root = $getRoot();
            const text = root.getTextContent();
            setWordCount(text.replace(/\s+/g, '').length);
        });
    }, [editor]);

    return (
        <div className={clsx(
            "absolute bottom-4 right-8 px-2 py-1 text-xs font-medium z-20 pointer-events-none select-none transition-all duration-300",
            isDark ? "text-neutral-600" : "text-neutral-400",
            className
        )}>
            {wordCount} {t('editor.words', '字')}
        </div>
    );
}
