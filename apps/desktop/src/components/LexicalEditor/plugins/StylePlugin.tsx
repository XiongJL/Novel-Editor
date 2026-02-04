import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useLayoutEffect, useRef } from 'react';

interface StylePluginProps {
    fontSize: number;
    lineHeight: number;
    fontFamily: 'serif' | 'sans' | 'kaiti';
    indentMode: 'enabled' | 'disabled';
}

export default function StylePlugin({ fontSize, lineHeight, fontFamily, indentMode }: StylePluginProps) {
    const [editor] = useLexicalComposerContext();
    const rafRef = useRef<number | null>(null);

    // Use useLayoutEffect for synchronous DOM updates
    useLayoutEffect(() => {
        // Cancel any pending animation frame
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }

        // Schedule style application
        rafRef.current = requestAnimationFrame(() => {
            const root = editor.getRootElement();
            if (!root) return;

            // Font size
            root.style.fontSize = `${fontSize}px`;

            // Line height
            root.style.lineHeight = `${lineHeight}`;

            // Font family
            let fontVal = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
            if (fontFamily === 'sans') fontVal = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            if (fontFamily === 'kaiti') fontVal = 'Kaiti, "KaiTi", "楷体", serif';
            root.style.fontFamily = fontVal;

            // Indentation - 2 character first-line indent for each paragraph
            if (indentMode === 'enabled') {
                root.style.textIndent = '2em';
            } else {
                root.style.textIndent = '0';
            }
        });

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [editor, fontSize, lineHeight, fontFamily, indentMode]);

    // Also apply styles when editor root element changes (e.g., on mount)
    useEffect(() => {
        const unregister = editor.registerRootListener((rootElement) => {
            if (rootElement) {
                rootElement.style.fontSize = `${fontSize}px`;
                rootElement.style.lineHeight = `${lineHeight}`;

                let fontVal = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
                if (fontFamily === 'sans') fontVal = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
                if (fontFamily === 'kaiti') fontVal = 'Kaiti, "KaiTi", "楷体", serif';
                rootElement.style.fontFamily = fontVal;

                if (indentMode === 'enabled') {
                    rootElement.style.textIndent = '2em';
                } else {
                    rootElement.style.textIndent = '0';
                }
            }
        });

        return unregister;
    }, [editor, fontSize, lineHeight, fontFamily, indentMode]);

    return null;
}
