import { useEffect } from 'react';
import type { ActivityTab } from '../../../components/ActivityBar';

type UseEditorKeyboardParams = {
    setActiveTab: (tab: ActivityTab) => void;
    setIsSidePanelOpen: (open: boolean) => void;
    isMatch: (event: KeyboardEvent, shortcutId: any) => boolean;
    onCreateGlobalIdea: () => void;
};

export function useEditorKeyboard({
    setActiveTab,
    setIsSidePanelOpen,
    isMatch,
    onCreateGlobalIdea,
}: UseEditorKeyboardParams) {
    useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                setActiveTab('search');
                setIsSidePanelOpen(true);
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [setActiveTab, setIsSidePanelOpen]);

    useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if (isMatch(event, 'create_idea')) {
                event.preventDefault();
                onCreateGlobalIdea();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [isMatch, onCreateGlobalIdea]);
}
