
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// @prisma/adapter-pg は Prepared Statements を使用するため
// Supabase Transaction Mode (6543) ではなく Session Mode (5432) = DIRECT_URL を使用する必要がある
const connectionString = `${process.env.DIRECT_URL || process.env.DATABASE_URL}`;

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// プールとアダプターの作成関数
const createPrismaClient = () => {
    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
