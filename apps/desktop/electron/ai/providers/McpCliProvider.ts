import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { AiGenerateRequest, AiGenerateResponse, AiHealthCheckResult, AiProvider, AiSettings } from '../types';

function splitArgs(raw: string): string[] {
    if (!raw.trim()) return [];
    const matches = raw.match(/"[^"]*"|'[^']*'|\S+/g) || [];
    return matches.map((token) => token.replace(/^['"]|['"]$/g, ''));
}

export class McpCliProvider implements AiProvider {
    public readonly name = 'mcp-cli' as const;

    constructor(private readonly settings: AiSettings) { }

    async healthCheck(): Promise<AiHealthCheckResult> {
        const { cliPath } = this.settings.mcpCli;
        if (!cliPath.trim()) {
            return { ok: false, detail: 'MCP CLI path is empty' };
        }

        if (!fs.existsSync(cliPath)) {
            return { ok: false, detail: 'MCP CLI path does not exist' };
        }

        try {
            const { stdout } = await this.runProcess(['--version'], '', this.settings.mcpCli.startupTimeoutMs);
            return { ok: true, detail: (stdout || 'MCP CLI is executable').slice(0, 200) };
        } catch (error: any) {
            return { ok: false, detail: `MCP CLI check failed: ${error?.message || 'unknown error'}` };
        }
    }

    async generate(req: AiGenerateRequest): Promise<AiGenerateResponse> {
        const prompt = req.prompt.trim();
        if (!prompt) {
            return { text: '', model: 'mcp-cli' };
        }

        const argsTemplate = this.settings.mcpCli.argsTemplate || '';
        const hasPromptPlaceholder = argsTemplate.includes('{prompt}');
        const parsedArgs = splitArgs(argsTemplate.replace('{prompt}', prompt));

        const { stdout } = await this.runProcess(parsedArgs, hasPromptPlaceholder ? '' : prompt, this.settings.mcpCli.startupTimeoutMs);

        return {
            text: stdout.trim(),
            model: 'mcp-cli',
        };
    }

    private async runProcess(args: string[], stdinText: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
        const { cliPath, workingDir, envJson } = this.settings.mcpCli;
        const extraEnv = this.parseEnvJson(envJson);

        return new Promise((resolve, reject) => {
            const child = spawn(cliPath, args, {
                cwd: workingDir || process.cwd(),
                env: { ...process.env, ...extraEnv },
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });

            let stdout = '';
            let stderr = '';
            let done = false;

            const timer = setTimeout(() => {
                if (done) return;
                done = true;
                child.kill('SIGTERM');
                reject(new Error('MCP CLI process timeout'));
            }, Math.max(1000, timeoutMs));

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('error', (error) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(error);
            });

            child.on('close', (code) => {
                if (done) return;
                done = true;
                clearTimeout(timer);

                if (code !== 0) {
                    reject(new Error(`MCP CLI exited with code ${code}: ${stderr.slice(0, 300)}`));
                    return;
                }

                resolve({ stdout, stderr });
            });

            if (stdinText) {
                child.stdin.write(stdinText);
            }
            child.stdin.end();
        });
    }

    private parseEnvJson(raw: string): Record<string, string> {
        if (!raw.trim()) return {};
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};

            const result: Record<string, string> = {};
            for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
                result[key] = String(value ?? '');
            }
            return result;
        } catch {
            return {};
        }
    }
}
