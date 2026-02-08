
import { NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma"; // TCP接続は廃止
import { supabase, supabaseAdmin } from "@/lib/supabaseClient";
import matter from "gray-matter";

// カテゴリ定義（バリデーション用）
const VALID_CATEGORIES = ["books", "strategies", "concepts", "seminars", "articles"];

// ヘルパー: DB操作用クライアントを取得（AdminがあればAdmin、なければ通常）
const getDbClient = () => supabaseAdmin || supabase;

// GET: ドキュメント一覧を取得
export async function GET() {
    try {
        // HTTPS経由でSupabaseからデータ取得
        const { data: documents, error } = await getDbClient()
            .from('Document')
            .select('*')
            .order('updatedAt', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        if (!documents) {
            return NextResponse.json({ documents: [] });
        }

        // フロントエンドの形式に合わせて変換
        const formattedDocs = documents.map(doc => ({
            id: doc.id,
            filename: doc.filename || "untitled",
            category: doc.category,
            title: doc.title,
            content: doc.content,
            updatedAt: new Date(doc.updatedAt).toISOString(),
            playlist: doc.playlist || undefined,
        }));

        return NextResponse.json({ documents: formattedDocs });
    } catch (error: any) {
        console.error("Knowledge API GET Error (Supabase HTTP):", error);
        return NextResponse.json(
            { error: `ドキュメントの取得に失敗しました: ${error.message || error}` },
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

        let title = filename;
        let playlistTitle = null;
        let playlistId = null;

        try {
            const { data } = matter(content);
            if (data.title) title = data.title;
            if (data.playlistTitle) playlistTitle = data.playlistTitle;
            if (data.playlistId) playlistId = data.playlistId;
        } catch (e) { }

        const titleMatch = content.match(/^#\s+(.+)/m);
        if (titleMatch && title === filename) {
            title = titleMatch[1];
        }

        // HTTPS経由で保存
        const { data: newDoc, error } = await getDbClient()
            .from('Document')
            .insert({
                id: crypto.randomUUID(), // IDを明示的に生成
                category,
                filename: filename.endsWith('.md') ? filename : `${filename}.md`,
                title,
                content: content,
                playlist: playlistTitle,
                playlistId: playlistId,
                updatedAt: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            throw new Error(error.message);
        }

        return NextResponse.json({
            success: true,
            id: newDoc.id,
            message: "ドキュメントを保存しました"
        });
    } catch (error: any) {
        console.error("Knowledge API POST Error (Supabase HTTP):", error);
        return NextResponse.json(
            { error: `ドキュメントの保存に失敗しました: ${error.message || error}` },
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

        // HTTPS経由で更新
        const { error } = await getDbClient()
            .from('Document')
            .update({
                content,
                title,
                playlist: playlistTitle,
                updatedAt: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            throw new Error(error.message);
        }

        return NextResponse.json({
            success: true,
            message: "ドキュメントを更新しました"
        });
    } catch (error: any) {
        console.error("Knowledge API PUT Error (Supabase HTTP):", error);
        return NextResponse.json(
            { error: `ドキュメントの更新に失敗しました: ${error.message || error}` },
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

        // HTTPS経由で削除
        const { error } = await getDbClient()
            .from('Document')
            .delete()
            .eq('id', id);

        if (error) {
            throw new Error(error.message);
        }

        return NextResponse.json({
            success: true,
            message: "ドキュメントを削除しました"
        });
    } catch (error: any) {
        console.error("Knowledge API DELETE Error (Supabase HTTP):", error);
        return NextResponse.json(
            { error: `ドキュメントの削除に失敗しました: ${error.message || error}` },
            { status: 500 }
        );
    }
}

