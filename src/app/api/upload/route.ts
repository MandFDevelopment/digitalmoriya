
// Vercel Serverless Function Config
export const maxDuration = 60; // 60秒（Hobbyプラン最大）
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma";
import { supabase, supabaseAdmin } from "@/lib/supabaseClient";
import path from "path";

// Polyfill for DOMMatrix in Node.js environment (for pdf-parse)
if (typeof global.DOMMatrix === 'undefined') {
    // @ts-ignore
    global.DOMMatrix = class DOMMatrix {
        constructor() {
            // @ts-ignore
            this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        }
        // 必要に応じてメソッドを追加
    };
}

// ヘルパー: DB操作用クライアントを取得
const getDbClient = () => supabaseAdmin || supabase;

// サポートするファイル拡張子
const SUPPORTED_TEXT_EXTENSIONS = [".txt", ".md", ".markdown"];

// Gemini APIを使ってPDFからテキストを抽出（モデル変更＆エラーハンドリング強化）
async function extractTextFromPdfWithGemini(buffer: Buffer): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;

    // APIキーがない場合、またはGeminiでの解析に失敗した場合はpdf-parseにフォールバック
    if (!apiKey) {
        console.warn("GEMINI_API_KEY is not set, falling back to pdf-parse");
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        // @ts-ignore: pdf-parse type definition might be incorrect regarding default export
        const pdfData = await pdfParse(buffer);
        return pdfData.text;
    }

    // Base64エンコード
    const base64Pdf = buffer.toString("base64");

    try {
        // モデルを安定版の gemini-1.5-flash に変更
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    inline_data: {
                                        mime_type: "application/pdf",
                                        data: base64Pdf,
                                    },
                                },
                                {
                                    text: `このPDFドキュメントのテキスト内容を正確に抽出してください。
以下のルールに従ってください：
1. PDFの本文テキストをそのまま抽出する
2. 見出しは # や ## などのMarkdown形式に変換する
3. 箇条書きは - で表現する
4. 表は可能な限りMarkdownテーブル形式に変換する
5. 余計な解説や要約は不要、原文のテキストをそのまま出力
6. ページ番号やヘッダー・フッターは省略可能

抽出したテキストのみを出力してください。`,
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 8192,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error (Status " + response.status + "):", errorData);
            throw new Error(`Gemini API Error: ${response.status}`);
        }

        const data = await response.json();
        const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!extractedText) {
            throw new Error("Gemini returned empty text");
        }

        return extractedText;

    } catch (error) {
        console.warn("Gemini extraction failed, falling back to pdf-parse:", error);
        // Geminiが失敗したら pdf-parse で抽出
        try {
            const pdfParseModule = await import("pdf-parse");
            const pdfParse = (pdfParseModule as any).default || pdfParseModule;
            // @ts-ignore: pdf-parse type definition might be incorrect
            const pdfData = await pdfParse(buffer);
            return pdfData.text;
        } catch (fallbackError: any) {
            console.error("Fallback PDF extraction failed:", fallbackError);
            // Geminiエラーとフォールバックエラーの両方を含める
            const geminiErrorMessage = error instanceof Error ? error.message : String(error);
            const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            throw new Error(`AI解析エラー: [${geminiErrorMessage}] / 標準解析エラー: [${fallbackErrorMessage}]`);
        }
    }
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const category = formData.get("category") as string;
        const title = formData.get("title") as string;

        if (!file) {
            return NextResponse.json(
                { error: "ファイルが必要です" },
                { status: 400 }
            );
        }

        if (!category) {
            return NextResponse.json(
                { error: "カテゴリが必要です" },
                { status: 400 }
            );
        }

        // ファイル拡張子チェック
        const fileName = file.name.toLowerCase();
        const ext = path.extname(fileName);
        const isPdf = ext === ".pdf";
        const isTextFile = SUPPORTED_TEXT_EXTENSIONS.includes(ext);

        if (!isPdf && !isTextFile) {
            return NextResponse.json(
                { error: `サポートされていないファイル形式です。対応形式: PDF, TXT, MD` },
                { status: 400 }
            );
        }

        // ファイル内容を読み込み
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let content: string;

        if (isPdf) {
            // PDFの場合はGemini APIでテキスト抽出
            try {
                // ファイルシステムへの保存は行わない（Vercel等のServerless環境では永続化できないため）
                // Gemini APIへはBase64で送信する
                content = await extractTextFromPdfWithGemini(buffer);
            } catch (error: any) {
                console.error("PDF extraction error:", error);
                return NextResponse.json(
                    { error: `PDFの解析に失敗しました詳細: ${error.message}` },
                    { status: 500 }
                );
            }
        } else {
            // テキストファイルの場合は直接読み込み
            content = buffer.toString("utf-8");
        }

        if (!content.trim()) {
            return NextResponse.json(
                { error: "ファイルの内容が空です" },
                { status: 400 }
            );
        }

        // タイトルを決定
        const docTitle = title || file.name.replace(/\.(pdf|txt|md|markdown)$/i, "");

        // Markdownファイルとして保存するためのフォーマット
        let markdownContent = content;

        // タイトルがなければ追加
        if (!content.trim().startsWith("#")) {
            markdownContent = `# ${docTitle}

## 出典
ファイル: ${file.name}
アップロード日: ${new Date().toLocaleDateString("ja-JP")}

---

${content}
`;
        }

        // DBに保存
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.(pdf|txt|markdown)$/i, ".md");
        const mdFilename = safeFilename.endsWith(".md") ? safeFilename : `${safeFilename}.md`;

        // DBで重複チェック（HTTPS経由）
        const { data: existing } = await getDbClient()
            .from('Document')
            .select('*')
            .match({ filename: mdFilename, category })
            .single();

        let newDocId;
        if (existing) {
            // 更新
            const { error } = await getDbClient()
                .from('Document')
                .update({
                    title: docTitle,
                    content: markdownContent,
                    updatedAt: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw new Error(error.message);
            newDocId = existing.id;
        } else {
            // 新規作成
            const { data: newDoc, error } = await getDbClient()
                .from('Document')
                .insert({
                    id: crypto.randomUUID(), // IDを明示的に生成
                    title: docTitle,
                    content: markdownContent,
                    category,
                    filename: mdFilename,
                    updatedAt: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw new Error(error.message);
            newDocId = newDoc.id;
        }

        return NextResponse.json({
            success: true,
            message: isPdf ? "PDFをアップロードしました" : "ファイルをアップロードしました",
            document: {
                id: newDocId,
                title: docTitle,
                category,
                textLength: content.length,
            },
        });
    } catch (error: any) {
        console.error("Upload API Error (Supabase HTTP):", error);

        let errorMessage = error instanceof Error ? error.message : "アップロードに失敗しました";
        let status = 500;

        if (errorMessage.includes("Quota exceeded") || errorMessage.includes("429")) {
            errorMessage = "AIサービスの利用制限（短時間の集中アクセス）に達しました。1〜2分待ってから再度お試しください。";
            status = 429;
        }

        return NextResponse.json(
            { error: errorMessage },
            { status }
        );
    }
}

