export type UiAiErrorCode =
    | 'INVALID_INPUT'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'PROVIDER_AUTH'
    | 'PROVIDER_TIMEOUT'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_FILTERED'
    | 'NETWORK_ERROR'
    | 'PERSISTENCE_ERROR'
    | 'UNKNOWN';

const AI_ERROR_CODES: UiAiErrorCode[] = [
    'INVALID_INPUT',
    'NOT_FOUND',
    'CONFLICT',
    'PROVIDER_AUTH',
    'PROVIDER_TIMEOUT',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_FILTERED',
    'NETWORK_ERROR',
    'PERSISTENCE_ERROR',
    'UNKNOWN',
];

function normalizeCode(code?: string): UiAiErrorCode | undefined {
    if (!code) return undefined;
    const upper = code.toUpperCase();
    return AI_ERROR_CODES.find((item) => item === upper);
}

function toMessage(error: unknown): string {
    if (error instanceof Error) return String(error.message || '');
    return String(error ?? '');
}

function cleanInvokePrefix(message: string): string {
    return message
        .replace(/^Error invoking remote method '[^']+':\s*/i, '')
        .replace(/^Error:\s*/i, '')
        .trim();
}

export function inferAiErrorCode(error: unknown): UiAiErrorCode | undefined {
    const maybeCode = normalizeCode((error as any)?.code);
    if (maybeCode) return maybeCode;

    const message = toMessage(error);
    const codeHit = message.match(/\b(INVALID_INPUT|NOT_FOUND|CONFLICT|PROVIDER_AUTH|PROVIDER_TIMEOUT|PROVIDER_UNAVAILABLE|PROVIDER_FILTERED|NETWORK_ERROR|PERSISTENCE_ERROR|UNKNOWN)\b/i);
    if (codeHit?.[1]) {
        return normalizeCode(codeHit[1]);
    }

    const lower = message.toLowerCase();
    if (lower.includes('timeout') || lower.includes('timed out')) return 'PROVIDER_TIMEOUT';
    if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('api key')) return 'PROVIDER_AUTH';
    if (lower.includes('content_filter') || lower.includes('filtered') || lower.includes('safety')) return 'PROVIDER_FILTERED';
    if (lower.includes('429') || lower.includes('503') || lower.includes('unavailable') || lower.includes('model')) return 'PROVIDER_UNAVAILABLE';
    if (lower.includes('fetch') || lower.includes('network') || lower.includes('econn') || lower.includes('socket')) return 'NETWORK_ERROR';
    if (lower.includes('not found')) return 'NOT_FOUND';
    if (lower.includes('required') || lower.includes('invalid')) return 'INVALID_INPUT';
    return undefined;
}

export function formatAiError(code?: string, fallback?: string): string {
    switch (normalizeCode(code)) {
        case 'INVALID_INPUT':
            return '参数不完整或格式错误，请检查输入。';
        case 'NOT_FOUND':
            return '目标数据不存在，可能已被删除。';
        case 'CONFLICT':
            return '当前操作与现有数据冲突，请刷新后重试。';
        case 'PROVIDER_AUTH':
            return '模型鉴权失败，请检查 API Key 或权限。';
        case 'PROVIDER_TIMEOUT':
            return '模型请求超时，请稍后重试或调大超时。';
        case 'PROVIDER_UNAVAILABLE':
            return '模型暂不可用，请稍后重试或切换模型。';
        case 'PROVIDER_FILTERED':
            return '请求触发内容策略限制，请调整提示词。';
        case 'NETWORK_ERROR':
            return '网络连接失败，请检查代理或网络配置。';
        case 'PERSISTENCE_ERROR':
            return '写入失败，数据未成功保存。';
        default:
            return fallback || '未知错误，请稍后重试。';
    }
}

export function formatAiErrorFromUnknown(error: unknown, fallback?: string): string {
    const code = inferAiErrorCode(error);
    if (code) {
        return formatAiError(code, fallback);
    }
    const cleaned = cleanInvokePrefix(toMessage(error));
    if (cleaned) return cleaned;
    return fallback || '未知错误，请稍后重试。';
}
