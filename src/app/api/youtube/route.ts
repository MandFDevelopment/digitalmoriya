
import { NextRequest, NextResponse } from "next/server";
// import { prisma } from "@/lib/prisma";
import { supabase, supabaseAdmin } from "@/lib/supabaseClient";

// ヘルパー: DB操作用クライアントを取得
const getDbClient = () => supabaseAdmin || supabase;

// YouTubeのURLから動画IDを抽出
function extractVideoId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

// 再生リストIDを抽出
function extractPlaylistId(url: string): string | null {
    const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

// 再生リストから動画一覧を取得
async function getPlaylistVideos(playlistId: string): Promise<{ title: string; videos: { videoId: string; title: string }[] }> {
    try {
        const response = await fetch(
            `https://www.youtube.com/playlist?list=${playlistId}`,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept-Language": "ja-JP,ja;q=0.9",
                },
            }
        );

        if (!response.ok) {
            throw new Error("再生リストの取得に失敗しました");
        }

        const html = await response.text();

        // ytInitialData から動画情報を抽出
        const startMarker = "var ytInitialData = ";
        const startIdx = html.indexOf(startMarker);
        if (startIdx === -1) {
            throw new Error("動画情報の解析に失敗しました");
        }

        const jsonStart = startIdx + startMarker.length;
        let depth = 0;
        let jsonEnd = jsonStart;

        for (let i = jsonStart; i < html.length; i++) {
            if (html[i] === "{") depth++;
            else if (html[i] === "}") depth--;

            if (depth === 0) {
                jsonEnd = i + 1;
                break;
            }
        }

        const jsonStr = html.slice(jsonStart, jsonEnd);
        const data = JSON.parse(jsonStr);
        const videoList: { videoId: string; title: string }[] = [];

        // 再生リストのタイトル取得
        const playlistTitle = data?.header?.playlistHeaderRenderer?.title?.simpleText || "YouTube Playlist";

        const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
            ?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
            ?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;

        if (contents) {
            for (const item of contents) {
                const videoRenderer = item.playlistVideoRenderer;
                if (videoRenderer) {
                    videoList.push({
                        videoId: videoRenderer.videoId,
                        title: videoRenderer.title?.runs?.[0]?.text || "無題",
                    });
                }
            }
        }

        return { title: playlistTitle, videos: videoList };
    } catch (error) {
        console.error("Playlist fetch error:", error);
        return { title: "YouTube Playlist", videos: [] };
    }
}

// 動画情報を取得（説明文含む）
async function getVideoInfo(videoId: string): Promise<{ title: string; description: string } | null> {
    try {
        const response = await fetch(
            `https://www.youtube.com/watch?v=${videoId}`,
            {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept-Language": "ja-JP,ja;q=0.9",
                },
            }
        );

        if (!response.ok) return null;

        const html = await response.text();

        // タイトル抽出
        const titleMatch = html.match(/<title>(.+?) - YouTube<\/title>/);
        const title = titleMatch ? titleMatch[1] : "無題";

        // 説明文抽出
        const descMatch = html.match(/"shortDescription":"([^"]+)"/);
        let description = "";
        if (descMatch) {
            description = descMatch[1]
                .replace(/\\n/g, "\n")
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\");
        }

        return { title, description };
    } catch (error) {
        console.error("Video info error:", error);
        return null;
    }
}

// Markdownに変換
function formatVideoToMarkdown(
    videoId: string,
    title: string,
    description: string,
    playlistId?: string,
    playlistTitle?: string
): string {
    const frontmatter = [
        "---",
        `title: "${title.replace(/"/g, '\\"')}"`,
        `source: "https://www.youtube.com/watch?v=${videoId}"`,
        playlistId ? `playlistId: "${playlistId}"` : null,
        playlistTitle ? `playlistTitle: "${playlistTitle.replace(/"/g, '\\"')}"` : null,
        "---",
        "",
    ].filter(Boolean).join("\n");

    return `${frontmatter}# ${title}

## 出典
YouTube動画: https://www.youtube.com/watch?v=${videoId}
${playlistTitle ? `再生リスト: ${playlistTitle}` : ""}

---

${description || "（説明文なし）"}
`;
}

