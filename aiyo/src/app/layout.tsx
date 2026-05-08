import type { Metadata } from "next";
import AppLayout from "@/components/layout/AppLayout";
import AppDataBridge from "@/components/providers/AppDataBridge";
import AuthSessionProvider from "@/components/providers/AuthSessionProvider";
import { PersistenceBootstrap } from "@/services/persistence";
import { zhTW } from "@/locales/zh-TW";
import "./globals.css";

export const metadata: Metadata = {
  title: zhTW.meta.title,
  description: zhTW.meta.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full">
        <AuthSessionProvider>
          <PersistenceBootstrap />
          <AppDataBridge />
          <AppLayout>{children}</AppLayout>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
