import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { formatAiError, formatAiErrorFromUnknown } from '../../utils/aiError';

type Props = {
    isDark: boolean;
};

const TEXT_MODELS = [
    'doubao-seed-2-0-pro-260215',
    'doubao-1-5-pro-32k-250115',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gpt-4.1-mini',
    'gpt-4.1',
    'gpt-4o-mini',
];

const IMAGE_MODELS = [
    'doubao-seedream-5-0-260128',
    'gpt-image-1',
    'imagen-3.0-generate-002',
];

type CreativityLevel = 'safe' | 'balanced' | 'creative';

function temperatureToCreativityLevel(value: number): CreativityLevel {
    if (value <= 0.45) return 'safe';
    if (value >= 0.85) return 'creative';
    return 'balanced';
}

function creativityLevelToTemperature(level: CreativityLevel): number {
    if (level === 'safe') return 0.3;
    if (level === 'creative') return 1.0;
    return 0.7;
}

export function AISettingsPanel({ isDark }: Props) {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<AISettings | null>(null);
    const [status, setStatus] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [testPrompt, setTestPrompt] = useState('请用一句话生成一个玄幻小说章节标题');
    const [creativityLevel, setCreativityLevel] = useState<CreativityLevel>('balanced');

    useEffect(() => {
        let mounted = true;
        window.ai.getSettings()
            .then((res) => {
                if (mounted) {
                    const merged = {
                        ...res,
                        summary: {
                            summaryMode: res.summary?.summaryMode ?? 'local',
                            summaryTriggerPolicy: res.summary?.summaryTriggerPolicy ?? 'manual',
                            summaryDebounceMs: res.summary?.summaryDebounceMs ?? 30000,
                            summaryMinIntervalMs: res.summary?.summaryMinIntervalMs ?? 180000,
                            summaryMinWordDelta: res.summary?.summaryMinWordDelta ?? 120,
                            summaryFinalizeStableMs: res.summary?.summaryFinalizeStableMs ?? 600000,
                            summaryFinalizeMinWords: res.summary?.summaryFinalizeMinWords ?? 1200,
                            recentChapterRawCount: res.summary?.recentChapterRawCount ?? 2,
                        },
                    } as AISettings;
                    setSettings(merged);
                    setCreativityLevel(temperatureToCreativityLevel(merged.http.temperature));
                }
            })
            .catch((error) => {
                console.error('[AISettingsPanel] load failed:', error);
                if (mounted) setStatus(formatAiErrorFromUnknown(error, 'Failed to load AI settings'));
            });

        return () => {
            mounted = false;
        };
    }, []);

    const updateProviderType = (providerType: AISettings['providerType']) => {
        if (!settings) return;
        setSettings({ ...settings, providerType });
    };

    const updateCreativityLevel = (level: CreativityLevel) => {
        if (!settings) return;
        setCreativityLevel(level);
        setSettings({
            ...settings,
            http: {
                ...settings.http,
                temperature: creativityLevelToTemperature(level),
            },
        });
    };

    const saveSettings = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            const saved = await window.ai.updateSettings(settings);
            setSettings(saved);
            setCreativityLevel(temperatureToCreativityLevel(saved.http.temperature));
            setStatus('Saved');
        } catch (error) {
            console.error('[AISettingsPanel] save failed:', error);
            setStatus(formatAiErrorFromUnknown(error, 'Save failed'));
        } finally {
            setIsSaving(false);
        }
    };

    const applyPreset = (preset: 'doubao-ark' | 'openai-compatible' | 'gemini-openai-compatible') => {
        if (!settings) return;

        if (preset === 'doubao-ark') {
            setCreativityLevel(temperatureToCreativityLevel(0.7));
            setSettings({
                ...settings,
                providerType: 'http',
                http: {
                    ...settings.http,
                    // 火山方舟 OpenAI 兼容入口（/chat/completions 等由后端拼接）
                    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
                    model: 'doubao-seed-2-0-pro-260215',
                    imageModel: 'doubao-seedream-5-0-260128',
                    imageSize: '2K',
                    imageOutputFormat: 'png',
                    imageWatermark: false,
                    timeoutMs: 60000,
                    maxTokens: 2048,
                    temperature: 0.7,
                },
            });
            setStatus('Preset applied: Doubao Ark');
            return;
        }

        if (preset === 'openai-compatible') {
            setCreativityLevel(temperatureToCreativityLevel(0.7));
            setSettings({
                ...settings,
                providerType: 'http',
                http: {
                    ...settings.http,
                    baseUrl: 'https://api.openai.com/v1',
                    model: 'gpt-4.1-mini',
                    imageModel: 'gpt-image-1',
                    imageSize: '1024x1024',
                    imageOutputFormat: 'png',
                    imageWatermark: true,
                    timeoutMs: 60000,
                    maxTokens: 2048,
                    temperature: 0.7,
                },
            });
            setStatus('Preset applied: OpenAI Compatible');
            return;
        }

        setCreativityLevel(temperatureToCreativityLevel(0.7));
        setSettings({
            ...settings,
            providerType: 'http',
            http: {
                ...settings.http,
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                model: 'gemini-2.5-pro',
                imageModel: 'imagen-3.0-generate-002',
                imageSize: '1024x1024',
                imageOutputFormat: 'png',
                imageWatermark: true,
                timeoutMs: 60000,
                maxTokens: 2048,
                temperature: 0.7,
            },
        });
        setStatus('Preset applied: Gemini OpenAI-Compatible');
    };

    const runCheck = async (kind: 'connection' | 'mcp' | 'proxy') => {
        try {
            const result =
                kind === 'connection'
                    ? await window.ai.testConnection()
                    : kind === 'mcp'
                        ? await window.ai.testMcp()
                        : await window.ai.testProxy();
            setStatus(`${kind}: ${result.ok ? 'ok' : 'failed'}${result.detail ? ` - ${result.detail}` : ''}`);
        } catch (error) {
            console.error('[AISettingsPanel] test failed:', error);
            setStatus(`${kind}: ${formatAiErrorFromUnknown(error, 'error')}`);
        }
    };

    const runGenerateCheck = async () => {
        try {
            const result = await window.ai.testGenerate(testPrompt);
            if (result.ok) {
                setStatus(`generate: ok | ${result.text || ''}`);
            } else {
                setStatus(`generate: failed | ${formatAiError(undefined, result.detail || '')}`);
            }
        } catch (error) {
            console.error('[AISettingsPanel] test generate failed:', error);
            setStatus(`generate: ${formatAiErrorFromUnknown(error, 'error')}`);
        }
    };

    if (!settings) {
        return <div className={clsx('text-sm', isDark ? 'text-neutral-400' : 'text-gray-500')}>{t('common.loading')}</div>;
    }

    return (
        <div className="space-y-8">
            <div className="space-y-3">
                <label className={clsx('text-sm font-medium uppercase tracking-widest', isDark ? 'text-neutral-400' : 'text-gray-500')}>
                    {t('settings.ai.provider', 'Provider')}
                </label>
                <div className="flex gap-3">
                    <button
                        onClick={() => updateProviderType('http')}
                        className={clsx(
                            'px-4 py-2 rounded-lg border text-sm transition-colors',
                            settings.providerType === 'http'
                                ? 'bg-indigo-600 text-white border-indigo-500'
                                : (isDark ? 'border-white/10 text-neutral-300 hover:bg-white/5' : 'border-gray-300 text-gray-700 hover:bg-gray-50')
                        )}
                    >
                        HTTP API
                    </button>
                    <button
                        onClick={() => updateProviderType('mcp-cli')}
                        className={clsx(
                            'px-4 py-2 rounded-lg border text-sm transition-colors',
                            settings.providerType === 'mcp-cli'
                                ? 'bg-indigo-600 text-white border-indigo-500'
                                : (isDark ? 'border-white/10 text-neutral-300 hover:bg-white/5' : 'border-gray-300 text-gray-700 hover:bg-gray-50')
                        )}
                    >
                        MCP CLI
                    </button>
                </div>
                <div className="flex gap-2 pt-1">
                    <button
                        onClick={() => applyPreset('doubao-ark')}
                        className={clsx(
                            "px-3 py-1.5 rounded-lg border text-xs transition-colors",
                            isDark ? "border-amber-400/30 text-amber-300 hover:bg-white/5" : "border-amber-300 text-amber-700 hover:bg-amber-50"
                        )}
                    >
                        {t('settings.ai.preset.doubao', '预设：火山方舟豆包')}
                    </button>
                    <button
                        onClick={() => applyPreset('openai-compatible')}
                        className={clsx(
                            "px-3 py-1.5 rounded-lg border text-xs transition-colors",
                            isDark ? "border-indigo-400/30 text-indigo-300 hover:bg-white/5" : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        )}
                    >
                        {t('settings.ai.preset.openai', '预设：OpenAI兼容')}
                    </button>
                    <button
                        onClick={() => applyPreset('gemini-openai-compatible')}
                        className={clsx(
                            "px-3 py-1.5 rounded-lg border text-xs transition-colors",
                            isDark ? "border-emerald-400/30 text-emerald-300 hover:bg-white/5" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        )}
                    >
                        {t('settings.ai.preset.gemini', '预设：Gemini兼容')}
                    </button>
                </div>
            </div>

            {settings.providerType === 'http' ? (
                <div className="grid grid-cols-2 gap-4">
                    <input
                        value={settings.http.baseUrl}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, baseUrl: e.target.value } })}
                        placeholder={t('settings.ai.baseUrl', 'Base URL')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <select
                        value={TEXT_MODELS.includes(settings.http.model) ? settings.http.model : '__custom__'}
                        onChange={(e) => {
                            if (e.target.value === '__custom__') return;
                            setSettings({ ...settings, http: { ...settings.http, model: e.target.value } });
                        }}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    >
                        <option value="__custom__">{t('settings.ai.modelPreset', '常用模型（可选）')}</option>
                        {TEXT_MODELS.map((model) => (
                            <option key={model} value={model}>
                                {model}
                            </option>
                        ))}
                    </select>
                    <input
                        value={settings.http.model}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, model: e.target.value } })}
                        placeholder={t('settings.ai.model', 'Model')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <select
                        value={IMAGE_MODELS.includes(settings.http.imageModel) ? settings.http.imageModel : '__custom__'}
                        onChange={(e) => {
                            if (e.target.value === '__custom__') return;
                            setSettings({ ...settings, http: { ...settings.http, imageModel: e.target.value } });
                        }}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    >
                        <option value="__custom__">{t('settings.ai.imageModelPreset', '常用生图模型（可选）')}</option>
                        {IMAGE_MODELS.map((model) => (
                            <option key={model} value={model}>
                                {model}
                            </option>
                        ))}
                    </select>
                    <input
                        value={settings.http.imageModel}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, imageModel: e.target.value } })}
                        placeholder={t('settings.ai.imageModel', 'Image Model')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <select
                        value={settings.http.imageSize}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, imageSize: e.target.value } })}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    >
                        <option value="2K">2K</option>
                        <option value="1024x1024">1024x1024</option>
                        <option value="1536x1024">1536x1024</option>
                        <option value="1024x1536">1024x1536</option>
                    </select>
                    <select
                        value={settings.http.imageOutputFormat}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, imageOutputFormat: e.target.value as 'png' | 'jpeg' | 'webp' } })}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    >
                        <option value="png">png</option>
                        <option value="jpeg">jpeg</option>
                        <option value="webp">webp</option>
                    </select>
                    <select
                        value={settings.http.imageWatermark ? 'true' : 'false'}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, imageWatermark: e.target.value === 'true' } })}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    >
                        <option value="false">{t('settings.ai.imageWatermark.off', '水印：关闭')}</option>
                        <option value="true">{t('settings.ai.imageWatermark.on', '水印：开启')}</option>
                    </select>
                    <input
                        type="password"
                        value={settings.http.apiKey}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, apiKey: e.target.value } })}
                        placeholder={t('settings.ai.apiKey', 'API Key')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm col-span-2',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <input
                        type="number"
                        value={settings.http.timeoutMs}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, timeoutMs: Number(e.target.value) || 60000 } })}
                        placeholder={t('settings.ai.timeoutMs', 'Timeout(ms)')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <input
                        type="number"
                        value={settings.http.maxTokens}
                        onChange={(e) => setSettings({ ...settings, http: { ...settings.http, maxTokens: Number(e.target.value) || 2048 } })}
                        placeholder={t('settings.ai.maxTokens', 'Max Tokens')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <div className="col-span-2 grid grid-cols-1 gap-2">
                        <select
                            value={creativityLevel}
                            onChange={(e) => updateCreativityLevel(e.target.value as CreativityLevel)}
                            className={clsx(
                                'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                                isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                            )}
                        >
                            <option value="safe">{t('settings.ai.creativity.safe', '创意程度：稳妥')}</option>
                            <option value="balanced">{t('settings.ai.creativity.balanced', '创意程度：平衡')}</option>
                            <option value="creative">{t('settings.ai.creativity.creative', '创意程度：创意')}</option>
                        </select>
                        <p className={clsx('text-xs px-1', isDark ? 'text-neutral-500' : 'text-gray-500')}>
                            {creativityLevel === 'safe'
                                ? t('settings.ai.creativity.safeDesc', '更稳定，较少跑偏，适合严格续写。')
                                : creativityLevel === 'creative'
                                    ? t('settings.ai.creativity.creativeDesc', '更有想象力，但可能更跳跃。')
                                    : t('settings.ai.creativity.balancedDesc', '稳定与创造力平衡，推荐默认使用。')}
                        </p>
                    </div>
                    <div className="col-span-2 rounded-xl border px-4 py-3 space-y-3 border-amber-300/40 bg-amber-50/50 dark:bg-amber-400/5 dark:border-amber-300/20">
                        <div className={clsx('text-xs font-medium', isDark ? 'text-amber-200' : 'text-amber-800')}>
                            {t('settings.ai.summary.title', '章节摘要策略')}
                        </div>
                        <select
                            value={settings.summary.summaryMode}
                            onChange={(e) => setSettings({
                                ...settings,
                                summary: { ...settings.summary, summaryMode: e.target.value as 'local' | 'ai' },
                            })}
                            className={clsx(
                                'w-full border rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors text-sm',
                                isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                            )}
                        >
                            <option value="local">{t('settings.ai.summary.modeLocal', '本地启发式摘要（不消耗 token）')}</option>
                            <option value="ai">{t('settings.ai.summary.modeAi', 'AI 摘要（更准确，消耗 token）')}</option>
                        </select>
                        <select
                            value={settings.summary.summaryTriggerPolicy}
                            onChange={(e) => setSettings({
                                ...settings,
                                summary: {
                                    ...settings.summary,
                                    summaryTriggerPolicy: e.target.value as 'auto' | 'manual' | 'finalized',
                                },
                            })}
                            className={clsx(
                                'w-full border rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 transition-colors text-sm',
                                isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                            )}
                        >
                            <option value="manual">{t('settings.ai.summary.trigger.manual', '触发策略：仅手动触发（AI推荐）')}</option>
                            <option value="finalized">{t('settings.ai.summary.trigger.finalized', '触发策略：章节完稿后触发')}</option>
                            <option value="auto">{t('settings.ai.summary.trigger.auto', '触发策略：自动触发（高频保存不推荐）')}</option>
                        </select>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                                type="number"
                                value={settings.summary.summaryDebounceMs}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    summary: { ...settings.summary, summaryDebounceMs: Number(e.target.value) || 30000 },
                                })}
                                placeholder={t('settings.ai.summary.debounceMs', '保存后防抖(ms)')}
                                className={clsx(
                                    'border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors text-xs',
                                    isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                                )}
                            />
                            <input
                                type="number"
                                value={settings.summary.summaryMinIntervalMs}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    summary: { ...settings.summary, summaryMinIntervalMs: Number(e.target.value) || 180000 },
                                })}
                                placeholder={t('settings.ai.summary.minIntervalMs', '最小更新间隔(ms)')}
                                className={clsx(
                                    'border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors text-xs',
                                    isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                                )}
                            />
                            <input
                                type="number"
                                value={settings.summary.summaryMinWordDelta}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    summary: { ...settings.summary, summaryMinWordDelta: Number(e.target.value) || 120 },
                                })}
                                placeholder={t('settings.ai.summary.minWordDelta', '最小字数变化')}
                                className={clsx(
                                    'border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors text-xs',
                                    isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                                )}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                                type="number"
                                value={settings.summary.summaryFinalizeStableMs}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    summary: { ...settings.summary, summaryFinalizeStableMs: Number(e.target.value) || 600000 },
                                })}
                                placeholder={t('settings.ai.summary.finalizeStableMs', '完稿稳定窗口(ms)')}
                                className={clsx(
                                    'border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors text-xs',
                                    isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                                )}
                            />
                            <input
                                type="number"
                                value={settings.summary.summaryFinalizeMinWords}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    summary: { ...settings.summary, summaryFinalizeMinWords: Number(e.target.value) || 1200 },
                                })}
                                placeholder={t('settings.ai.summary.finalizeMinWords', '完稿最小字数')}
                                className={clsx(
                                    'border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors text-xs',
                                    isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                                )}
                            />
                        </div>
                        <input
                            type="number"
                            min={0}
                            max={8}
                            value={settings.summary.recentChapterRawCount}
                            onChange={(e) => setSettings({
                                ...settings,
                                summary: { ...settings.summary, recentChapterRawCount: Math.max(0, Math.min(8, Number(e.target.value) || 2)) },
                            })}
                            placeholder={t('settings.ai.summary.recentRawCount', '续写时最近几章优先正文数量')}
                            className={clsx(
                                'w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors text-xs',
                                isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                            )}
                        />
                        <p className={clsx('text-xs', isDark ? 'text-amber-200/80' : 'text-amber-800')}>
                            {t('settings.ai.summary.notice', '提示：本地启发式摘要可能不准确；AI 摘要会消耗 token。建议优先维护大纲/故事线，再启用 AI 摘要。')}
                        </p>
                        <p className={clsx('text-xs', isDark ? 'text-neutral-400' : 'text-gray-500')}>
                            {t('settings.ai.summary.notice2', '建议：AI 摘要默认仅手动触发；若选择“章节完稿后触发”，系统会在章节一段时间未再编辑且达到最小字数后自动触发。')}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    <input
                        value={settings.mcpCli.cliPath}
                        onChange={(e) => setSettings({ ...settings, mcpCli: { ...settings.mcpCli, cliPath: e.target.value } })}
                        placeholder={t('settings.ai.cliPath', 'CLI Path')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <input
                        value={settings.mcpCli.workingDir}
                        onChange={(e) => setSettings({ ...settings, mcpCli: { ...settings.mcpCli, workingDir: e.target.value } })}
                        placeholder={t('settings.ai.workingDir', 'Working Directory')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <input
                        value={settings.mcpCli.argsTemplate}
                        onChange={(e) => setSettings({ ...settings, mcpCli: { ...settings.mcpCli, argsTemplate: e.target.value } })}
                        placeholder={t('settings.ai.argsTemplate', 'Args Template')}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm col-span-2',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                    <textarea
                        value={settings.mcpCli.envJson}
                        onChange={(e) => setSettings({ ...settings, mcpCli: { ...settings.mcpCli, envJson: e.target.value } })}
                        placeholder={t('settings.ai.envJson', 'Env JSON')}
                        rows={4}
                        className={clsx(
                            'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm col-span-2 resize-y',
                            isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                        )}
                    />
                </div>
            )}

            <div className="grid grid-cols-4 gap-4">
                <select
                    value={settings.proxy.mode}
                    onChange={(e) => setSettings({ ...settings, proxy: { ...settings.proxy, mode: e.target.value as AISettings['proxy']['mode'] } })}
                    className={clsx(
                        'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                        isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                    )}
                >
                    <option value="system">{t('settings.ai.proxy.system', 'Proxy: System')}</option>
                    <option value="off">{t('settings.ai.proxy.off', 'Proxy: Off')}</option>
                    <option value="custom">{t('settings.ai.proxy.custom', 'Proxy: Custom')}</option>
                </select>
                <input
                    value={settings.proxy.allProxy || ''}
                    onChange={(e) => setSettings({ ...settings, proxy: { ...settings.proxy, allProxy: e.target.value } })}
                    placeholder={t('settings.ai.proxy.all', 'ALL_PROXY')}
                    className={clsx(
                        'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                        isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                    )}
                />
                <input
                    value={settings.proxy.httpProxy || ''}
                    onChange={(e) => setSettings({ ...settings, proxy: { ...settings.proxy, httpProxy: e.target.value } })}
                    placeholder={t('settings.ai.proxy.http', 'HTTP_PROXY')}
                    className={clsx(
                        'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                        isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                    )}
                />
                <input
                    value={settings.proxy.httpsProxy || ''}
                    onChange={(e) => setSettings({ ...settings, proxy: { ...settings.proxy, httpsProxy: e.target.value } })}
                    placeholder={t('settings.ai.proxy.https', 'HTTPS_PROXY')}
                    className={clsx(
                        'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm',
                        isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                    )}
                />
                <input
                    value={settings.proxy.noProxy || ''}
                    onChange={(e) => setSettings({ ...settings, proxy: { ...settings.proxy, noProxy: e.target.value } })}
                    placeholder={t('settings.ai.proxy.no', 'NO_PROXY')}
                    className={clsx(
                        'border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 transition-colors text-sm col-span-4',
                        isDark ? 'bg-[#0a0a0f] border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                    )}
                />
            </div>

            <div className="flex flex-wrap gap-3">
                <button onClick={() => runCheck('connection')} className="px-4 py-2 rounded-lg border text-sm border-indigo-400/40 hover:bg-indigo-500/10">
                    {t('settings.ai.testConnection', 'Test Connection')}
                </button>
                <button onClick={() => runCheck('mcp')} className="px-4 py-2 rounded-lg border text-sm border-indigo-400/40 hover:bg-indigo-500/10">
                    {t('settings.ai.testMcp', 'Test MCP')}
                </button>
                <button onClick={() => runCheck('proxy')} className="px-4 py-2 rounded-lg border text-sm border-indigo-400/40 hover:bg-indigo-500/10">
                    {t('settings.ai.testProxy', 'Test Proxy')}
                </button>
                <button onClick={runGenerateCheck} className="px-4 py-2 rounded-lg border text-sm border-emerald-400/40 hover:bg-emerald-500/10">
                    {t('settings.ai.testGenerate', 'Test Generate')}
                </button>
                <button
                    onClick={saveSettings}
                    disabled={isSaving}
                    className={clsx(
                        'px-4 py-2 rounded-lg text-sm text-white',
                        isSaving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'
                    )}
                >
                    {isSaving ? t('common.loading') : t('common.save')}
                </button>
            </div>

            {status && (
                <p className={clsx('text-xs', isDark ? 'text-neutral-400' : 'text-gray-500')}>
                    {status}
                </p>
            )}
            <textarea
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                rows={2}
                placeholder={t('settings.ai.testPrompt', '测试生成提示词')}
                className={clsx(
                    'w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 transition-colors text-xs resize-y',
                    isDark ? 'bg-[#0a0a0f] border-white/10 text-white placeholder:text-neutral-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'
                )}
            />
        </div>
    );
}


