import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import * as dotenv from 'dotenv';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// .envを読み込む
dotenv.config();

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ナレッジベースのパス
const KNOWLEDGE_BASE_PATH = path.join(process.cwd(), "..", "knowledge_data");

// カテゴリとフォルダのマッピング
const CATEGORY_FOLDERS: Record<string, string> = {
    books: "books",
    strategies: "strategies",
    concepts: "concepts",
    seminars: "seminars",
    articles: "articles",
};

// Markdownからタイトルを抽出
function extractTitle(content: string, filename: string): string {
    const match = content.match(/^#\s+(.+)/m);
    if (match) {
        return match[1];
    }
    return filename.replace(/\.md$/, "").replace(/_/g, " ");
}

async function main() {
    console.log("Starting migration...");

    try {
        // 全カテゴリをループ
        for (const [category, folder] of Object.entries(CATEGORY_FOLDERS)) {
            const folderPath = path.join(KNOWLEDGE_BASE_PATH, folder);

            if (!fs.existsSync(folderPath)) {
                console.log(`Folder not found: ${folderPath}`);
                continue;
            }

            const files = fs.readdirSync(folderPath);
            console.log(`Processing category: ${category} (${files.length} files)`);

            for (const file of files) {
                if (!file.endsWith(".md")) continue;

                const filePath = path.join(folderPath, file);

                try {
                    const fileContent = fs.readFileSync(filePath, "utf-8");
                    const stats = fs.statSync(filePath);

                    // Front Matterをパース
                    const { data, content } = matter(fileContent);

                    // タイトル取得（Front Matter > Markdown見出し > ファイル名）
                    const title = data.title || extractTitle(content, file);

                    // 重複チェック
                    const existing = await prisma.document.findFirst({
                        where: {
                            filename: file,
                            category: category
                        }
                    });

                    if (existing) {
                        // 既に存在する場合はスキップ（更新する場合はここを書き換える）
                        console.log(`Skipping existing file: ${file}`);

                        // 更新ロジックを入れるなら以下のように
                        /*
                        await prisma.document.update({
                            where: { id: existing.id },
                            data: {
                                title,
                                content,
                                source: data.source || null,
                                playlist: data.playlistTitle || null,
                                playlistId: data.playlistId || null,
                                updatedAt: stats.mtime
                            }
                        });
                        */
                        continue;
                    }

                    // 新規作成
                    await prisma.document.create({
                        data: {
                            title: title,
                            content: content, // Front Matterを除いた本文
                            category: category,
                            filename: file,
                            source: data.source || null,
                            playlist: data.playlistTitle || null,
                            playlistId: data.playlistId || null,
                            createdAt: stats.birthtime,
                            updatedAt: stats.mtime
                        }
                    });
                    console.log(`Imported: ${file}`);

                } catch (err) {
                    console.error(`Error reading/processing file ${file}:`, err);
                }
            }
        }
    } catch (error) {
        console.error("Migration fatal error:", error);
    }

    console.log("Migration completed.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
