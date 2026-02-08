import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "デジタル・モリヤ | 金融特化型AIエージェント",
  description: "守屋史章氏の投資哲学を再現した金融特化型AIエージェント。オプション取引、リスク管理、「守りながら増やす」投資戦略をサポートします。",
  keywords: ["オプション取引", "投資", "リスク管理", "守屋史章", "ジェイド・リザード", "カバードコール"],
  authors: [{ name: "M&F Asset Architect" }],
  openGraph: {
    title: "デジタル・モリヤ | 金融特化型AIエージェント",
    description: "守屋史章氏の投資哲学を再現した金融特化型AIエージェント",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
