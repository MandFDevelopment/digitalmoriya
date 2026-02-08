"use client";

import { useState, useEffect, useRef } from "react";

interface KnowledgeDocument {
    id: string;
    filename: string;
    category: string;
    title: string;
    content: string;
    updatedAt: string;
    playlist?: string;
}

const CATEGORIES = [
    { id: "books", label: "📚 書籍・基本理論" },
    { id: "strategies", label: "📊 戦略ガイド" },
    { id: "concepts", label: "📖 用語・概念" },
    { id: "seminars", label: "🎓 セミナー資料" },
    { id: "articles", label: "📝 記事・コラム" },
];

export default function AdminPage() {
    const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // 編集モード
    const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // 新規作成フォーム
    const [newCategory, setNewCategory] = useState("strategies");
    const [newFilename, setNewFilename] = useState("");
    const [newContent, setNewContent] = useState("");

    // PDFアップロード
    const [isUploading, setIsUploading] = useState(false);
    const [uploadCategory, setUploadCategory] = useState("seminars");
    const [uploadTitle, setUploadTitle] = useState("");
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // YouTube取得
    const [isYoutubeOpen, setIsYoutubeOpen] = useState(false);
    const [youtubeUrl, setYoutubeUrl] = useState("");
    const [youtubeCategory, setYoutubeCategory] = useState("seminars");
    const [isSingleVideo, setIsSingleVideo] = useState(true);
    const [fetchingYoutube, setFetchingYoutube] = useState(false);

    // YouTube動画の展開状態
    const [expandedYoutube, setExpandedYoutube] = useState<Record<string, boolean>>({});

    // 文字起こし
    const [transcribingId, setTranscribingId] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);

    // ドキュメント一覧を取得
    const fetchDocuments = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/knowledge");
            const data = await response.json();

            if (response.ok) {
                setDocuments(data.documents);
            } else {
                setError(data.error || "取得に失敗しました");
            }
        } catch {
            setError("通信エラーが発生しました");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    // 新規作成
    const handleCreate = async () => {
        if (!newFilename.trim() || !newContent.trim()) {
            setError("ファイル名と内容を入力してください");
            return;
        }

        try {
            const response = await fetch("/api/knowledge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    category: newCategory,
                    filename: newFilename,
                    content: newContent,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess("ドキュメントを作成しました");
                setIsCreating(false);
                setNewFilename("");
                setNewContent("");
                fetchDocuments();
            } else {
                setError(data.error || "作成に失敗しました");
            }
        } catch {
            setError("通信エラーが発生しました");
        }
    };

    // 更新
    const handleUpdate = async () => {
        if (!editingDoc) return;

        try {
            // タイトルをコンテンツの先頭に反映
            let updatedContent = editingDoc.content;

            // 既存の # タイトル行を削除して新しいタイトルを挿入
            if (updatedContent.match(/^#\s+.+\n/m)) {
                updatedContent = updatedContent.replace(/^#\s+.+\n/, `# ${editingDoc.title}\n`);
            } else {
                // タイトル行がなければ先頭に追加
                updatedContent = `# ${editingDoc.title}\n\n${updatedContent}`;
            }

            const response = await fetch("/api/knowledge", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: editingDoc.id,
                    content: updatedContent,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess("ドキュメントを更新しました");
                setEditingDoc(null);
                fetchDocuments();
            } else {
                setError(data.error || "更新に失敗しました");
            }
        } catch {
            setError("通信エラーが発生しました");
        }
    };

    // 削除
    const handleDelete = async (id: string) => {
        if (!confirm("本当に削除しますか？")) return;

        try {
            const response = await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, {
                method: "DELETE",
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess("ドキュメントを削除しました");
                fetchDocuments();
            } else {
                setError(data.error || "削除に失敗しました");
            }
        } catch {
            setError("通信エラーが発生しました");
        }
    };

    // ファイルアップロード
    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();
        const validExtensions = [".pdf", ".txt", ".md", ".markdown"];
        const isValid = validExtensions.some(ext => fileName.endsWith(ext));

        if (!isValid) {
            setError("PDF, テキスト(.txt), Markdown(.md)ファイルのみアップロード可能です");
            return;
        }

        setUploadingPdf(true);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("category", uploadCategory);
            formData.append("title", uploadTitle || file.name.replace(/\.(pdf|txt|md|markdown)$/i, ""));

            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(`PDFをアップロードしました（${data.document.textLength}文字抽出）`);
                setIsUploading(false);
                setUploadTitle("");
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
                fetchDocuments();
            } else {
                setError(data.error || "アップロードに失敗しました");
            }
        } catch {
            setError("通信エラーが発生しました");
        } finally {
            setUploadingPdf(false);
        }
    };

    // YouTube字幕取得
    const handleYoutubeFetch = async () => {
        if (!youtubeUrl.trim()) {
            setError("URLを入力してください");
            return;
        }

        setFetchingYoutube(true);

        try {
            const response = await fetch("/api/youtube", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: youtubeUrl,
                    category: youtubeCategory,
                    singleVideo: isSingleVideo,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(data.message);
                setIsYoutubeOpen(false);
                setYoutubeUrl("");
                fetchDocuments();
            } else {
                setError(data.error || "取得に失敗しました");
            }
        } catch {
            setError("通信エラーが発生しました");
        } finally {
            setFetchingYoutube(false);
        }
    };

    // 文字起こし
    const handleTranscribe = async (docId: string) => {
        if (!confirm("この動画の音声を文字起こししますか？\n（1〜5分程度かかります）")) {
            return;
        }

        setTranscribingId(docId);

        try {
            const response = await fetch("/api/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ documentId: docId }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(`文字起こし完了（${data.transcriptLength}文字）`);
                fetchDocuments();
            } else {
                setError(data.error || "文字起こしに失敗しました");
            }
        } catch {
            setError("通信エラーが発生しました");
        } finally {
            setTranscribingId(null);
        }
    };

    // 一括文字起こし
    const handleBulkTranscribe = async (category: string) => {
        console.log("Checking category:", category);
        const targetDocs = documents.filter(doc =>
            doc.category === category &&
            doc.content.includes("youtube.com/watch") &&
            !doc.content.includes("## 文字起こし")
        );

        console.log("Target docs:", targetDocs.length);

        if (targetDocs.length === 0) {
            setError("文字起こし対象の動画がありません");
            return;
        }

        if (!confirm(`${targetDocs.length}件の動画を一括で文字起こししますか？\n（時間がかかります）`)) {
            return;
        }

        let successCount = 0;
        let failCount = 0;

        // 進捗初期化
        setProgress({ current: 0, total: targetDocs.length, message: "準備中..." });

        for (let i = 0; i < targetDocs.length; i++) {
            const doc = targetDocs[i];
            setTranscribingId(doc.id);
            // 進捗更新
            setProgress({
                current: i + 1,
                total: targetDocs.length,
                message: `処理中: ${doc.title}`
            });

            try {
                console.log(`Transcribing ${doc.id}...`);
                const response = await fetch("/api/transcribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ documentId: doc.id }),
                });

                const data = await response.json();

                if (response.ok) {
                    successCount++;
                    console.log(`Success: ${doc.id}`);
                } else {
                    failCount++;
                    console.error(`Failed: ${doc.id}`, data.error);
                }
            } catch (err) {
                failCount++;
                console.error(`Error: ${doc.id}`, err);
            }

            // 進捗更新のために一時的にドキュメントを再取得
            // サーバー負荷軽減のため少し待機してから再取得
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 最後にまとめて再取得
        await fetchDocuments();

        setTranscribingId(null);
        setProgress(null); // 進捗非表示
        setSuccess(`完了: ${successCount}件、失敗: ${failCount}件`);
    };

    // メッセージクリア
    useEffect(() => {
        if (error || success) {
            const timer = setTimeout(() => {
                setError("");
                setSuccess("");
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error, success]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-[var(--moriya-navy-900)] to-[var(--moriya-navy-800)] py-8 px-4">
            <div className="max-w-6xl mx-auto">
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white">
                            📚 ナレッジベース管理
                        </h1>
                        <p className="text-white/60 mt-2">
                            守屋史章のソース資料を追加・編集できます
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <a
                            href="/"
                            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                        >
                            ← チャットに戻る
                        </a>
                        <button
                            onClick={() => setIsUploading(true)}
                            className="px-4 py-2 bg-purple-500 text-white rounded-lg font-bold hover:bg-purple-400 transition"
                        >
                            📄 PDFアップロード
                        </button>
                        <button
                            onClick={() => setIsYoutubeOpen(true)}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-400 transition"
                        >
                            ▶️ YouTube取得
                        </button>
                        <button
                            onClick={() => setIsCreating(true)}
                            className="px-4 py-2 bg-[var(--moriya-gold-500)] text-[var(--moriya-navy-900)] rounded-lg font-bold hover:bg-[var(--moriya-gold-400)] transition"
                        >
                            + 新規作成
                        </button>
                    </div>
                </div>

                {/* メッセージ */}
                {(error || success || progress) && (
                    <div className={`mb-4 p-4 rounded-xl animate-fade-in ${error ? "bg-red-500/20 text-red-200 border border-red-500/30" :
                        progress ? "bg-blue-500/20 text-blue-200 border border-blue-500/30" :
                            "bg-green-500/20 text-green-200 border border-green-500/30"
                        }`}>
                        {progress ? (
                            <div>
                                <div className="flex justify-between mb-2">
                                    <span className="font-bold">一括処理中... ({progress.current}/{progress.total})</span>
                                    <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                                </div>
                                <div className="w-full bg-blue-900/50 rounded-full h-2 mb-2">
                                    <div
                                        className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                    ></div>
                                </div>
                                <p className="text-sm opacity-80 truncate">{progress.message}</p>
                            </div>
                        ) : (
                            error || success
                        )}
                    </div>
                )}

                {/* ファイルアップロードフォーム */}
                {isUploading && (
                    <div className="mb-8 p-6 glass-effect rounded-xl">
                        <h2 className="text-xl font-bold text-white mb-4">📄 PDFアップロード</h2>
                        <p className="text-white/60 mb-4">
                            PDFファイルをアップロードすると、AIがテキストを抽出してナレッジベースに追加します。
                            <br />
                            <span className="text-white/40">(テキスト/.mdファイルも対応)</span>
                        </p>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-white/80 mb-2">カテゴリ</label>
                                <select
                                    value={uploadCategory}
                                    onChange={(e) => setUploadCategory(e.target.value)}
                                    className="w-full px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20"
                                >
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat.id} value={cat.id} className="bg-[var(--moriya-navy-800)]">
                                            {cat.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-white/80 mb-2">タイトル（任意）</label>
                                <input
                                    type="text"
                                    value={uploadTitle}
                                    onChange={(e) => setUploadTitle(e.target.value)}
                                    placeholder="空欄の場合はファイル名を使用"
                                    className="w-full px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20 placeholder-white/40"
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-white/80 mb-2">PDF / テキスト / Markdownファイル</label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.txt,.md,.markdown"
                                onChange={handlePdfUpload}
                                disabled={uploadingPdf}
                                className="w-full px-4 py-3 bg-white/10 text-white rounded-lg border border-white/20 border-dashed file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-500 file:text-white file:font-bold hover:file:bg-purple-400"
                            />
                        </div>

                        {uploadingPdf && (
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-white">PDFを解析中...</span>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setIsUploading(false);
                                    setUploadTitle("");
                                    if (fileInputRef.current) {
                                        fileInputRef.current.value = "";
                                    }
                                }}
                                className="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                            >
                                閉じる
                            </button>
                        </div>
                    </div>
                )}

                {/* YouTube取得フォーム */}
                {isYoutubeOpen && (
                    <div className="mb-8 p-6 glass-effect rounded-xl">
                        <h2 className="text-xl font-bold text-white mb-4">▶️ YouTube字幕取得</h2>
                        <p className="text-white/60 mb-4">
                            YouTube動画から字幕を自動取得してナレッジベースに追加します。
                        </p>

                        <div className="mb-4">
                            <label className="block text-white/80 mb-2">取得モード</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-white cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={isSingleVideo}
                                        onChange={() => setIsSingleVideo(true)}
                                        className="accent-red-500"
                                    />
                                    単一動画
                                </label>
                                <label className="flex items-center gap-2 text-white cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={!isSingleVideo}
                                        onChange={() => setIsSingleVideo(false)}
                                        className="accent-red-500"
                                    />
                                    再生リスト（全件取得）
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-white/80 mb-2">カテゴリ</label>
                                <select
                                    value={youtubeCategory}
                                    onChange={(e) => setYoutubeCategory(e.target.value)}
                                    className="w-full px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20"
                                >
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat.id} value={cat.id} className="bg-[var(--moriya-navy-800)]">
                                            {cat.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-white/80 mb-2">
                                    {isSingleVideo ? "動画URL" : "再生リストURL"}
                                </label>
                                <input
                                    type="text"
                                    value={youtubeUrl}
                                    onChange={(e) => setYoutubeUrl(e.target.value)}
                                    placeholder={isSingleVideo ? "https://www.youtube.com/watch?v=..." : "https://www.youtube.com/playlist?list=..."}
                                    className="w-full px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20 placeholder-white/40"
                                />
                            </div>
                        </div>

                        {fetchingYoutube && (
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-white">字幕を取得中...</span>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={handleYoutubeFetch}
                                disabled={fetchingYoutube}
                                className="px-6 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-400 transition disabled:opacity-50"
                            >
                                取得開始
                            </button>
                            <button
                                onClick={() => {
                                    setIsYoutubeOpen(false);
                                    setYoutubeUrl("");
                                }}
                                className="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                )}

                {/* 新規作成フォーム */}
                {isCreating && (
                    <div className="mb-8 p-6 glass-effect rounded-xl">
                        <h2 className="text-xl font-bold text-white mb-4">新規ドキュメント作成</h2>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-white/80 mb-2">カテゴリ</label>
                                <select
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    className="w-full px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20"
                                >
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat.id} value={cat.id} className="bg-[var(--moriya-navy-800)]">
                                            {cat.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-white/80 mb-2">ファイル名（英数字）</label>
                                <input
                                    type="text"
                                    value={newFilename}
                                    onChange={(e) => setNewFilename(e.target.value)}
                                    placeholder="例: target_buying"
                                    className="w-full px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20 placeholder-white/40"
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-white/80 mb-2">内容（Markdown形式）</label>
                            <textarea
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                                placeholder={`# タイトル

## 出典
書籍「〇〇」より

---

本文をここに記述...`}
                                className="w-full h-64 px-4 py-3 bg-white/10 text-white rounded-lg border border-white/20 placeholder-white/40 font-mono text-sm"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleCreate}
                                className="px-6 py-2 bg-[var(--moriya-gold-500)] text-[var(--moriya-navy-900)] rounded-lg font-bold hover:bg-[var(--moriya-gold-400)] transition"
                            >
                                保存
                            </button>
                            <button
                                onClick={() => {
                                    setIsCreating(false);
                                    setNewFilename("");
                                    setNewContent("");
                                }}
                                className="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                )}

                {/* 編集フォーム */}
                {editingDoc && (
                    <div className="mb-8 p-6 glass-effect rounded-xl">
                        <h2 className="text-xl font-bold text-white mb-4">
                            ドキュメントを編集
                        </h2>

                        <div className="mb-4">
                            <label className="block text-white/80 mb-2">タイトル</label>
                            <input
                                type="text"
                                value={editingDoc.title}
                                onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
                                className="w-full px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-white/80 mb-2">内容</label>
                            <textarea
                                value={editingDoc.content}
                                onChange={(e) => setEditingDoc({ ...editingDoc, content: e.target.value })}
                                className="w-full h-96 px-4 py-3 bg-white/10 text-white rounded-lg border border-white/20 font-mono text-sm"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleUpdate}
                                className="px-6 py-2 bg-[var(--moriya-gold-500)] text-[var(--moriya-navy-900)] rounded-lg font-bold hover:bg-[var(--moriya-gold-400)] transition"
                            >
                                更新
                            </button>
                            <button
                                onClick={() => setEditingDoc(null)}
                                className="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                )}

                {/* ドキュメント一覧 */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="w-8 h-8 border-4 border-[var(--moriya-gold-500)] border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="text-white/60 mt-4">読み込み中...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {CATEGORIES.map((category) => {
                            const categoryDocs = documents.filter(d => d.category === category.id);
                            if (categoryDocs.length === 0) return null;

                            return (
                                <div key={category.id} className="glass-effect rounded-xl p-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-lg font-bold text-white">
                                            {category.label}
                                        </h3>
                                        <button
                                            onClick={() => handleBulkTranscribe(category.id)}
                                            disabled={!!transcribingId}
                                            className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition text-sm disabled:opacity-50"
                                        >
                                            ⚡️ 一括文字起こし
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {/* その他のドキュメントを表示 */}
                                        {categoryDocs
                                            .filter(doc => !doc.content.includes("youtube.com/watch"))
                                            .map((doc) => (
                                                <div
                                                    key={doc.id}
                                                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition"
                                                >
                                                    <div>
                                                        <h4 className="text-white font-medium">
                                                            {doc.title}
                                                        </h4>
                                                        <p className="text-white/50 text-sm">
                                                            {doc.filename} • 更新: {new Date(doc.updatedAt).toLocaleDateString("ja-JP")}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setEditingDoc(doc)}
                                                            className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition text-sm"
                                                        >
                                                            編集
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(doc.id)}
                                                            className="px-3 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition text-sm"
                                                        >
                                                            削除
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                        {/* YouTube動画グループ */}

                                        {/* YouTube動画グループ（再生リスト別） */}
                                        {(() => {
                                            const youtubeDocs = categoryDocs.filter(doc => doc.content.includes("youtube.com/watch"));
                                            if (youtubeDocs.length === 0) return null;

                                            // プレイリストごとにグループ化
                                            const playlistGroups = youtubeDocs.reduce((acc, doc) => {
                                                const key = doc.playlist || "その他（単一動画など）";
                                                if (!acc[key]) acc[key] = [];
                                                acc[key].push(doc);
                                                return acc;
                                            }, {} as Record<string, KnowledgeDocument[]>);

                                            return Object.entries(playlistGroups).map(([playlistName, docs]) => {
                                                const expandedKey = `${category.id}-${playlistName}`;
                                                const isExpanded = expandedYoutube[expandedKey];

                                                return (
                                                    <div key={playlistName} className="bg-white/5 rounded-lg overflow-hidden border border-white/10 mt-2">
                                                        <button
                                                            onClick={() => setExpandedYoutube(prev => ({ ...prev, [expandedKey]: !prev[expandedKey] }))}
                                                            className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition text-left"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-xl">📹</span>
                                                                <span className="font-bold text-white">
                                                                    {playlistName} ({docs.length}件)
                                                                </span>
                                                            </div>
                                                            <span className="text-white/60">
                                                                {isExpanded ? "▼" : "▶"}
                                                            </span>
                                                        </button>

                                                        {/* 展開された動画リスト */}
                                                        {isExpanded && (
                                                            <div className="border-t border-white/10 divide-y divide-white/10">
                                                                {docs.map((doc) => (
                                                                    <div
                                                                        key={doc.id}
                                                                        className="flex items-center justify-between p-3 pl-8 bg-black/20 hover:bg-black/10 transition"
                                                                    >
                                                                        <div>
                                                                            <div className="flex items-center gap-2">
                                                                                <h4 className="text-white font-medium text-sm">
                                                                                    {doc.title}
                                                                                </h4>
                                                                                {doc.content.includes("## 文字起こし") && (
                                                                                    <span className="bg-green-500/20 text-green-300 text-[10px] px-2 py-0.5 rounded">
                                                                                        済
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <p className="text-white/40 text-xs">
                                                                                {doc.filename}
                                                                            </p>
                                                                        </div>
                                                                        <div className="flex gap-2">
                                                                            {!doc.content.includes("## 文字起こし") && (
                                                                                <button
                                                                                    onClick={() => handleTranscribe(doc.id)}
                                                                                    disabled={transcribingId === doc.id}
                                                                                    className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition text-xs disabled:opacity-50"
                                                                                >
                                                                                    {transcribingId === doc.id ? "処理中..." : "🎤 文字起こし"}
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={() => setEditingDoc(doc)}
                                                                                className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition text-xs"
                                                                            >
                                                                                編集
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDelete(doc.id)}
                                                                                className="px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition text-xs"
                                                                            >
                                                                                削除
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            );
                        })}

                        {documents.length === 0 && (
                            <div className="text-center py-12 text-white/60">
                                ドキュメントがありません。「新規作成」から追加してください。
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
