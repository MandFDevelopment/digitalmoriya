
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 接続文字列を調整する関数
const getConnectionString = () => {
    // まずDATABASE_URLを取得
    let url = process.env.DATABASE_URL;

    // 開発環境でDIRECT_URLがあればそちらを使う（マイグレーション等用）
    if (process.env.NODE_ENV !== 'production' && process.env.DIRECT_URL) {
        url = process.env.DIRECT_URL;
    }

    if (!url) return undefined;

    try {
        const urlObj = new URL(url);

        // Vercel環境（Production）の場合、強制的にTransaction Pooler (6543) を使う
        if (process.env.NODE_ENV === 'production') {
            // ホスト名が supabase.co を含む場合のみ適用（念のため）
            if (urlObj.hostname.includes('supabase.co') || urlObj.hostname.includes('supabase.com')) {
                // ポートを6543に強制変更
                urlObj.port = '6543';
                // pgbouncer=true を強制付与
                urlObj.searchParams.set('pgbouncer', 'true');
                // 接続タイムアウト延長
                urlObj.searchParams.set('connect_timeout', '20');
                // 接続数制限（Serverlessなので都度切断される前提だが、安全策として）
                urlObj.searchParams.set('connection_limit', '1');
            }
        }

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
