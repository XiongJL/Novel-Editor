import type {
    ConfirmCreativeAssetsResult,
    CreativeAssetsDraft,
    CreativeAssetsDraftValidationResult,
    PromptPreviewResult,
} from '../ai/types';

export type AutomationWorkspace = 'ai-workbench' | 'chapter-editor';
export type AutomationDraftType = 'creative-assets' | 'chapter-draft' | 'outline-draft';
export type AutomationDraftSource = 'internal-ai' | 'external-cli';
export type AutomationDraftOrigin = 'codex' | 'claude-code' | 'openclaw' | 'desktop-ui' | 'mcp-bridge' | 'unknown';
export type AutomationDraftStatus = 'draft' | 'committed' | 'discarded' | 'failed';

export interface CreativeDraftSelection {
    plotLines: boolean[];
    plotPoints: boolean[];
    characters: boolean[];
    items: boolean[];
    skills: boolean[];
    maps: boolean[];
}

export interface ChapterDraftPayload {
    chapterId: string;
    baseContent: string;
    generatedText: string;
    content: string;
    presentation?: 'silent' | 'toast' | 'modal';
    usedContext: string[];
    consistency: {
        ok: boolean;
        issues: string[];
    };
    warnings?: string[];
}

export interface DraftSessionRecord {
    draftSessionId: string;
    workspace: AutomationWorkspace;
    type: AutomationDraftType;
    source: AutomationDraftSource;
    origin: AutomationDraftOrigin;
    novelId: string;
    chapterId?: string;
    status: AutomationDraftStatus;
    payload: CreativeAssetsDraft | ChapterDraftPayload;
    selection?: CreativeDraftSelection;
    validation?: CreativeAssetsDraftValidationResult | null;
    previewSummary: string;
    version: number;
    createdAt: string;
    updatedAt: string;
}

export interface AutomationInvokeContext {
    source: 'renderer' | 'http';
    origin?: AutomationDraftOrigin;
    requestId?: string;
}

export interface AutomationErrorShape {
    code: string;
    message: string;
    details?: unknown;
}

export interface AutomationEnvelope<T = unknown> {
    ok: boolean;
    code: string;
    message: string;
    data?: T;
}

export interface DraftListFilters {
    novelId?: string;
    workspace?: AutomationWorkspace;
    type?: AutomationDraftType;
    status?: AutomationDraftStatus;
    includeInactive?: boolean;
}

export interface PromptPreviewResponse {
    kind: 'creative_assets' | 'chapter';
    preview: PromptPreviewResult;
}

export interface DraftCommitResponse {
    session: DraftSessionRecord;
    validation?: CreativeAssetsDraftValidationResult;
    confirmResult?: ConfirmCreativeAssetsResult;
    saveResult?: unknown;
}
