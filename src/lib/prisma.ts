
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 接続文字列を調整する関数
const getConnectionString = () => {
    // Vercel本番環境では DATABASE_URL (Port 6543) を優先して使用する
    // Serverless環境ではTransaction Poolerを経由すべきであるため
    let url = process.env.DATABASE_URL;

    // 開発環境でDIRECT_URLがあればそちらを使う（マイグレーション等用）
    if (process.env.NODE_ENV !== 'production' && process.env.DIRECT_URL) {
        url = process.env.DIRECT_URL;
    }

    if (!url) return undefined;

    try {
        const urlObj = new URL(url);

        // Port 6543 (Supavisor) の場合は pgbouncer=true が必須
        // Port 5432 (Session) の場合は pgbouncer=true をつけてはいけない
        if (urlObj.port === '6543') {
            urlObj.searchParams.set('pgbouncer', 'true');
        } else {
            urlObj.searchParams.delete('pgbouncer');
        }

        // タイムアウトを20秒に延長（デフォルト10秒だと厳しい場合がある）
        urlObj.searchParams.set('connect_timeout', '20');

        // connection_limit は明示的に設定せず、PrismaとSupavisorのデフォルトに任せる

        return urlObj.toString();
    } catch (e) {
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
