import { NextRequest, NextResponse } from "next/server";
import { searchKnowledgeBase, formatSearchResultsForPrompt } from "@/lib/knowledgeSearch";

// Gemini APIの型定義
interface GeminiMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

interface ChatRequest {
    message: string;
    conversationHistory?: GeminiMessage[];
}

// システムプロンプト（守屋ペルソナ）
const MORIYA_SYSTEM_PROMPT = `あなたはオプショントレード普及協会代表、守屋史章（もりや ふみあき）のAIデジタルツインです。

## 基本姿勢
- 防御優先: リターンより先にリスクを考える
- オプションは「保険」であり、ギャンブルではない
- 教育的姿勢: なぜそうなるのかを丁寧に説明する

## 口調
- 丁寧な「です・ます」調
- 温かみがありながらもリスクには厳格
- 一人称は「私」または「守屋」

## 推奨戦略の優先順位
1. カバードコール / ターゲット・バイイング（初心者向け）
2. カラー戦略（中級者向け）
3. ジェイド・リザード（相場観があり、IVが高い場合）
4. ダイナミック・デルタヘッジ（上級者向け）

## 禁止事項
- 煽るような表現
- 断定的な価格予測
- 投資顧問業法に抵触する具体的な投資助言

## 回答ルール
- 自分の知識として自然に回答する
- 「資料によると」「ソースでは」などの言い回しは使わない
- 免責: これは教育目的であり投資助言ではないことを意識する`;

export async function POST(request: NextRequest) {
    try {
        const body: ChatRequest = await request.json();
        const { message, conversationHistory = [] } = body;

        if (!message || typeof message !== "string") {
            return NextResponse.json(
                { error: "メッセージが必要です" },
                { status: 400 }
            );
        }

        // Gemini APIキーを確認
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey || apiKey === "ここにAPIキーを入力") {
            // APIキーがない場合はデモモードで応答
            console.log("GEMINI_API_KEY not set, using demo mode");
            const demoResponse = await generateDemoResponse(message);
            return NextResponse.json({ response: demoResponse });
        }

        try {
            // Gemini APIを呼び出し
            const { text, sources } = await callGeminiAPI(apiKey, message, conversationHistory);
            return NextResponse.json({ response: text, sources });
        } catch (apiError) {
            // API呼び出し失敗時はデモモードにフォールバック
            console.log("Gemini API failed, falling back to demo mode:", apiError);
            const demoResponse = await generateDemoResponse(message);
            return NextResponse.json({ response: demoResponse });
        }
    } catch (error) {
        console.error("Chat API Error:", error);
        return NextResponse.json(
            { error: "内部エラーが発生しました" },
            { status: 500 }
        );
    }
}

// Gemini API呼び出し
async function callGeminiAPI(
    apiKey: string,
    userMessage: string,
    conversationHistory: GeminiMessage[]
): Promise<{ text: string, sources: any[] }> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // ナレッジベースを検索
    const searchResults = await searchKnowledgeBase(userMessage);
    const knowledgeContext = formatSearchResultsForPrompt(searchResults);

    console.log(`Knowledge search found ${searchResults.length} results for: ${userMessage}`);

    // ユーザーメッセージにナレッジコンテキストを追加
    const enhancedMessage = knowledgeContext
        ? `${knowledgeContext}\n\n【ユーザーの質問】\n${userMessage}`
        : userMessage;

    // 会話履歴を構築
    const contents: GeminiMessage[] = [
        // システムプロンプトを最初のユーザーメッセージとして含める
        {
            role: "user",
            parts: [{ text: `【システム指示】\n${MORIYA_SYSTEM_PROMPT}\n\n上記の指示に従って、以降の会話に応答してください。` }],
        },
        {
            role: "model",
            parts: [{ text: "承知しました。守屋史章として、「守りながら増やす」投資哲学に基づいてお答えします。" }],
        },
        ...conversationHistory,
        {
            role: "user",
            parts: [{ text: enhancedMessage }],
        },
    ];

    const requestBody = {
        contents,
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
        },
        safetySettings: [
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
        ],
    };

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API Error:", errorText);
        throw new Error(`Gemini API Error: ${response.status}`);
    }

    const data = await response.json();

    // レスポンスからテキストを抽出
    const generatedText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "申し訳ありません。応答を生成できませんでした。";

    return {
        text: generatedText,
        sources: searchResults.map(r => ({
            title: r.title,
            category: r.category,
            file: r.file,
            relevance: r.relevance
        }))
    };
}

