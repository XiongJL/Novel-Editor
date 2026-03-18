import type { AiActionExecutePayload, CreativeAssetsDraft, CreativeAssetsDraftValidationResult, CreativeAssetsGeneratePayload, PromptPreviewResult } from '../ai/types';
import { AiService } from '../ai/AiService';
import { devLog, devLogError, redactForLog } from '../debug/devLogger';
import { DraftSessionStore } from './DraftSessionStore';
import type {
    AutomationInvokeContext,
    ChapterDraftPayload,
    CreativeDraftSelection,
    DraftCommitResponse,
    DraftListFilters,
    DraftSessionRecord,
    PromptPreviewResponse,
} from './types';

const EMPTY_CREATIVE_DRAFT: CreativeAssetsDraft = {
    plotLines: [],
    plotPoints: [],
    characters: [],
    items: [],
    skills: [],
    maps: [],
};

const AUTOMATION_TIMEOUT_MS: Record<string, number> = {
    'novel.list': 15000,
    'volume.list': 15000,
    'chapter.list': 15000,
    'chapter.get': 15000,
    'plotline.list': 15000,
    'character.list': 15000,
    'item.list': 15000,
    'worldsetting.list': 15000,
    'worldsetting.create': 30000,
    'worldsetting.update': 30000,
    'map.list': 15000,
    'search.query': 15000,
    'draft.list': 15000,
    'draft.get': 15000,
    'draft.get_active': 15000,
    'draft.update': 15000,
    'draft.commit': 30000,
    'draft.discard': 15000,
    'outline.write': 30000,
    'character.create_batch': 30000,
    'story_patch.apply': 30000,
    'chapter.create': 30000,
    'chapter.save': 30000,
    'prompt.preview': 30000,
    'creative_assets.validate_draft': 30000,
    'creative_assets.generate_draft': 90000,
    'outline.generate_draft': 90000,
    'chapter.generate_draft': 90000,
};
const DEFAULT_AUTOMATION_TIMEOUT_MS = 30000;

type NormalizedPromptPreviewKind = 'creative_assets' | 'chapter';

function createSelectionFromDraft(draft: CreativeAssetsDraft): CreativeDraftSelection {
    return {
        plotLines: (draft.plotLines ?? []).map(() => true),
        plotPoints: (draft.plotPoints ?? []).map(() => true),
        characters: (draft.characters ?? []).map(() => true),
        items: (draft.items ?? []).map(() => true),
        skills: (draft.skills ?? []).map(() => true),
        maps: (draft.maps ?? []).map(() => true),
    };
}

function normalizeCreativeDraft(input: unknown): CreativeAssetsDraft {
    if (!input || typeof input !== 'object') return { ...EMPTY_CREATIVE_DRAFT };
    const draft = input as CreativeAssetsDraft;
    return {
        plotLines: Array.isArray(draft.plotLines) ? draft.plotLines : [],
        plotPoints: Array.isArray(draft.plotPoints) ? draft.plotPoints : [],
        characters: Array.isArray(draft.characters) ? draft.characters : [],
        items: Array.isArray(draft.items) ? draft.items : [],
        skills: Array.isArray(draft.skills) ? draft.skills : [],
        maps: Array.isArray(draft.maps) ? draft.maps : [],
    };
}

function summarizeCreativeDraft(draft: CreativeAssetsDraft): string {
    const parts = [
        `主线 ${(draft.plotLines?.length ?? 0)}`,
        `要点 ${(draft.plotPoints?.length ?? 0)}`,
        `角色 ${(draft.characters?.length ?? 0)}`,
        `物品 ${(draft.items?.length ?? 0)}`,
        `技能 ${(draft.skills?.length ?? 0)}`,
        `地图 ${(draft.maps?.length ?? 0)}`,
    ];
    return parts.join(' / ');
}

function sanitizeGeneratedDraft(draft: CreativeAssetsDraft): CreativeAssetsDraft {
    const keepNonEmpty = <T extends Record<string, any>>(items: T[] | undefined, requiredKey: keyof T): T[] => {
        const list = Array.isArray(items) ? items : [];
        return list.filter((item) => typeof item === 'object' && item && String(item[requiredKey] || '').trim());
    };
    return {
        plotLines: keepNonEmpty(draft.plotLines, 'name'),
        plotPoints: keepNonEmpty(draft.plotPoints, 'title'),
        characters: keepNonEmpty(draft.characters, 'name'),
        items: keepNonEmpty(draft.items, 'name'),
        skills: keepNonEmpty(draft.skills, 'name'),
        maps: keepNonEmpty(draft.maps, 'name'),
    };
}

