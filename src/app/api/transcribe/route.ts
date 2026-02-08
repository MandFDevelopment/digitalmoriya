
import { NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma";
import { supabase, supabaseAdmin } from "@/lib/supabaseClient";

// ヘルパー: DB操作用クライアントを取得
const getDbClient = () => supabaseAdmin || supabase;

// YouTubeのURLから動画IDを抽出
function extractVideoIdFromContent(content: string): string | null {
    const match = content.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

// Gemini APIでYouTube動画から文字起こし（既存ロジック踏襲）
async function transcribeYoutubeVideo(videoId: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { // 元コードの再現
                            file_data: {
                                mime_type: "video/mp4",
                                file_uri: videoUrl
                            }
                        },
                        {
                            text: `この動画の音声を日本語で文字起こししてください。
                            
以下のルールに従ってください：
1. 話者の発言をそのまま書き起こす
2. 「えー」「あのー」などのフィラーは適度に省略して読みやすくする
3. 句読点を適切に入れる
4. 内容ごとに段落分けして読みやすくする
5. 重要なポイントは箇条書きでまとめる

文字起こし結果のみを出力してください。`
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 8192,
                }
            })
        }
    );

    if (!response.ok) {
        const errorData = await response.json();
        console.error("Gemini API Error:", errorData);
        throw new Error(errorData.error?.message || "文字起こしに失敗しました");
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}


export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { documentId } = body;

        if (!documentId) {
            return NextResponse.json(
                { error: "ドキュメントIDが必要です" },
                { status: 400 }
            );
        }

        // ドキュメントを取得（HTTPS経由）
        const { data: doc, error: fetchError } = await getDbClient()
            .from('Document')
            .select('*')
            .eq('id', documentId)
            .single();

        if (fetchError || !doc) {
            return NextResponse.json(
                { error: "ドキュメントが見つかりません" },
                { status: 404 }
            );
        }

        // YouTube動画IDを抽出
        const videoId = extractVideoIdFromContent(doc.content);
        if (!videoId) {
            return NextResponse.json(
                { error: "YouTube動画IDが見つかりません" },
                { status: 400 }
            );
        }

        // Geminiで文字起こし
        console.log(`Transcribing video ${videoId}...`);

        let transcript = "";
        try {
            transcript = await transcribeYoutubeVideo(videoId);
        } catch (e) {
            throw e;
        }

        if (!transcript) {
            throw new Error("文字起こし結果が空でした");
        }

        // ドキュメントを更新（文字起こし結果を追記）
        const newContent = doc.content.replace(
            /---\n\n## 文字起こし[\s\S]*$/, // 既存の文字起こし部分があれば削除して置換
            ""
        ) + `\n\n---\n\n## 文字起こし\n\n${transcript}\n`;

        // HTTPS経由で更新
        const { error: updateError } = await getDbClient()
            .from('Document')
            .update({
                content: newContent,
                updatedAt: new Date().toISOString()
            })
            .eq('id', documentId);

        if (updateError) {
            throw new Error(updateError.message);
        }

        return NextResponse.json({
            success: true,
            message: "文字起こしが完了しました",
            transcriptLength: transcript.length,
        });

    } catch (error: any) {
        console.error("Transcribe API Error (Supabase HTTP):", error);

        // エラーメッセージの判定
        let errorMessage = error instanceof Error ? error.message : "文字起こしに失敗しました";
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

