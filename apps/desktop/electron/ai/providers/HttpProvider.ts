import { AiGenerateRequest, AiGenerateResponse, AiHealthCheckResult, AiImageRequest, AiImageResponse, AiProvider, AiSettings } from '../types';
import { devLog, devLogError, redactForLog } from '../../debug/devLogger';
import { net } from 'electron';

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function parseJsonSafe(text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function describeNetworkError(error: any): string {
    const message = String(error?.message || 'unknown error');
    const causeCode = error?.cause?.code || error?.code;
    const causeMessage = error?.cause?.message;
    const parts = [message];
    if (causeCode) {
        parts.push(`code=${causeCode}`);
    }
    if (causeMessage && causeMessage !== message) {
        parts.push(`cause=${causeMessage}`);
    }
    return parts.join(' | ');
}

async function transportFetch(url: string, init: RequestInit): Promise<Response> {
    try {
        return await net.fetch(url, init as any);
    } catch {
        return await fetch(url, init);
    }
}

export class HttpProvider implements AiProvider {
    public readonly name = 'http' as const;

    constructor(private readonly settings: AiSettings) { }

    async healthCheck(): Promise<AiHealthCheckResult> {
        const { baseUrl, apiKey, timeoutMs } = this.settings.http;
        if (!baseUrl.trim()) {
            return { ok: false, detail: 'HTTP baseUrl is empty' };
        }

        try {
            new URL(baseUrl);
        } catch {
            return { ok: false, detail: 'HTTP baseUrl is invalid' };
        }

        if (!apiKey.trim()) {
            return { ok: false, detail: 'API key is empty' };
        }

        const controller = new AbortController();
        let didTimeout = false;
        const effectiveTimeout = Math.max(1000, timeoutMs);
        const timer = setTimeout(() => {
            didTimeout = true;
            controller.abort();
        }, effectiveTimeout);
        const url = joinUrl(baseUrl, 'models');
        const startedAt = Date.now();

        try {
            devLog('INFO', 'HttpProvider.healthCheck.request', 'HTTP health check request', {
                url,
                timeoutMs: effectiveTimeout,
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            const res = await transportFetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: controller.signal,
            });

            if (!res.ok) {
                devLog('WARN', 'HttpProvider.healthCheck.response', 'HTTP health check rejected', {
                    url,
                    status: res.status,
                    elapsedMs: Date.now() - startedAt,
                });
                return { ok: false, detail: `HTTP provider rejected: ${res.status}` };
            }
            devLog('INFO', 'HttpProvider.healthCheck.response', 'HTTP health check ok', {
                url,
                status: res.status,
                elapsedMs: Date.now() - startedAt,
            });
            return { ok: true, detail: 'HTTP provider is reachable' };
        } catch (error: any) {
            devLogError('HttpProvider.healthCheck.error', error, {
                url,
                elapsedMs: Date.now() - startedAt,
                didTimeout,
            });
            if (didTimeout) {
                return { ok: false, detail: `HTTP health check timed out after ${effectiveTimeout}ms` };
            }
            return { ok: false, detail: `HTTP health check failed: ${describeNetworkError(error)} | url=${url}` };
        } finally {
            clearTimeout(timer);
        }
    }

    async generate(req: AiGenerateRequest): Promise<AiGenerateResponse> {
        const prompt = req.prompt.trim();
        if (!prompt) {
            return { text: '', model: this.settings.http.model };
        }

        const controller = new AbortController();
        let didTimeout = false;
        const timeout = Math.max(1000, req.timeoutMs ?? this.settings.http.timeoutMs);
        const timer = setTimeout(() => {
            didTimeout = true;
            controller.abort();
        }, timeout);

        const body = {
            model: this.settings.http.model,
            messages: [
                ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
                { role: 'user', content: prompt },
            ],
            max_tokens: req.maxTokens ?? this.settings.http.maxTokens,
            temperature: req.temperature ?? this.settings.http.temperature,
        };
        const url = joinUrl(this.settings.http.baseUrl, 'chat/completions');
        const startedAt = Date.now();

        try {
            devLog('INFO', 'HttpProvider.generate.request', 'AI text generation request', {
                url,
                timeoutMs: timeout,
                body: redactForLog(body),
            });
            const res = await transportFetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.settings.http.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            const text = await res.text();
            const json = parseJsonSafe(text);
            devLog('INFO', 'HttpProvider.generate.response', 'AI text generation response', {
                url,
                status: res.status,
                elapsedMs: Date.now() - startedAt,
                text,
            });

            if (!res.ok) {
                throw new Error(json?.error?.message || `HTTP ${res.status}: ${text.slice(0, 300)}`);
            }

            const output =
                json?.choices?.[0]?.message?.content ||
                json?.output_text ||
                json?.content?.[0]?.text ||
                '';

            return {
                text: typeof output === 'string' ? output : JSON.stringify(output),
                model: json?.model || this.settings.http.model,
            };
        } catch (error: any) {
            devLogError('HttpProvider.generate.error', error, {
                url,
                elapsedMs: Date.now() - startedAt,
                didTimeout,
                requestBody: redactForLog(body),
            });
            if (didTimeout || error?.name === 'AbortError') {
                throw new Error(`HTTP request timeout after ${timeout}ms`);
            }
            throw new Error(`HTTP request failed: ${describeNetworkError(error)} | url=${url}`);
        } finally {
            clearTimeout(timer);
        }
    }

    async generateImage(req: AiImageRequest): Promise<AiImageResponse> {
        const prompt = req.prompt.trim();
        if (!prompt) {
            return {};
        }

        const controller = new AbortController();
        let didTimeout = false;
        const timeout = Math.max(1000, this.settings.http.timeoutMs);
        const timer = setTimeout(() => {
            didTimeout = true;
            controller.abort();
        }, timeout);
        const body = {
            model: req.model || this.settings.http.model,
            prompt,
            size: req.size || '1024x1024',
            output_format: req.outputFormat || 'png',
            watermark: req.watermark ?? true,
        };
        const url = joinUrl(this.settings.http.baseUrl, 'images/generations');
        const startedAt = Date.now();

        try {
            devLog('INFO', 'HttpProvider.generateImage.request', 'AI image generation request', {
                url,
                timeoutMs: timeout,
                body: redactForLog(body),
            });
            const res = await transportFetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.settings.http.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            const text = await res.text();
            const json = parseJsonSafe(text);
            devLog('INFO', 'HttpProvider.generateImage.response', 'AI image generation response', {
                url,
                status: res.status,
                elapsedMs: Date.now() - startedAt,
                text,
            });

            if (!res.ok) {
                throw new Error(json?.error?.message || `HTTP ${res.status}: ${text.slice(0, 300)}`);
            }

            const first = json?.data?.[0] || {};
            return {
                imageUrl: first.url,
                imageBase64: first.b64_json,
                mimeType: 'image/png',
            };
        } catch (error: any) {
            devLogError('HttpProvider.generateImage.error', error, {
                url,
                elapsedMs: Date.now() - startedAt,
                didTimeout,
                requestBody: redactForLog(body),
            });
            if (didTimeout || error?.name === 'AbortError') {
                throw new Error(`HTTP request timeout after ${timeout}ms`);
            }
            throw new Error(`HTTP request failed: ${describeNetworkError(error)} | url=${url}`);
        } finally {
            clearTimeout(timer);
        }
    }
}
