// ESM/CommonJS compatibility: use default import for @prisma/client
import Prisma from '@prisma/client';
const { PrismaClient } = Prisma;

// Re-export PrismaClient and Prisma namespace for type usage
export { PrismaClient };
export { Prisma };

// Type alias for convenience
export type PrismaClientType = InstanceType<typeof PrismaClient>;

let _prisma: InstanceType<typeof PrismaClient> | null = null;

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

// Proxy to ensure we use the initialized instance
export const db = new Proxy({} as InstanceType<typeof PrismaClient>, {
    get(target, prop) {
        if (!_prisma) {
            throw new Error("Database not initialized. Call initDb() first.");
        }
        return Reflect.get(_prisma, prop);
    }
});
