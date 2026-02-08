
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 接続文字列を調整する関数
const getConnectionString = () => {
    // DIRECT_URLがあればそれを優先（ポート5432: Session Mode）
    // なければDATABASE_URLを使用（ポート6543: Transaction Mode）
    let url = process.env.DIRECT_URL || process.env.DATABASE_URL;

    if (!url) return undefined;

    try {
        const urlObj = new URL(url);

        // ポート6543（Transaction Pooler）の場合のみ、pgbouncer=trueを必須とする
        if (urlObj.port === '6543') {
            urlObj.searchParams.set('pgbouncer', 'true');
        }

        // Serverless環境対策：接続数の制限
        // Connection Poolの枯渇を防ぐため、1インスタンスあたりの接続を最小限にする
        urlObj.searchParams.set('connection_limit', '1');

        // タイムアウトを少し長めに設定（デフォルトは確か10sだが念のため）
        urlObj.searchParams.set('connect_timeout', '10');

        return urlObj.toString();
    } catch (e) {
        // URLパースエラーなどの場合は元の文字列を返す（またはundefined）
        return url;
    }
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