function pickSelectedCreativeDraft(draft: CreativeAssetsDraft, selection?: CreativeDraftSelection): CreativeAssetsDraft {
    if (!selection) return normalizeCreativeDraft(draft);
    return {
        plotLines: (draft.plotLines ?? []).filter((_, index) => selection.plotLines[index]),
        plotPoints: (draft.plotPoints ?? []).filter((_, index) => selection.plotPoints[index]),
        characters: (draft.characters ?? []).filter((_, index) => selection.characters[index]),
        items: (draft.items ?? []).filter((_, index) => selection.items[index]),
        skills: (draft.skills ?? []).filter((_, index) => selection.skills[index]),
        maps: (draft.maps ?? []).filter((_, index) => selection.maps[index]),
    };
}

function buildOutlineDraft(input: { plotLines?: unknown; plotPoints?: unknown }): CreativeAssetsDraft {
    return normalizeCreativeDraft({
        plotLines: input.plotLines,
        plotPoints: input.plotPoints,
    });
}

function buildCharacterBatchDraft(input: { characters?: unknown; items?: unknown; skills?: unknown }): CreativeAssetsDraft {
    return normalizeCreativeDraft({
        characters: input.characters,
        items: input.items,
        skills: input.skills,
    });
}

function createAutomationError(code: string, message: string, details?: unknown): Error & { code: string; details?: unknown } {
    return Object.assign(new Error(message), { code, details });
}

function assertRequiredString(value: unknown, field: string): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
        throw createAutomationError('INVALID_INPUT', `${field} is required`);
    }
    return text;
}

function assertRequiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw createAutomationError('INVALID_INPUT', `${field} must be a finite number`);
    }
    return value;
}

function resolveAutomationTimeout(method: string): number {
    return AUTOMATION_TIMEOUT_MS[method] ?? DEFAULT_AUTOMATION_TIMEOUT_MS;
}

function normalizePromptPreviewKind(kind: unknown): NormalizedPromptPreviewKind {
    const normalized = String(kind || '').trim().toLowerCase();
    if (['creative_assets', 'creative-assets', 'outline-generate', 'outline_generate', 'outline'].includes(normalized)) {
        return 'creative_assets';
    }
    if (['chapter', 'chapter-generate', 'chapter_generate', 'continue-writing', 'continue_writing'].includes(normalized)) {
        return 'chapter';
    }
    throw createAutomationError('INVALID_INPUT', `Unsupported prompt preview kind: ${String(kind || '')}`);
}

export class AutomationService {
    private readonly aiService: AiService;
    private readonly draftStore: DraftSessionStore;

    constructor(aiService: AiService, getUserDataPath: () => string) {
        this.aiService = aiService;
        this.draftStore = new DraftSessionStore(getUserDataPath);
    }

    private logInvokeStart(method: string, params: unknown, context: AutomationInvokeContext, timeoutMs: number): void {
        devLog('INFO', 'AutomationService.invoke.start', 'Automation invoke start', {
            requestId: context.requestId,
            method,
            source: context.source,
            origin: context.origin,
            timeoutMs,
            params: redactForLog(params),
        });
    }

    private logInvokeSuccess(method: string, context: AutomationInvokeContext, startedAt: number, result: unknown): void {
        devLog('INFO', 'AutomationService.invoke.success', 'Automation invoke success', {
            requestId: context.requestId,
            method,
            elapsedMs: Date.now() - startedAt,
            result: redactForLog(result),
        });
    }

    private logInvokeError(method: string, context: AutomationInvokeContext, startedAt: number, error: unknown): void {
        devLogError('AutomationService.invoke.error', error, {
            requestId: context.requestId,
            method,
            elapsedMs: Date.now() - startedAt,
        });
    }

