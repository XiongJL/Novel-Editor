import { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

interface WordCountPluginProps {
    className?: string;
    isDark?: boolean;
    saveState?: 'idle' | 'saving' | 'saved' | 'error';
    saveStatusText?: string;
}

export default function WordCountPlugin({
    className,
    isDark,
    saveState = 'idle',
    saveStatusText = '',
}: WordCountPluginProps) {
    const [editor] = useLexicalComposerContext();
    const [wordCount, setWordCount] = useState(0);
    const { t } = useTranslation();

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        return editor.registerUpdateListener(({ editorState }) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                editorState.read(() => {
                    const root = $getRoot();
                    const text = root.getTextContent();
                    const count = text.replace(/\s+/g, '').length;
                    setWordCount(count);
                });
            }, 1500);
        });
    }, [editor]);

    useEffect(() => {
        editor.getEditorState().read(() => {
            const root = $getRoot();
            const text = root.getTextContent();
            setWordCount(text.replace(/\s+/g, '').length);
        });
    }, [editor]);

    return (
        <>
            <div
                className={clsx(
                    'absolute bottom-4 left-8 z-20 pointer-events-none select-none transition-all duration-300',
                    saveState === 'idle' ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0',
                )}
            >
                <div
                    className={clsx(
                        'px-2 py-1 text-xs font-medium rounded-md',
                        saveState === 'error'
                            ? (isDark ? 'text-red-300 bg-red-500/10' : 'text-red-600 bg-red-50')
                            : (isDark ? 'text-neutral-400 bg-white/5' : 'text-neutral-500 bg-gray-100/80'),
                    )}
                >
                    {saveStatusText}
                </div>
            </div>
            <div
                className={clsx(
                    'absolute bottom-4 right-8 px-2 py-1 text-xs font-medium z-20 pointer-events-none select-none transition-all duration-300',
                    isDark ? 'text-neutral-600' : 'text-neutral-400',
                    className,
                )}
            >
                {wordCount} {t('editor.words', 'words')}
            </div>
        </>
    );
}
