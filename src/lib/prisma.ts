
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 接続文字列を調整する関数
const getConnectionString = () => {
    // Vercel環境ではDATABASE_URL（通常6543）を使用
    // ローカルなどではDIRECT_URL（5432）があればそれを使用
    let url = process.env.DATABASE_URL;

    // DIRECT_URLが明示的にあり、かつProductionでない場合はそちらを優先（開発用）
    if (process.env.NODE_ENV !== 'production' && process.env.DIRECT_URL) {
        url = process.env.DIRECT_URL;
    }

    if (!url) return undefined;

    // URLにパラメータを追加/上書き
    const urlObj = new URL(url);

    // Supabase Transaction Mode (6543) の場合、または明示的に指定する場合
    // pgbouncer=true は必須
    urlObj.searchParams.set('pgbouncer', 'true');

    // Serverless環境での接続数制限
    urlObj.searchParams.set('connection_limit', '1');

    return urlObj.toString();
};

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ['query', 'error', 'warn'],
        datasources: {
            db: {
                url: getConnectionString(),
            },
        },
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
