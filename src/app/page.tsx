import Header from "@/components/Header";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー */}
      <Header />

      {/* メインコンテンツ */}
      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
        {/* チャットインターフェース */}
        <div className="flex-1 flex flex-col">
          <ChatInterface />
        </div>
      </main>

      {/* フッター */}
      <footer className="py-4 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <p>
            © 2026 M&F Asset Architect. Powered by Google Antigravity.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white transition-colors">
              プライバシーポリシー
            </a>
            <a href="#" className="hover:text-white transition-colors">
              利用規約
            </a>
            <a href="#" className="hover:text-white transition-colors">
              お問い合わせ
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
