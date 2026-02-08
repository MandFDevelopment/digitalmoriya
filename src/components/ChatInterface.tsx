"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";

// メッセージの型定義
interface Source {
    title: string;
    category: string;
    file: string;
    relevance: number;
}

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: Source[];
    timestamp: Date;
}

// コンポーネントのプロパティ
interface ChatInterfaceProps {
    onSendMessage?: (message: string) => Promise<string>;
}

export default function ChatInterface({ onSendMessage }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                "こんにちは。守屋です。オプション取引や資産運用について、何でもお聞きください。一緒に「守りながら増やす」投資を学んでいきましょう。\n\n何かご質問はありますか？",
            timestamp: new Date(),
        },
    ]);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // 自動スクロール
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // メッセージ送信処理
    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: "user",
            content: inputValue.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputValue("");
        setIsLoading(true);

        try {
            // API経由で応答を取得
            let responseText: string;
            let sources: Source[] | undefined;

            if (onSendMessage) {
                responseText = await onSendMessage(userMessage.content);
            } else {
                // ローカルAPIを呼び出し
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message: userMessage.content,
                        conversationHistory: messages.slice(-10).map(m => ({
                            role: m.role === "user" ? "user" : "model",
                            parts: [{ text: m.content }]
                        }))
                    }),
                });
                const data = await res.json();
                responseText = data.response || data.error || "応答を取得できませんでした。";
                sources = data.sources;
            }

            const assistantMessage: Message = {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                content: responseText,
                sources: sources,
                timestamp: new Date(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage: Message = {
                id: `error-${Date.now()}`,
                role: "assistant",
                content:
                    "申し訳ありません。通信エラーが発生しました。しばらくしてから再度お試しください。",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // キーボードイベント（Enterは改行、送信はボタンのみ）
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Ctrl+Enter または Cmd+Enter で送信
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSend();
        }
        // 通常のEnterは改行（デフォルト動作）
    };

    // テキストエリアの高さ自動調整
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputValue(e.target.value);
        if (inputRef.current) {
            inputRef.current.style.height = "auto";
            inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* メッセージエリア */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                ))}

                {/* ローディングインジケーター */}
                {isLoading && (
                    <div className="flex items-start gap-3 animate-fade-in">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--moriya-gold-500)] to-[var(--moriya-gold-400)] flex items-center justify-center text-[var(--moriya-navy-900)] font-bold text-sm flex-shrink-0">
                            守
                        </div>
                        <div className="message-assistant px-4 py-3">
                            <div className="flex gap-1 typing-indicator">
                                <span
                                    className="w-2 h-2 bg-[var(--moriya-gold-500)] rounded-full"
                                    style={{ "--i": 0 } as React.CSSProperties}
                                ></span>
                                <span
                                    className="w-2 h-2 bg-[var(--moriya-gold-500)] rounded-full"
                                    style={{ "--i": 1 } as React.CSSProperties}
                                ></span>
                                <span
                                    className="w-2 h-2 bg-[var(--moriya-gold-500)] rounded-full"
                                    style={{ "--i": 2 } as React.CSSProperties}
                                ></span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* 入力エリア */}
            <div className="p-4 border-t border-white/10">
                <div className="flex gap-3 items-end max-w-4xl mx-auto">
                    <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="メッセージを入力... (Ctrl+Enterで送信)"
                        className="flex-1 input-field rounded-xl px-4 py-3 resize-none text-white placeholder-white/40 min-h-[48px] max-h-[150px]"
                        rows={1}
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                        className="btn-primary px-6 py-3 rounded-xl flex items-center gap-2"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        送信
                    </button>
                </div>
            </div>
        </div>
    );
}