    private async withTimeout<T>(method: string, params: unknown, context: AutomationInvokeContext, task: () => Promise<T>): Promise<T> {
        const timeoutMs = resolveAutomationTimeout(method);
        const startedAt = Date.now();
        this.logInvokeStart(method, params, context, timeoutMs);
        let timer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                reject(createAutomationError('UPSTREAM_TIMEOUT', `Automation method ${method} timed out after ${timeoutMs}ms`, {
                    method,
                    timeoutMs,
                    requestId: context.requestId,
                }));
            }, timeoutMs);
            timer.unref?.();
        });

        try {
            const result = await Promise.race([task(), timeoutPromise]);
            if (timer) clearTimeout(timer);
            this.logInvokeSuccess(method, context, startedAt, result);
            return result;
        } catch (error) {
            if (timer) clearTimeout(timer);
            this.logInvokeError(method, context, startedAt, error);
            throw error;
        }
    }

    private buildPromptPreviewPayload(kind: NormalizedPromptPreviewKind, payload: Record<string, unknown>): Record<string, unknown> {
        if (kind === 'creative_assets') {
            const novelId = assertRequiredString(payload.novelId, 'payload.novelId');
            const brief = assertRequiredString(payload.brief, 'payload.brief');
            const targetSections = Array.isArray(payload.targetSections)
                ? payload.targetSections
                : (String(payload.kind || '').toLowerCase().includes('outline') ? ['plotLines', 'plotPoints'] : undefined);
            return {
                ...payload,
                novelId,
                brief,
                ...(targetSections ? { targetSections } : {}),
            };
        }

        return {
            ...payload,
            novelId: assertRequiredString(payload.novelId, 'payload.novelId'),
            chapterId: assertRequiredString(payload.chapterId, 'payload.chapterId'),
            currentContent: assertRequiredString(payload.currentContent, 'payload.currentContent'),
        };
    }

    async listDrafts(filters?: DraftListFilters): Promise<DraftSessionRecord[]> {
        return this.draftStore.list(filters);
    }

    async getDraft(draftSessionId: string): Promise<DraftSessionRecord | null> {
        return this.draftStore.getById(draftSessionId);
    }

    async getActiveDraft(input: { novelId: string; workspace?: DraftSessionRecord['workspace']; type?: DraftSessionRecord['type'] }): Promise<DraftSessionRecord | null> {
        assertRequiredString(input?.novelId, 'novelId');
        return this.draftStore.getLatest({
            novelId: input.novelId,
            workspace: input.workspace,
            type: input.type,
            status: 'draft',
        });
    }

    async generateCreativeAssetsDraft(
        payload: CreativeAssetsGeneratePayload,
        context: AutomationInvokeContext,
        type: DraftSessionRecord['type'] = 'creative-assets',
    ): Promise<DraftSessionRecord> {
        assertRequiredString(payload?.novelId, 'novelId');
        assertRequiredString(payload?.brief, 'brief');
        const result = await this.aiService.generateCreativeAssets(payload);
        const sanitizedDraft = sanitizeGeneratedDraft(normalizeCreativeDraft(result.draft));
        return this.draftStore.create({
            workspace: 'ai-workbench',
            type,
            source: 'internal-ai',
            origin: context.origin ?? 'unknown',
            novelId: payload.novelId,
            status: 'draft',
            payload: sanitizedDraft,
            selection: createSelectionFromDraft(sanitizedDraft),
            previewSummary: summarizeCreativeDraft(sanitizedDraft),
            validation: null,
        });
    }

    async createChapterDraftSession(
        payload: {
            novelId: string;
            chapterId: string;
            currentContent: string;
            presentation?: 'silent' | 'toast' | 'modal';
            locale?: string;
            mode?: 'new_chapter' | 'continue_chapter';
            ideaIds?: string[];
            contextChapterCount?: number;
            recentRawChapterCount?: number;
            targetLength?: number;
            style?: string;
            tone?: string;
            pace?: string;
            temperature?: number;
            userIntent?: string;
            currentLocation?: string;
            overrideUserPrompt?: string;
        },
        context: AutomationInvokeContext,
    ): Promise<DraftSessionRecord> {
        assertRequiredString(payload?.novelId, 'novelId');
        assertRequiredString(payload?.chapterId, 'chapterId');
        assertRequiredString(payload?.currentContent, 'currentContent');
        const requestedPresentation = typeof payload.presentation === 'string' ? payload.presentation.trim().toLowerCase() : '';
        const normalizedPresentation = requestedPresentation === 'silent' || requestedPresentation === 'toast' || requestedPresentation === 'modal'
            ? requestedPresentation
            : undefined;
        const { presentation: _presentation, ...chapterGeneratePayload } = payload;
        const result = await this.aiService.executeAction({
            actionId: 'chapter.generate',
            payload: chapterGeneratePayload,
        } satisfies AiActionExecutePayload) as {
            text: string;
            usedContext: string[];
            warnings?: string[];
            consistency: { ok: boolean; issues: string[] };
        };

        const chapterPayload: ChapterDraftPayload = {
            chapterId: payload.chapterId,
            baseContent: payload.currentContent,
            generatedText: result.text,
            content: `${payload.currentContent}${result.text}`,
            presentation: normalizedPresentation,
            usedContext: result.usedContext,
            warnings: result.warnings,
            consistency: result.consistency,
        };

        return this.draftStore.create({
            workspace: 'chapter-editor',
            type: 'chapter-draft',
            source: 'internal-ai',
            origin: context.origin ?? 'unknown',
            novelId: payload.novelId,
            chapterId: payload.chapterId,
            status: 'draft',
            payload: chapterPayload,
            previewSummary: `章节草稿 ${result.text.length} 字符`,
        });
    }

    async updateDraft(input: {
        draftSessionId: string;
        version: number;
        payload?: CreativeAssetsDraft | ChapterDraftPayload;
        selection?: CreativeDraftSelection;
        validation?: CreativeAssetsDraftValidationResult | null;
    }): Promise<DraftSessionRecord> {
        assertRequiredString(input?.draftSessionId, 'draftSessionId');
        assertRequiredNumber(input?.version, 'version');
        return this.draftStore.update(input.draftSessionId, input.version, (current) => ({
            ...current,
            payload: input.payload ?? current.payload,
            selection: input.selection ?? current.selection,
            validation: input.validation === undefined ? current.validation : input.validation,
            previewSummary: current.type === 'chapter-draft'
                ? `章节草稿 ${((input.payload ?? current.payload) as ChapterDraftPayload).generatedText?.length ?? 0} 字符`
                : summarizeCreativeDraft(normalizeCreativeDraft(input.payload ?? current.payload)),
        }));
    }

    async discardDraft(input: { draftSessionId: string; version: number }): Promise<DraftSessionRecord> {
        assertRequiredString(input?.draftSessionId, 'draftSessionId');
        assertRequiredNumber(input?.version, 'version');
        return this.draftStore.update(input.draftSessionId, input.version, (current) => ({
            ...current,
            status: 'discarded',
        }));
    }

    async validateCreativeDraftSession(input: { draftSessionId: string; version?: number }): Promise<{ session: DraftSessionRecord; validation: CreativeAssetsDraftValidationResult }> {
        assertRequiredString(input?.draftSessionId, 'draftSessionId');
        const session = await this.draftStore.getById(input.draftSessionId);
        if (!session) {
            throw Object.assign(new Error('Draft session not found'), { code: 'NOT_FOUND' });
        }
        if (typeof input.version === 'number' && session.version !== input.version) {
            throw Object.assign(new Error('Draft session version conflict'), { code: 'VERSION_CONFLICT' });
        }
        if (session.type !== 'creative-assets' && session.type !== 'outline-draft') {
            throw Object.assign(new Error('Only creative draft sessions can be validated'), { code: 'INVALID_INPUT' });
        }
        const validation = await this.aiService.validateCreativeAssetsDraft({
            novelId: session.novelId,
            draft: pickSelectedCreativeDraft(normalizeCreativeDraft(session.payload), session.selection),
        });
        const updated = await this.draftStore.update(session.draftSessionId, session.version, (current) => ({
            ...current,
            validation,
            payload: validation.normalizedDraft,
            selection: createSelectionFromDraft(validation.normalizedDraft),
            previewSummary: summarizeCreativeDraft(validation.normalizedDraft),
        }));
        return {
            session: updated,
            validation,
        };
    }

    async commitDraft(input: { draftSessionId: string; version: number }): Promise<DraftCommitResponse> {
        assertRequiredString(input?.draftSessionId, 'draftSessionId');
        assertRequiredNumber(input?.version, 'version');
        const session = await this.draftStore.getById(input.draftSessionId);
        if (!session) {
            throw Object.assign(new Error('Draft session not found'), { code: 'NOT_FOUND' });
        }
        if (session.version !== input.version) {
            throw Object.assign(new Error('Draft session version conflict'), { code: 'VERSION_CONFLICT' });
        }
        if (session.type === 'creative-assets' || session.type === 'outline-draft') {
            const validation = await this.aiService.validateCreativeAssetsDraft({
                novelId: session.novelId,
                draft: pickSelectedCreativeDraft(normalizeCreativeDraft(session.payload), session.selection),
            });
            const normalizedDraft = validation.normalizedDraft;
            const updatedForValidation = await this.draftStore.update(session.draftSessionId, session.version, (current) => ({
                ...current,
                payload: normalizedDraft,
                selection: createSelectionFromDraft(normalizedDraft),
                validation,
                previewSummary: summarizeCreativeDraft(normalizedDraft),
            }));
            if (!validation.ok) {
                return {
                    session: updatedForValidation,
                    validation,
                };
            }
            const confirmResult = await this.aiService.confirmCreativeAssets({
                novelId: session.novelId,
                draft: normalizedDraft,
            });
            const committed = await this.draftStore.update(updatedForValidation.draftSessionId, updatedForValidation.version, (current) => ({
                ...current,
                status: confirmResult.success ? 'committed' : 'failed',
                validation,
            }));
            return {
                session: committed,
                validation,
                confirmResult,
            };
        }

        if (session.type === 'chapter-draft') {
            const chapterPayload = session.payload as ChapterDraftPayload;
            const saveResult = await this.aiService.executeAction({
                actionId: 'chapter.save',
                payload: {
                    chapterId: chapterPayload.chapterId,
                    content: chapterPayload.content,
                    source: 'ai_agent',
                },
            });
            const committed = await this.draftStore.update(session.draftSessionId, session.version, (current) => ({
                ...current,
                status: 'committed',
            }));
            return {
                session: committed,
                saveResult,
            };
        }

        throw Object.assign(new Error(`Unsupported draft type: ${session.type}`), { code: 'INVALID_INPUT' });
    }

    async previewPrompt(input: {
        kind: string;
        payload: Record<string, unknown>;
    }): Promise<PromptPreviewResponse> {
        const normalizedKind = normalizePromptPreviewKind(input?.kind);
        const normalizedPayload = this.buildPromptPreviewPayload(normalizedKind, (input?.payload ?? {}) as Record<string, unknown>);
        let preview: PromptPreviewResult;
        if (normalizedKind === 'creative_assets') {
            preview = await this.aiService.previewCreativeAssetsPrompt(normalizedPayload as any);
        } else {
            preview = await this.aiService.previewContinuePrompt(normalizedPayload as any);
        }
        return {
            kind: normalizedKind,
            preview,
        };
    }

    async applyPartialCreativeDraft(input: { novelId: string; draft: CreativeAssetsDraft }): Promise<{
        validation: CreativeAssetsDraftValidationResult;
        confirmResult?: unknown;
    }> {
        assertRequiredString(input?.novelId, 'novelId');
        const validation = await this.aiService.validateCreativeAssetsDraft({
            novelId: input.novelId,
            draft: normalizeCreativeDraft(input.draft),
        });
        if (!validation.ok) {
            return { validation };
        }
        const confirmResult = await this.aiService.confirmCreativeAssets({
            novelId: input.novelId,
            draft: validation.normalizedDraft,
        });
        return { validation, confirmResult };
    }

    async invoke(method: string, params: any, context: AutomationInvokeContext): Promise<unknown> {
        return this.withTimeout(method, params, context, async () => {
            switch (method) {
                case 'draft.list':
                    return this.listDrafts(params);
                case 'draft.get':
                    return this.getDraft(assertRequiredString(params?.draftSessionId, 'draftSessionId'));
                case 'draft.get_active':
                    return this.getActiveDraft(params);
                case 'draft.update':
                    return this.updateDraft(params);
                case 'draft.commit':
                    return this.commitDraft(params);
                case 'draft.discard':
                    return this.discardDraft(params);
                case 'creative_assets.generate_draft':
                    return this.generateCreativeAssetsDraft(params, context, 'creative-assets');
                case 'outline.generate_draft':
                    return this.generateCreativeAssetsDraft({
                        ...params,
                        targetSections: ['plotLines', 'plotPoints'],
                    }, context, 'outline-draft');
                case 'chapter.generate_draft':
                    return this.createChapterDraftSession(params, context);
                case 'creative_assets.validate_draft':
                    return this.validateCreativeDraftSession(params);
                case 'outline.write':
                    return this.applyPartialCreativeDraft({
                        novelId: assertRequiredString(params?.novelId, 'novelId'),
                        draft: buildOutlineDraft(params),
                    });
                case 'character.create_batch':
                    return this.applyPartialCreativeDraft({
                        novelId: assertRequiredString(params?.novelId, 'novelId'),
                        draft: buildCharacterBatchDraft(params),
                    });
                case 'story_patch.apply':
                    return this.applyPartialCreativeDraft({
                        novelId: assertRequiredString(params?.novelId, 'novelId'),
                        draft: normalizeCreativeDraft(params?.draft),
                    });
                case 'prompt.preview':
                    return this.previewPrompt(params);
                default:
                    return this.aiService.executeAction({
                        actionId: method,
                        payload: params,
                    });
            }
        });
    }
}
