
import { prisma } from "@/lib/prisma";

export interface SearchResult {
    file: string;
    title: string;
    content: string;
    relevance: number;
    category?: string;
}

/**
 * ナレッジベースからキーワードに関連するドキュメントを検索
 */
export async function searchKnowledgeBase(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    try {
        // 全ドキュメントを取得（将来的に件数が増えたらWHERE句で絞り込み等を検討）
        // contentも取得するためデータ量が大きくなる可能性はあるが、
        // 現状の規模なら許容範囲と想定。
        const documents = await prisma.document.findMany();

        for (const doc of documents) {
            const score = calculateRelevance(query, doc.content || "", doc.title || "");

            if (score > 0) {
                results.push({
                    file: doc.filename || doc.id, // ファイル名の代わりにIDまたはファイル名を使用
                    title: doc.title,
                    content: doc.content,
                    relevance: score,
                    category: mapCategoryName(doc.category),
                });
            }
        }

        // 関連度順にソート
        results.sort((a, b) => b.relevance - a.relevance);

        // 上位4件を返す
        return results.slice(0, 4);

    } catch (error) {
        console.error("Search knowledge base error:", error);
        return [];
    }
}

/**
 * カテゴリIDを日本語名に変換
 */
function mapCategoryName(categoryId: string): string {
    const map: Record<string, string> = {
        "strategies": "投資戦略",
        "concepts": "基本概念",
        "books": "守屋の著書・哲学",
        "seminars": "セミナー資料",
        "articles": "記事・コラム",
        ".": "その他"
    };
    return map[categoryId] || categoryId;
}

/**
 * クエリとコンテンツの関連度を計算
 */
function calculateRelevance(query: string, content: string, title: string): number {
    const queryWords = query.toLowerCase().replace(/[、。！？\?]/g, " ").split(/\s+/).filter(w => w.length > 0);
    const contentLower = content.toLowerCase();
    const titleLower = title.toLowerCase();

    let score = 0;

    for (const word of queryWords) {
        // タイトルに含まれる場合は高得点
        if (titleLower.includes(word)) {
            score += 10;
        }

        // 本文に含まれる回数をカウント
        const matches = (contentLower.match(new RegExp(escapeRegExp(word), "g")) || []).length;
        score += matches;
    }

    return score;
}

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * 検索結果をプロンプト用のコンテキストに変換
 */
export function formatSearchResultsForPrompt(results: SearchResult[]): string {
    if (results.length === 0) {
        return "";
    }

    let context = "【以下の守屋史章の知識ベース（出典）を参考にして回答してください】\n\n";

    for (const result of results) {
        // コンテンツを要約（最初の1500文字まで）
        const summary = result.content.slice(0, 1500);
        context += `--- 出典: ${result.title} (${result.category}) ---\n${summary}\n\n`;
    }

    context += "---\n上記の内容（出典）をもとに、守屋史章として自然に回答してください。\n回答の際は「資料によると」などの表現は避け、自分の知識として語ってください。\n";

    return context;
}