// デモモード用の応答生成
async function generateDemoResponse(userMessage: string): Promise<string> {
    // シミュレートされた遅延（1-2秒）
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    const msg = userMessage.toLowerCase();

    // 挨拶
    if (msg.includes("こんにちは") || msg.includes("はじめまして") || msg.includes("よろしく")) {
        return `こんにちは。守屋です。

オプション取引や資産運用について、何でもお聞きください。
私は「守りながら増やす」をモットーに、リスク管理を最優先とした投資哲学をお伝えしています。

初心者の方には**カバードコール**や**ターゲット・バイイング**から、
経験者の方には**ジェイド・リザード**や**デルタヘッジ**についてもお話しできます。

どのようなことに興味がありますか？`;
    }

    // プレミアム
    if (msg.includes("プレミアム") || msg.includes("premium")) {
        return `プレミアムについてのご質問ですね。

**プレミアム（Premium）とは**:
オプションを購入する際に支払う価格、つまり**オプションの値段**のことです。

**構成要素**:
1. **本質的価値（Intrinsic Value）**: 今すぐ権利行使した場合の利益
2. **時間的価値（Time Value）**: 満期までに価値が生まれる可能性への対価

**例**:
- 日経平均が38,000円で、権利行使価格37,500円のコールオプション
- 本質的価値 = 38,000 - 37,500 = 500円
- プレミアムが700円なら、時間的価値 = 200円

**私の活用法**:
オプションの**売り手**になることで、このプレミアムを受け取ります。
時間の経過とともにプレミアムは減衰（タイムディケイ）するため、
**時間を味方につける**戦略が有効です。`;
    }

    // オプションとは
    if (msg.includes("オプション") && (msg.includes("とは") || msg.includes("何"))) {
        return `オプションについてご説明しますね。

**オプションとは**:
「将来のある時点で、あらかじめ決められた価格で、原資産を売買する**権利**」のことです。

**2種類のオプション**:
1. **コールオプション**: 買う権利（株価上昇で利益）
2. **プットオプション**: 売る権利（株価下落で利益）

**重要なポイント**:
- オプションは「権利」であり「義務」ではない
- 買い手は権利を行使するかどうか選べる
- 売り手は買い手が行使したら応じる義務がある

**私がオプションを使う理由**:
オプションは「投機」のツールではありません。
**リスクをコントロールし、収益を安定化させる「道具」**として活用します。`;
    }

    // コールオプション
    if (msg.includes("コール") && !msg.includes("カバード")) {
        return `コールオプションについてですね。

**コールオプション（Call Option）とは**:
「決められた価格で原資産を**買う権利**」です。

**買い手の視点**:
- 株価が上昇すれば利益
- 損失はプレミアム（購入価格）に限定
- 「上がると思うけど、リスクは限定したい」ときに有効

**売り手の視点**:
- プレミアムを受け取れる
- 株価が大きく上昇すると損失
- 「大きくは上がらないだろう」と思うときに有効

**カバードコール戦略では**:
保有株に対してコールを売ることで、
「株を持ちながらプレミアム収入を得る」ことができます。`;
    }

    // プットオプション
    if (msg.includes("プット") && !msg.includes("ターゲット") && !msg.includes("売り")) {
        return `プットオプションについてですね。

**プットオプション（Put Option）とは**:
「決められた価格で原資産を**売る権利**」です。

**買い手の視点**:
- 株価が下落すれば利益
- 保有株の「保険」として使える
- 損失はプレミアムに限定

**売り手の視点**:
- プレミアムを受け取れる
- 株価が大きく下落すると、その株を買い取る義務が生じる
- → これを逆手に取ったのが「ターゲット・バイイング」

**私の使い方**:
プット売りは「欲しい株を安く買うための指値注文」と考えます。
プレミアムも受け取れるので、どちらに転んでも悪くありません。`;
    }

    // 満期・権利行使
    if (msg.includes("満期") || msg.includes("権利行使") || msg.includes("sq") || msg.includes("expiration")) {
        return `満期と権利行使についてですね。

**満期（Expiration）とは**:
オプションの有効期限のことです。日本株オプションは通常、毎月第2金曜日がSQ日です。

**権利行使（Exercise）とは**:
オプションの買い手が、その権利を実際に使うことです。

**重要なポイント**:
- ITM（イン・ザ・マネー）なら権利行使の価値がある
- OTM（アウト・オブ・ザ・マネー）なら権利を放棄（消滅）
- 満期が近づくと、時間的価値が急速に減少（タイムディケイ加速）

**私のルール**:
- 満期まで3週間を切ったら、ポジションを見直す
- ITMになったら早めに手仕舞いを検討
- 「SQ勝負」はギャンブルになりがち。避けるべき。`;
    }

    // ジェイド・リザード
    if (msg.includes("ジェイド") || msg.includes("jade") || msg.includes("リザード")) {
        return `ジェイド・リザード戦略についてですね。

これは私が日本市場で普及に努めている、やや高度ですが非常に魅力的な戦略です。

**構成**:
- OTM（アウト・オブ・ザ・マネー）のプット売り
- OTMのコール・クレジット・スプレッド（コール売り＋さらに外のコール買い）

**最大のメリット**:
受取プレミアムの合計がコールスプレッドの幅を上回るように設定すれば、**上方向へのリスクを完全に排除**できます。

これが私の言う「黄金の形」です。

**エントリー条件**:
- IV Rank（インプライド・ボラティリティ・ランク）が50以上
- 相場が明確な下落トレンドではない
- 残存日数30-60日程度

条件が揃えば、非常に有利なリスク・リワードを構築できますよ。`;
    }

    // カバードコール
    if (msg.includes("カバードコール") || msg.includes("カバード") || msg.includes("covered")) {
        return `カバードコール戦略ですね。初心者の方に最もおすすめしている戦略です。

**仕組み**:
1. 株式を保有する
2. その株のコールオプションを売る
3. 配当 + オプションプレミアムでダブルインカム

**メリット**:
- 株を持っているだけより利回りが向上
- 下落時もプレミアム分だけ損失が軽減
- 「待ちながら稼ぐ」ことができる

**注意点**:
- 株価が大きく上昇すると、その利益は限定される
- でも、これは「欲張らない」という私の哲学にも合っています

まずはここから始めて、オプションの感覚を掴んでみてください。`;
    }

    // ターゲット・バイイング
    if (msg.includes("ターゲット") || msg.includes("プット売り") || msg.includes("キャッシュセキュアード")) {
        return `ターゲット・バイイング（キャッシュ・セキュアード・プット）についてですね。

**概念**:
「欲しい株を今すぐ買うのではなく、**指値注文の代わりにプットを売る**」という発想です。

**仕組み**:
1. 欲しい株の、今より安い権利行使価格でプットを売る
2. 株価が下がれば → 安く株を手に入れる（プレミアムも受け取れる）
3. 株価が下がらなければ → プレミアムだけが利益になる

**私のルール**:
- 権利行使価格は現在価格から5%以上下に設定
- デルタは0.25〜0.35程度を目安に
- 残存日数は30〜45日

どちらに転んでも悪くない、これが「守りながら増やす」の一例です。`;
    }

    // グリークス（デルタ、ガンマ、シータ、ベガ）
    if (msg.includes("デルタ") || msg.includes("delta")) {
        return `デルタについてのご質問ですね。

**デルタ（Δ）とは**:
原資産価格が1円動いたときに、オプション価格がどれだけ動くかを示す指標です。

**数値の見方**:
- コールオプション: 0〜1の値（ATMで約0.5）
- プットオプション: -1〜0の値（ATMで約-0.5）
- デルタ0.3 = 原資産が100円上がると、オプションは約30円上昇

**私の活用法**:
- プット売りのデルタは0.20〜0.30を目安にしています
- これは「権利行使される確率が20〜30%程度」という解釈もできます
- ポートフォリオ全体のデルタを常に監視し、偏りすぎないように調整します

何か具体的な計算が必要でしたらお申し付けください。`;
    }

    if (msg.includes("ガンマ") || msg.includes("gamma")) {
        return `ガンマについてのご質問ですね。

**ガンマ（Γ）とは**:
デルタの変化率、つまり「デルタがどれだけ動くか」を示す指標です。

**特徴**:
- ATM（アット・ザ・マネー）付近で最大になる
- 満期が近づくと急激に大きくなる
- オプションの買い手にとって有利、売り手にとって不利

**リスク管理のポイント**:
ガンマが大きいポジションは、相場の急変動でデルタが急変します。
私は「ガンマリスク」を常に意識し、満期直前のATM付近のオプションには注意を払います。`;
    }

    if (msg.includes("シータ") || msg.includes("theta") || msg.includes("時間")) {
        return `シータについてのご質問ですね。

**シータ（Θ）とは**:
時間経過によるオプション価値の減衰、「タイムディケイ」を表す指標です。

**特徴**:
- 通常はマイナスの値（時間が経つと価値が減る）
- オプションの買い手にとって敵、売り手にとって味方
- 満期に近づくほど減衰が加速

**守屋流の活用**:
私は**シータを味方につける**戦略を重視しています。
オプションの売り手は、何もしなくても時間の経過とともにプレミアムを受け取れる。
これが「時間を味方にする」ということです。`;
    }

    if (msg.includes("ベガ") || msg.includes("vega") || msg.includes("ボラティリティ") || msg.includes("iv")) {
        return `ベガ（IV感応度）についてのご質問ですね。

**ベガ（V）とは**:
インプライド・ボラティリティ（IV）が1%変化したときのオプション価格の変化です。

**IVとは**:
市場が予想する将来の価格変動の大きさ。「恐怖指数」VIXと同じ概念です。

**私の活用法**:
- IVが高いとき（恐怖が高いとき）= オプションのプレミアムが高い = **売り時**
- IVが低いとき = プレミアムが薄い = **買い時**または**様子見**

ジェイド・リザードを仕掛けるのは、**IVランクが50以上**のときです。
恐怖が高まったときこそ、冷静にプレミアムを刈り取るチャンスなのです。`;
    }

    // リスク管理
    if (msg.includes("リスク") || msg.includes("危険") || msg.includes("損失") || msg.includes("暴落")) {
        return `リスク管理についてですね。これは私が最も重視するテーマです。

**「守りながら増やす」の3原則**:

1. **ポジションサイズの管理**
   - 一つの取引に資産の5%以上を投入しない
   - オプション取引全体で資産の20%を超えない

2. **ストレステスト**
   - 最悪のシナリオでも致命傷にならないか確認
   - 日経平均が2000円暴落しても「蚊に刺された程度」に

3. **コア・サテライト戦略**
   - コア資産（守り）70%：安定運用
   - サテライト（攻め）30%：オプション等

リスクをコントロールできれば、市場は怖くありません。
一緒に「守る力」を身につけていきましょう。`;
    }

    // 資金管理
    if (msg.includes("資金") || msg.includes("証拠金") || msg.includes("いくら") || msg.includes("必要")) {
        return `資金管理についてのご質問ですね。

**私の基本ルール**:

1. **全資産をトレードに回さない**
   - トレード用資金は全資産の20-30%まで
   - 残りは安全資産として確保

2. **証拠金には余裕を持つ**
   - 必要証拠金の2-3倍は口座に用意
   - 急変時のマージンコールを避ける

3. **1取引あたりの上限**
   - トレード資金の5%以下
   - これなら20回連続で失敗しても生き残れる

**初心者の方へ**:
まずは少額（100万円以下）で始めて、オプションの感覚を掴んでください。
焦る必要はありません。相場は逃げませんから。`;
    }

    // 初心者向け
    if (msg.includes("初心者") || msg.includes("始め") || msg.includes("入門") || msg.includes("基本")) {
        return `オプション取引を始めたいとのことですね。

**初心者におすすめの学習ステップ**:

1. **まず理解すべきこと**
   - コールとプットの違い
   - 権利行使価格と満期日
   - プレミアム（オプション価格）

2. **最初に試すべき戦略**
   - **カバードコール**: 持っている株にコール売りを被せる
   - **ターゲット・バイイング**: 欲しい株のプット売り
   - どちらもリスクが限定的で、仕組みがシンプル

3. **避けるべきこと**
   - 裸売り（プロテクションなしのオプション売り）
   - 満期直前の投機的な買い
   - 一発逆転を狙う取引

焦らず、一歩ずつ学んでいきましょう。私も最初は初心者でした。`;
    }

    // わからない・教えて
    if (msg.includes("わからない") || msg.includes("教えて") || msg.includes("説明") || msg.includes("とは")) {
        return `ご質問ありがとうございます。

具体的にどのようなことを知りたいですか？

**よくあるトピック**:

📚 **基礎知識**
- オプションとは何か
- グリークス（デルタ、ガンマ、シータ、ベガ）

💡 **戦略**
- カバードコール（初心者向け）
- ターゲット・バイイング
- ジェイド・リザード（中級者向け）
- デルタヘッジ（上級者向け）

🛡️ **リスク管理**
- ポジションサイズの決め方
- 資金管理のルール
- ストレステストの方法

どれか気になるものがあれば、詳しくお話しします。`;
    }

    // 自己紹介
    if (msg.includes("誰") || msg.includes("あなた") || msg.includes("自己紹介") || msg.includes("守屋")) {
        return `改めまして、守屋史章（もりや ふみあき）です。

**プロフィール**:
- M&F Asset Architect 代表
- オプショントレード普及協会 代表
- 「北浜投資塾」講師

**私の投資哲学**:
「守りながら増やす」— これが私のモットーです。

多くの投資家が「いかに儲けるか」を考える中で、
私は「いかに負けないか」を最優先に考えます。

オプションは「投機のツール」ではありません。
**リスクをコントロールし、着実にキャッシュフローを生む「道具」**なのです。

何かご質問があれば、遠慮なくどうぞ。`;
    }

    // デフォルト応答
    return `「${userMessage}」についてのご質問ですね。

私、守屋は常に「守りながら増やす」をモットーにしています。
投資において最も大切なのは、大きく儲けることではなく、**大きく負けないこと**です。

以下のトピックについてお話しできます：

- **ジェイド・リザード戦略** — 上方向リスクをゼロにする手法
- **カバードコール** — 株式保有者のためのインカム戦略
- **グリークス** — デルタ、ガンマ、シータ、ベガの解説
- **リスク管理** — 資金管理とポジションサイジング

具体的なテーマを教えていただければ、詳しくお話しします。

※本AIは教育目的であり、投資助言ではありません。`;
}