// ドキュメントをDBに保存または更新（HTTPS経由）
async function saveVideoToDb(args: {
    category: string;
    videoId: string;
    title: string;
    content: string;
    playlistTitle?: string;
    playlistId?: string;
}) {
    const { category, videoId, title, content, playlistTitle, playlistId } = args;
    const filename = `youtube_${videoId}.md`;
    const source = `https://www.youtube.com/watch?v=${videoId}`;

    // 既存のドキュメントを確認
    const { data: existing } = await getDbClient()
        .from('Document')
        .select('*')
        .match({ filename, category })
        .single();

    if (existing) {
        // 更新
        const { error } = await getDbClient()
            .from('Document')
            .update({
                title,
                content,
                source,
                playlist: playlistTitle || null,
                playlistId: playlistId || null,
                updatedAt: new Date().toISOString()
            })
            .eq('id', existing.id);

        if (error) throw new Error(error.message);
        return existing;
    } else {
        // 新規作成
        const { data: newDoc, error } = await getDbClient()
            .from('Document')
            .insert({
                title,
                content,
                category,
                filename,
                source,
                playlist: playlistTitle || null,
                playlistId: playlistId || null,
                updatedAt: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw new Error(error.message);
        return newDoc;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { url, category, singleVideo } = body;

        if (!url) {
            return NextResponse.json(
                { error: "URLが必要です" },
                { status: 400 }
            );
        }

        if (!category) {
            return NextResponse.json(
                { error: "カテゴリが必要です" },
                { status: 400 }
            );
        }

        const results: { title: string; success: boolean; error?: string }[] = [];

        if (singleVideo) {
            // 単一動画の処理
            const videoId = extractVideoId(url);
            if (!videoId) {
                return NextResponse.json(
                    { error: "有効なYouTube URLを入力してください" },
                    { status: 400 }
                );
            }

            try {
                const info = await getVideoInfo(videoId);
                if (!info) {
                    throw new Error("動画情報の取得に失敗");
                }

                const markdown = formatVideoToMarkdown(videoId, info.title, info.description);

                await saveVideoToDb({
                    category,
                    videoId,
                    title: info.title,
                    content: markdown
                    // 単一動画の場合、playlist情報はなし
                });

                results.push({ title: info.title, success: true });
            } catch (error) {
                results.push({
                    title: videoId,
                    success: false,
                    error: error instanceof Error ? error.message : "取得に失敗",
                });
            }
        } else {
            // 再生リストの処理
            const playlistId = extractPlaylistId(url);
            if (!playlistId) {
                const videoId = extractVideoId(url);
                if (videoId) {
                    return NextResponse.json(
                        { error: "再生リストURLを入力するか、単一動画モードを使用してください" },
                        { status: 400 }
                    );
                }
                return NextResponse.json(
                    { error: "有効なYouTube再生リストURLを入力してください" },
                    { status: 400 }
                );
            }

            // 再生リスト情報を取得
            const { title: playlistTitle, videos } = await getPlaylistVideos(playlistId);

            if (videos.length === 0) {
                return NextResponse.json(
                    { error: "再生リストから動画を取得できませんでした" },
                    { status: 400 }
                );
            }

            // 各動画の情報を取得（全件）
            for (let i = 0; i < videos.length; i++) {
                const video = videos[i];
                try {
                    const info = await getVideoInfo(video.videoId);
                    if (!info) {
                        throw new Error("動画情報の取得に失敗");
                    }

                    const markdown = formatVideoToMarkdown(
                        video.videoId,
                        info.title || video.title,
                        info.description,
                        playlistId,
                        playlistTitle
                    );

                    await saveVideoToDb({
                        category,
                        videoId: video.videoId,
                        title: info.title || video.title,
                        content: markdown,
                        playlistTitle,
                        playlistId
                    });

                    results.push({ title: info.title || video.title, success: true });
                } catch (error) {
                    results.push({
                        title: video.title,
                        success: false,
                        error: error instanceof Error ? error.message : "取得に失敗",
                    });
                }

                // レート制限対策（1秒待機）
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        return NextResponse.json({
            success: true,
            message: `${successCount}件の動画を登録しました${failCount > 0 ? `（${failCount}件失敗）` : ""}`,
            results,
        });

    } catch (error: any) {
        console.error("YouTube API Error (Supabase HTTP):", error);
        return NextResponse.json(
            { error: `YouTubeからの取得に失敗しました: ${error.message || error}` },
            { status: 500 }
        );
    }
}

