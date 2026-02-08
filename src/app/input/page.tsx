
"use client";

import { useState, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone"; // ドラッグ＆ドロップ用（なければ標準inputで実装）

// カテゴリ定義
const CATEGORIES = [
    { id: "books", label: "📚 書籍・基本理論" },
    { id: "strategies", label: "📊 戦略ガイド" },
    { id: "concepts", label: "📖 用語・概念" },
    { id: "seminars", label: "🎓 セミナー資料" },
    { id: "articles", label: "📝 記事・コラム" },
];

interface ActivityLog {
    id: string;
    message: string;
    type: "success" | "error" | "info";
    timestamp: Date;
}

export default function InputPage() {
    // --- State ---
    const [activities, setActivities] = useState<ActivityLog[]>([]);

    // PDF Upload
    const [isUploading, setIsUploading] = useState(false);
    const [uploadCategory, setUploadCategory] = useState("seminars");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // YouTube
    const [youtubeUrl, setYoutubeUrl] = useState("");
    const [youtubeCategory, setYoutubeCategory] = useState("seminars");
    const [isProcessingYoutube, setIsProcessingYoutube] = useState(false);
    const [autoTranscribe, setAutoTranscribe] = useState(true);

    // Memo
    const [memoTitle, setMemoTitle] = useState("");
    const [memoContent, setMemoContent] = useState("");
    const [memoCategory, setMemoCategory] = useState("concepts");
    const [isSavingMemo, setIsSavingMemo] = useState(false);

    // --- Helpers ---
    const addActivity = (message: string, type: "success" | "error" | "info" = "info") => {
        setActivities(prev => [{
            id: Math.random().toString(36).substring(7),
            message,
            type,
            timestamp: new Date()
        }, ...prev]);
    };

    // --- Actions ---

    // 1. PDF Upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        addActivity(`ファイル「${file.name}」のアップロードを開始...`, "info");

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("category", uploadCategory);

            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                addActivity(`✅ アップロード完了: ${file.name} (${data.document.textLength}文字)`, "success");
                if (fileInputRef.current) fileInputRef.current.value = "";
            } else {
                addActivity(`❌ エラー: ${data.error}`, "error");
            }
        } catch (err: any) {
            addActivity(`❌ 通信エラー: ${err.message}`, "error");
        } finally {
            setIsUploading(false);
        }
    };

    // 2. YouTube Fetch & Transcribe
    const handleYoutubeSubmit = async () => {
        if (!youtubeUrl) return;

        setIsProcessingYoutube(true);
        addActivity(`動画情報の取得を開始: ${youtubeUrl}`, "info");

        try {
            // Step 1: 動画情報をDBに保存
            const ytResponse = await fetch("/api/youtube", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: youtubeUrl,
                    category: youtubeCategory,
                    singleVideo: true // 基本は単一動画
                }),
            });

            const ytData = await ytResponse.json();

            if (!ytResponse.ok) {
                throw new Error(ytData.error || "動画の取得に失敗");
            }

            const videoTitle = ytData.results?.[0]?.title || "動画";
            addActivity(`✅ 動画を追加しました: ${videoTitle}`, "success");
            setYoutubeUrl(""); // URLクリア

            // Step 2: 自動文字起こし (オプションONの場合)
            if (autoTranscribe && ytData.results) {
                // 追加された動画に対して文字起こしを実行
                // 注: resultsには documentId が含まれていないAPI仕様だった場合、再取得が必要
                // 現在の /api/youtube の実装を見ると documentId を返していない可能性がある
                // そのため、タイトル等から類推するか、APIを修正するのがベストだが、
                // ここでは「直近の同じタイトルのドキュメント」を探すか、APIの改修を避けるために
                // 一旦「手動でやってね」にするか...いや、自動化したい。

                // 既存のAPIレスポンスの形: { results: [{ title, success }] }
                // DB IDがわからないので、直後に fetch("/api/knowledge") して探すのが確実。

                addActivity(`文字起こし対象を検索中...`, "info");

                // 少し待つ（DB反映待ち）
                await new Promise(r => setTimeout(r, 1000));

                const knowledgeRes = await fetch("/api/knowledge");
                const knowledgeData = await knowledgeRes.json();

                if (knowledgeData.documents) {
                    const targetDoc = knowledgeData.documents.find((d: any) => d.title === videoTitle);
                    if (targetDoc) {
                        addActivity(`文字起こしを開始します: ${targetDoc.title}`, "info");

                        // 文字起こし実行（非同期で待たない手もあるが、ログのために待つ）
                        const transRes = await fetch("/api/transcribe", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ documentId: targetDoc.id }),
                        });

                        const transData = await transRes.json();
                        if (transRes.ok) {
                            addActivity(`🎉 文字起こし完了! (${transData.transcriptLength}文字)`, "success");
                        } else {
                            addActivity(`⚠️ 文字起こし失敗: ${transData.error}`, "error");
                        }
                    } else {
                        addActivity(`⚠️ ドキュメントが見つかりませんでした（文字起こしスキップ）`, "error");
                    }
                }
            }

        } catch (err: any) {
            addActivity(`❌ エラー: ${err.message}`, "error");
        } finally {
            setIsProcessingYoutube(false);
        }
    };

    // 3. Memo Save
    const handleMemoSubmit = async () => {
        if (!memoTitle || !memoContent) return;

        setIsSavingMemo(true);
        addActivity("メモを保存中...", "info");

        try {
            const response = await fetch("/api/knowledge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    category: memoCategory,
                    filename: `memo_${Date.now()}`, // ユニークなファイル名
                    content: `# ${memoTitle}\n\n${memoContent}`
                }),
            });

            const data = await response.json();

            if (response.ok) {
                addActivity(`✅ メモを保存しました: ${memoTitle}`, "success");
                setMemoTitle("");
                setMemoContent("");
            } else {
                addActivity(`❌ 保存失敗: ${data.error}`, "error");
            }
        } catch (err: any) {
            addActivity(`❌ 通信エラー: ${err.message}`, "error");
        } finally {
            setIsSavingMemo(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--moriya-navy-900)] text-white p-6 font-sans">
            <div className="max-w-7xl mx-auto">
                <header className="mb-10 flex justify-between items-center border-b border-white/10 pb-6">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--moriya-gold-400)]">
                            守屋史章専用 ナレッジ入力コンソール
                        </h1>
                        <p className="text-white/50 mt-2">
                            あなたの知識をデジタルツインに同期します
                        </p>
                    </div>
                    <a href="/admin" className="text-sm text-white/50 hover:text-white transition">
                        管理画面へ →
                    </a>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Column 1: YouTube */}
                    <section className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col h-full hover:border-[var(--moriya-gold-500)]/50 transition duration-300">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="p-3 bg-red-500/20 rounded-lg text-red-500">
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" /></svg>
                            </div>
                            <h2 className="text-xl font-bold">動画を追加</h2>
                        </div>

                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-sm text-white/60 mb-2">YouTube URL</label>
                                <input
                                    type="text"
                                    className="w-full bg-[var(--moriya-navy-800)] border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-red-500 transition placeholder-white/20"
                                    placeholder="https://youtube.com/watch?v=..."
                                    value={youtubeUrl}
                                    onChange={e => setYoutubeUrl(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-white/60 mb-2">カテゴリ</label>
                                <select
                                    className="w-full bg-[var(--moriya-navy-800)] border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-red-500 transition"
                                    value={youtubeCategory}
                                    onChange={e => setYoutubeCategory(e.target.value)}
                                >
                                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer p-3 bg-white/5 rounded-lg hover:bg-white/10 transition">
                                <input
                                    type="checkbox"
                                    className="w-5 h-5 accent-red-500 rounded"
                                    checked={autoTranscribe}
                                    onChange={e => setAutoTranscribe(e.target.checked)}
                                />
                                <span className="text-sm">追加時に自動で文字起こしを行う</span>
                            </label>
                        </div>

                        <button
                            className="w-full mt-6 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            onClick={handleYoutubeSubmit}
                            disabled={isProcessingYoutube || !youtubeUrl}
                        >
                            {isProcessingYoutube ? "処理中..." : "動画を追加 & 解析"}
                        </button>
                    </section>

                    {/* Column 2: File Upload */}
                    <section className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col h-full hover:border-[var(--moriya-gold-500)]/50 transition duration-300">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="p-3 bg-purple-500/20 rounded-lg text-purple-500">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <h2 className="text-xl font-bold">資料をアップロード</h2>
                        </div>

                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-sm text-white/60 mb-2">カテゴリ</label>
                                <select
                                    className="w-full bg-[var(--moriya-navy-800)] border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 transition"
                                    value={uploadCategory}
                                    onChange={e => setUploadCategory(e.target.value)}
                                >
                                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>

                            <div
                                className={`border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:bg-white/5 hover:border-purple-500/50 transition cursor-pointer flex flex-col items-center justify-center gap-3 h-48 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <svg className="w-10 h-10 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                <p className="text-sm text-white/50">
                                    クリックしてPDFを選択<br />
                                    <span className="text-xs text-white/30">(PDF, TXT, MD 対応)</span>
                                </p>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".pdf,.txt,.md,.markdown"
                                    onChange={handleFileUpload}
                                />
                            </div>
                        </div>

                        <div className="mt-6 text-center text-xs text-white/30">
                            {isUploading ? "アップロード＆解析中..." : "自動でテキスト抽出されます"}
                        </div>
                    </section>

                    {/* Column 3: Quick Memo */}
                    <section className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col h-full hover:border-[var(--moriya-gold-500)]/50 transition duration-300">
                        <div className="mb-6 flex items-center gap-3">
                            <div className="p-3 bg-[var(--moriya-gold-500)]/20 rounded-lg text-[var(--moriya-gold-500)]">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </div>
                            <h2 className="text-xl font-bold">クイックメモ</h2>
                        </div>

                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-sm text-white/60 mb-2">タイトル</label>
                                <input
                                    type="text"
                                    className="w-full bg-[var(--moriya-navy-800)] border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-[var(--moriya-gold-500)] transition placeholder-white/20"
                                    placeholder="例: ボラティリティの考え方"
                                    value={memoTitle}
                                    onChange={e => setMemoTitle(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-white/60 mb-2">本文</label>
                                <textarea
                                    className="w-full bg-[var(--moriya-navy-800)] border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-[var(--moriya-gold-500)] transition placeholder-white/20 h-32 resize-none"
                                    placeholder="思いついたことを自由に..."
                                    value={memoContent}
                                    onChange={e => setMemoContent(e.target.value)}
                                />
                            </div>

                            <div>
                                <select
                                    className="w-full bg-[var(--moriya-navy-800)] border border-white/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[var(--moriya-gold-500)] transition"
                                    value={memoCategory}
                                    onChange={e => setMemoCategory(e.target.value)}
                                >
                                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <button
                            className="w-full mt-6 bg-[var(--moriya-gold-500)] hover:bg-[var(--moriya-gold-400)] text-[var(--moriya-navy-900)] font-bold py-3 rounded-lg transition disabled:opacity-50"
                            onClick={handleMemoSubmit}
                            disabled={isSavingMemo || !memoTitle}
                        >
                            {isSavingMemo ? "保存中..." : "メモを保存"}
                        </button>
                    </section>
                </div>

                {/* Activity Log */}
                <section className="mt-12 bg-black/20 rounded-2xl p-6 border border-white/5">
                    <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-4">最近のアクティビティ</h3>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {activities.length === 0 && (
                            <p className="text-white/20 text-sm italic">履歴はまだありません</p>
                        )}
                        {activities.map(act => (
                            <div key={act.id} className="flex items-start gap-3 text-sm animate-fade-in">
                                <span className="text-white/30 font-mono text-xs mt-1">
                                    {act.timestamp.toLocaleTimeString()}
                                </span>
                                <span className={`
                                    ${act.type === 'success' ? 'text-green-400' : ''}
                                    ${act.type === 'error' ? 'text-red-400' : ''}
                                    ${act.type === 'info' ? 'text-blue-300' : ''}
                                `}>
                                    {act.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 3px;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