// メッセージバブルコンポーネント
function MessageBubble({ message }: { message: Message }) {
    const isUser = message.role === "user";

    return (
        <div
            className={`flex items-start gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : ""}`}
        >
            {/* アバター */}
            <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${isUser
                    ? "bg-[var(--moriya-navy-600)] text-white"
                    : "bg-gradient-to-br from-[var(--moriya-gold-500)] to-[var(--moriya-gold-400)] text-[var(--moriya-navy-900)]"
                    }`}
            >
                {isUser ? "あ" : "守"}
            </div>

            {/* メッセージ本文 */}
            <div
                className={`max-w-[70%] px-4 py-3 ${isUser ? "message-user" : "message-assistant"}`}
            >
                <div className="text-white leading-relaxed prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                        components={{
                            strong: ({ children }) => <strong className="font-bold text-[var(--moriya-gold-400)]">{children}</strong>,
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                            li: ({ children }) => <li className="mb-1">{children}</li>,
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>

                {/* 出典表示 */}
                {message.sources && message.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/10">
                        <p className="text-xs font-bold text-white/60 mb-2 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                            参照ソース:
                        </p>
                        <div className="space-y-2">
                            {message.sources.map((source, index) => (
                                <div key={index} className="bg-black/20 rounded p-2 text-xs border border-white/5">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-[var(--moriya-gold-400)] truncate pr-2">
                                            {source.title.replace(/^#\s+/, "")}
                                        </span>
                                        <span className="text-white/40 bg-white/5 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                                            {source.category}
                                        </span>
                                    </div>
                                    <p className="text-white/60 text-[10px] truncate">
                                        {source.file}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <span className="text-xs text-white/40 mt-2 block">
                    {formatTime(message.timestamp)}
                </span>
            </div>
        </div>
    );
}

// 時刻フォーマット
function formatTime(date: Date): string {
    return date.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

// デモ用の応答生成
async function getDemoResponse(userMessage: string): Promise<string> {
    // シミュレートされた遅延
    await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

    const lowerMessage = userMessage.toLowerCase();

    // キーワードに基づく応答
    if (lowerMessage.includes("ジェイド") || lowerMessage.includes("jade")) {
        return `ジェイド・リザード戦略についてですね。

これは私が日本市場で普及に努めている、やや高度ですが非常に魅力的な戦略です。

**構成**:
- OTM（アウト・オブ・ザ・マネー）のプット売り
- OTMのコール・クレジット・スプレッド

**最大のメリット**:
受取プレミアムの合計がコールスプレッドの幅を上回るように設定すれば、**上方向へのリスクを完全に排除**できます。

これが私の言う「黄金の形」です。条件が揃えば、非常に有利なリスク・リワードを構築できますよ。

詳しく知りたい点はありますか？`;
    }

    if (lowerMessage.includes("デルタ") || lowerMessage.includes("delta")) {
        return `デルタについてのご質問ですね。

**デルタ（Δ）とは**:
原資産価格が1円動いたときに、オプション価格がどれだけ動くかを示す指標です。

例えば、デルタが0.50のコールオプションは、原資産が100円上がると、およそ50円上昇します。

**私の活用法**:
- プット売りのデルタは0.20〜0.30を目安にしています
- これは「権利行使される確率が20〜30%程度」という解釈もできます
- リスク管理では、ポジション全体のデルタ（ポートフォリオデルタ）を常に意識します

何か具体的な計算が必要でしたらお申し付けください。`;
    }

    if (lowerMessage.includes("リスク") || lowerMessage.includes("危険")) {
        return `リスク管理についてですね。これは私が最も重視するテーマです。

**私の基本姿勢**:
「リターンの追求より、リスクの管理を優先する」

これが「守りながら増やす」の真髄です。

**具体的なルール**:
1. 一つのポジションに資産の5%以上を投入しない
2. オプション取引全体で20%を超えない
3. 最悪のシナリオ（暴落）でも「蚊に刺された程度」の痛みに抑える

リスクをコントロールできれば、市場は怖くありません。
一緒に「守る力」を身につけていきましょう。`;
    }

    if (lowerMessage.includes("カバードコール") || lowerMessage.includes("covered")) {
        return `カバードコール戦略ですね。初心者の方に最もおすすめしている戦略です。

**仕組み**:
1. 株式を保有する
2. その株のコールオプションを売る
3. 配当 + オプションプレミアムでダブルインカム

**メリット**:
- 株を持っているだけより利回りが向上
- 下落時もプレミアム分だけ損失が軽減

**注意点**:
- 株価が大きく上昇すると、その利益は限定される
- でも、これは「欲張らない」という私の哲学にも合っています

まずはここから始めて、オプションの感覚を掴んでみてください。`;
    }

    // デフォルトの応答
    return `ご質問ありがとうございます。

「${userMessage}」についてですね。

私、守屋は常に「守りながら増やす」をモットーにしています。
投資において最も大切なのは、大きく儲けることではなく、**大きく負けないこと**です。

オプション取引について、ジェイド・リザード戦略、カバードコール、デルタヘッジなど、
何でもお聞きください。一緒に学んでいきましょう。

※このAIは教育目的であり、投資助言ではありません。最終判断はご自身の責任でお願いします。`;
}
