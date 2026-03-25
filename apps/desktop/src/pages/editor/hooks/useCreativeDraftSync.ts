import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreativeAssetsDraft, DraftSelection, DraftSessionRecord } from '../../../components/AIWorkbench/types';
import { EMPTY_CREATIVE_DRAFT, EMPTY_DRAFT_SELECTION } from '../constants';

type UseCreativeDraftSyncParams = {
    novelId: string;
};

export function useCreativeDraftSync({ novelId }: UseCreativeDraftSyncParams) {
    const [creativeDraft, setCreativeDraft] = useState<CreativeAssetsDraft>({ ...EMPTY_CREATIVE_DRAFT });
    const [creativeSelection, setCreativeSelection] = useState<DraftSelection>({ ...EMPTY_DRAFT_SELECTION });
    const [creativeDraftSession, setCreativeDraftSession] = useState<DraftSessionRecord | null>(null);
    const [isDraftDockOpen, setIsDraftDockOpen] = useState(false);

    const creativeDraftSessionRef = useRef<DraftSessionRecord | null>(null);
    const creativeDraftUpdateQueueRef = useRef(Promise.resolve());

    const applyCreativeDraftSession = useCallback((session: DraftSessionRecord | null) => {
        creativeDraftSessionRef.current = session;
        setCreativeDraftSession(session);
        if (!session || session.status !== 'draft') {
            setCreativeDraft({ ...EMPTY_CREATIVE_DRAFT });
            setCreativeSelection({ ...EMPTY_DRAFT_SELECTION });
            return;
        }
        const payload = session.payload as CreativeAssetsDraft;
        setCreativeDraft({
            plotLines: Array.isArray(payload.plotLines) ? payload.plotLines : [],
            plotPoints: Array.isArray(payload.plotPoints) ? payload.plotPoints : [],
            characters: Array.isArray(payload.characters) ? payload.characters : [],
            items: Array.isArray(payload.items) ? payload.items : [],
            skills: Array.isArray(payload.skills) ? payload.skills : [],
            maps: Array.isArray(payload.maps) ? payload.maps : [],
        });
        setCreativeSelection(session.selection ?? { ...EMPTY_DRAFT_SELECTION });
    }, []);

    const refreshCreativeDraftSession = useCallback(async () => {
        try {
            const session = await window.automation.invoke('draft.get_active', {
                novelId,
                workspace: 'ai-workbench',
            }, 'desktop-ui') as DraftSessionRecord | null;
            applyCreativeDraftSession(session);
        } catch (error) {
            console.error('[Editor] failed to refresh creative draft session:', error);
        }
    }, [applyCreativeDraftSession, novelId]);

    useEffect(() => {
        setCreativeDraft({ ...EMPTY_CREATIVE_DRAFT });
        setCreativeSelection({ ...EMPTY_DRAFT_SELECTION });
        setCreativeDraftSession(null);
        setIsDraftDockOpen(false);
        creativeDraftSessionRef.current = null;
    }, [novelId]);

    useEffect(() => {
        void refreshCreativeDraftSession();
        const timer = window.setInterval(() => {
            void refreshCreativeDraftSession();
        }, 2500);
        return () => window.clearInterval(timer);
    }, [refreshCreativeDraftSession]);

    const queueCreativeDraftSync = useCallback((nextDraft: CreativeAssetsDraft, nextSelection: DraftSelection) => {
        const currentSession = creativeDraftSessionRef.current;
        setCreativeDraft(nextDraft);
        setCreativeSelection(nextSelection);
        if (!currentSession?.draftSessionId || currentSession.status !== 'draft') {
            return;
        }
        const optimisticSession: DraftSessionRecord = {
            ...currentSession,
            payload: nextDraft,
            selection: nextSelection,
        };
        creativeDraftSessionRef.current = optimisticSession;
        setCreativeDraftSession(optimisticSession);
        creativeDraftUpdateQueueRef.current = creativeDraftUpdateQueueRef.current
            .then(async () => {
                const sessionForUpdate = creativeDraftSessionRef.current;
                if (!sessionForUpdate?.draftSessionId || sessionForUpdate.status !== 'draft') return;
                const updated = await window.automation.invoke('draft.update', {
                    draftSessionId: sessionForUpdate.draftSessionId,
                    version: sessionForUpdate.version,
                    payload: nextDraft,
                    selection: nextSelection,
                }, 'desktop-ui') as DraftSessionRecord;
                applyCreativeDraftSession(updated);
            })
            .catch((error) => {
                console.error('[Editor] failed to sync creative draft session:', error);
                void refreshCreativeDraftSession();
            });
    }, [applyCreativeDraftSession, refreshCreativeDraftSession]);

    const handleCreativeDraftChange = useCallback((next: CreativeAssetsDraft) => {
        queueCreativeDraftSync(next, creativeSelection);
    }, [creativeSelection, queueCreativeDraftSync]);

    const handleCreativeSelectionChange = useCallback((next: DraftSelection) => {
        queueCreativeDraftSync(creativeDraft, next);
    }, [creativeDraft, queueCreativeDraftSync]);

    const handleCreativeDraftAndSelectionChange = useCallback((nextDraft: CreativeAssetsDraft, nextSelection: DraftSelection) => {
        queueCreativeDraftSync(nextDraft, nextSelection);
    }, [queueCreativeDraftSync]);

    const handleCreativeDraftSessionChange = useCallback((next: DraftSessionRecord | null) => {
        applyCreativeDraftSession(next);
    }, [applyCreativeDraftSession]);

    return {
        creativeDraft,
        creativeSelection,
        creativeDraftSession,
        isDraftDockOpen,
        setIsDraftDockOpen,
        setCreativeDraft,
        setCreativeSelection,
        setCreativeDraftSession,
        refreshCreativeDraftSession,
        handleCreativeDraftChange,
        handleCreativeSelectionChange,
        handleCreativeDraftAndSelectionChange,
        handleCreativeDraftSessionChange,
    };
}
