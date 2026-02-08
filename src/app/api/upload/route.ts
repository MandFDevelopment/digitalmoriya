
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";

// サポートするファイル拡張子
const SUPPORTED_TEXT_EXTENSIONS = [".txt", ".md", ".markdown"];

// Gemini APIを使ってPDFからテキストを抽出（変更なし）
async function extractTextFromPdfWithGemini(buffer: Buffer): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
    }

    // Base64エンコード
    const base64Pdf = buffer.toString("base64");

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
        console.error("Gemini API Error:", errorData);
        throw new Error("PDFの解析に失敗しました");
    }

    const data = await response.json();
    const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
        throw new Error("テキストを抽出できませんでした");
    }

    return extractedText;
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
            } catch (error) {
                console.error("PDF extraction error:", error);
                return NextResponse.json(
                    { error: "PDFの解析に失敗しました。再度お試しください。" },
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

        // DBで重複チェック
        const existing = await prisma.document.findFirst({
            where: {
                filename: mdFilename,
                category
            }
        });

        let newDoc;
        if (existing) {
            // 更新
            newDoc = await prisma.document.update({
                where: { id: existing.id },
                data: {
                    title: docTitle,
                    content: markdownContent,
                    updatedAt: new Date()
                }
            });
        } else {
            // 新規作成
            newDoc = await prisma.document.create({
                data: {
                    title: docTitle,
                    content: markdownContent,
                    category,
                    filename: mdFilename,
                }
            });
        }

        return NextResponse.json({
            success: true,
            message: isPdf ? "PDFをアップロードしました" : "ファイルをアップロードしました",
            document: {
                id: newDoc.id,
                title: docTitle,
                category,
                textLength: content.length,
            },
        });
    } catch (error) {
        console.error("Upload API Error:", error);
        return NextResponse.json(
            { error: "アップロードに失敗しました" },
            { status: 500 }
        );
    }
}
