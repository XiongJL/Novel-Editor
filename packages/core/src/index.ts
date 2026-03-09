// Use the workspace-generated Prisma client instead of resolving runtime files from node_modules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Prisma from '../generated/client/index.js';
const { PrismaClient } = Prisma;

// Re-export PrismaClient and Prisma namespace for type usage
export { PrismaClient };
export { Prisma };

// Type alias for convenience
export type PrismaClientType = InstanceType<typeof PrismaClient>;

let _prisma: InstanceType<typeof PrismaClient> | null = null;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaInitSqlPath = path.resolve(moduleDir, '../generated/client/schema-init.sql');

function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let index = 0; index < sql.length; index += 1) {
        const char = sql[index];
        const next = sql[index + 1];

        if (inLineComment) {
            current += char;
            if (char === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            current += char;
            if (char === '*' && next === '/') {
                current += next;
                index += 1;
                inBlockComment = false;
            }
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote) {
            if (char === '-' && next === '-') {
                current += char + next;
                index += 1;
                inLineComment = true;
                continue;
            }
            if (char === '/' && next === '*') {
                current += char + next;
                index += 1;
                inBlockComment = true;
                continue;
            }
        }

        if (char === '\'' && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
        } else if (char === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
        }

        if (char === ';' && !inSingleQuote && !inDoubleQuote) {
            const statement = current.trim();
            if (statement) statements.push(statement);
            current = '';
            continue;
        }

        current += char;
    }

    const trailing = current.trim();
    if (trailing) statements.push(trailing);
    return statements;
}

// Initialize the database with a specific URL
export const initDb = (url: string) => {
    if (_prisma) return _prisma;
    _prisma = new PrismaClient({
        datasources: {
            db: {
                url,
            },
        },
    });
    return _prisma;
}

export const ensureDbSchema = async (): Promise<boolean> => {
    if (!_prisma) {
        throw new Error('Database not initialized. Call initDb() first.');
    }

    const existingTables = await _prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='Novel'",
    );
    if (existingTables.length > 0) {
        return false;
    }

    if (!fs.existsSync(schemaInitSqlPath)) {
        throw new Error(`Bundled schema init SQL not found at ${schemaInitSqlPath}`);
    }

    const sql = fs.readFileSync(schemaInitSqlPath, 'utf8');
    const statements = splitSqlStatements(sql)
        .map((statement) => statement.trim())
        .filter(Boolean);

    for (const statement of statements) {
        await _prisma.$executeRawUnsafe(statement);
    }

    return true;
}

// Proxy to ensure we use the initialized instance
export const db = new Proxy({} as InstanceType<typeof PrismaClient>, {
    get(target, prop) {
        if (!_prisma) {
            throw new Error("Database not initialized. Call initDb() first.");
        }
        return Reflect.get(_prisma, prop);
    }
});
