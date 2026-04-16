import type { Metadata } from "next";
import "./globals.css";
import AppLayout from "@/components/layout/AppLayout";

export const metadata: Metadata = {
  title: "AIYO - AI 旅遊智慧規劃",
  description: "用 AI 幫你規劃完美旅程。YouTube 影片分析、地圖規劃、語音助手、多人共編，一站搞定你的旅遊行程。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
