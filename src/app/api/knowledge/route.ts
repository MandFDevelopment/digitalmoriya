
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import matter from "gray-matter";

// カテゴリ定義（バリデーション用）
const VALID_CATEGORIES = ["books", "strategies", "concepts", "seminars", "articles"];

// GET: ドキュメント一覧を取得
export async function GET() {
    try {
        const documents = await prisma.document.findMany({
            orderBy: {
                updatedAt: 'desc'
            }
        });

        // フロントエンドの形式に合わせて変換
        // idはDBのUUIDをそのまま使う
        const formattedDocs = documents.map(doc => ({
            id: doc.id,
            filename: doc.filename || "untitled",
            category: doc.category,
            title: doc.title,
            content: doc.content,
            updatedAt: doc.updatedAt.toISOString(),
            playlist: doc.playlist || undefined,
        }));

        return NextResponse.json({ documents: formattedDocs });
    } catch (error) {
        console.error("Knowledge API GET Error:", error);
        return NextResponse.json(
            { error: "ドキュメントの取得に失敗しました" },
            { status: 500 }
        );
    }
}

// POST: 新規ドキュメントを作成
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { category, filename, content } = body;

        if (!category || !filename || !content) {
            return NextResponse.json(
                { error: "カテゴリ、ファイル名、内容が必要です" },
                { status: 400 }
            );
        }

        if (!VALID_CATEGORIES.includes(category)) {
            return NextResponse.json(
                { error: "無効なカテゴリです" },
                { status: 400 }
            );
        }

        // ファイル名重複チェック
        // 同じカテゴリ内で同じファイル名は許可しない（従来の仕様踏襲）
        // ただしDB移行後はUUID管理なので、必須ではないがユーザー体験的に...
        // 今回はファイル名管理を緩くして、単純に作成する

        let title = filename;
        let playlistTitle = null;
        let playlistId = null;

        // Front Matterがあれば解析してメタデータを抽出
        try {
            const { data, content: mainContent } = matter(content);
            if (data.title) title = data.title;
            if (data.playlistTitle) playlistTitle = data.playlistTitle;
            if (data.playlistId) playlistId = data.playlistId;

            // Markdonw見出しからのタイトル抽出ロジックも入れる？
            // いったんシンプルに
        } catch (e) {
            // パースエラー時はそのまま
        }

        // titleが抽出できていなければMarkdownの見出しを探す
        const titleMatch = content.match(/^#\s+(.+)/m);
        if (titleMatch && title === filename) {
            title = titleMatch[1];
        }

        const newDoc = await prisma.document.create({
            data: {
                category,
                filename: filename.endsWith('.md') ? filename : `${filename}.md`,
                title,
                content: content, // 元のコンテンツをそのまま保存（Front Matter込み）
                playlist: playlistTitle,
                playlistId: playlistId,
            }
        });

        return NextResponse.json({
            success: true,
            id: newDoc.id,
            message: "ドキュメントを保存しました"
        });
    } catch (error) {
        console.error("Knowledge API POST Error:", error);
        return NextResponse.json(
            { error: "ドキュメントの保存に失敗しました" },
            { status: 500 }
        );
    }
}

// PUT: ドキュメントを更新
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, content } = body;

        if (!id || !content) {
            return NextResponse.json(
                { error: "IDと内容が必要です" },
                { status: 400 }
            );
        }

        // タイトルなどのメタデータを再解析して更新
        let title = "無題";
        let playlistTitle = null;

        try {
            const { data } = matter(content);
            if (data.title) title = data.title;
            if (data.playlistTitle) playlistTitle = data.playlistTitle;
        } catch (e) { }

        const titleMatch = content.match(/^#\s+(.+)/m);
        if (titleMatch && (title === "無題" || !title)) {
            title = titleMatch[1];
        }

        await prisma.document.update({
            where: { id },
            data: {
                content, // 内容更新
                title,   // タイトルも更新される可能性がある
                playlist: playlistTitle, // プレイリスト情報もあれば更新
                updatedAt: new Date()
            }
        });

        return NextResponse.json({
            success: true,
            message: "ドキュメントを更新しました"
        });
    } catch (error) {
        console.error("Knowledge API PUT Error:", error);
        return NextResponse.json(
            { error: "ドキュメントの更新に失敗しました" },
            { status: 500 }
        );
    }
}

// DELETE: ドキュメントを削除
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "IDが必要です" },
                { status: 400 }
            );
        }

        // DBから削除
        await prisma.document.delete({
            where: { id }
        });

        return NextResponse.json({
            success: true,
            message: "ドキュメントを削除しました"
        });
    } catch (error) {
        console.error("Knowledge API DELETE Error:", error);
        return NextResponse.json(
            { error: "ドキュメントの削除に失敗しました" },
            { status: 500 }
        );
    }
}
