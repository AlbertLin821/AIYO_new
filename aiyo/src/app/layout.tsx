import type { Metadata } from "next";
import AppLayout from "@/components/layout/AppLayout";
import AppDataBridge from "@/components/providers/AppDataBridge";
import AuthSessionProvider from "@/components/providers/AuthSessionProvider";
import { PersistenceBootstrap } from "@/services/persistence";
import { zhTW } from "@/locales/zh-TW";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="zh-Hant" className={cn("h-full antialiased", "font-sans", geist.variable)} suppressHydrationWarning>
      <body className="min-h-full" suppressHydrationWarning>
        <AuthSessionProvider>
          <PersistenceBootstrap />
          <AppDataBridge />
          <AppLayout>{children}</AppLayout>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
