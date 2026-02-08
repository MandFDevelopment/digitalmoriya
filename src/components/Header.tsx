"use client";

interface HeaderProps {
    showDisclaimer?: boolean;
}

export default function Header({ showDisclaimer = true }: HeaderProps) {
    return (
        <header className="sticky top-0 z-50">
            {/* 免責事項バナー */}
            {showDisclaimer && (
                <div className="disclaimer-banner py-2 px-4 text-center">
                    <p className="text-xs text-white/60">
                        ⚠️ 本AIは<span className="text-[var(--moriya-gold-500)]">教育目的</span>であり、投資助言を提供するものではありません。最終的な投資判断はご自身の責任で行ってください。
                    </p>
                </div>
            )}

            {/* メインヘッダー */}
            <div className="glass px-6 py-4">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    {/* ロゴ・タイトル */}
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--moriya-gold-500)] to-[var(--moriya-gold-400)] flex items-center justify-center gold-glow">
                            <span className="text-[var(--moriya-navy-900)] font-bold text-xl">守</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gradient-gold">
                                デジタル・モリヤ
                            </h1>
                            <p className="text-xs text-white/60">
                                金融特化型AIエージェント
                            </p>
                        </div>
                    </div>

                    {/* ナビゲーション */}
                    <nav className="hidden md:flex items-center gap-6">
                        <NavLink href="/" active>チャット</NavLink>
                        <NavLink href="#">
                            <span className="flex items-center gap-1">
                                <StatusDot />
                                オンライン
                            </span>
                        </NavLink>
                    </nav>

                    {/* モバイルメニューボタン */}
                    <button className="md:hidden p-2 text-white/60 hover:text-white transition-colors">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
        </header>
    );
}

// ナビリンクコンポーネント
function NavLink({
    href,
    children,
    active = false,
}: {
    href: string;
    children: React.ReactNode;
    active?: boolean;
}) {
    return (
        <a
            href={href}
            className={`text-sm font-medium transition-colors ${active
                ? "text-[var(--moriya-gold-500)]"
                : "text-white/60 hover:text-white"
                }`}
        >
            {children}
        </a>
    );
}

// ステータスドット
function StatusDot() {
    return (
        <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--moriya-success)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--moriya-success)]"></span>
        </span>
    );
}
