"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { m } from "@/lib/motion";
import { usePathname } from "next/navigation";
import MotionProvider from "@/components/motion/MotionProvider";
import { Toaster } from "@/components/ui/sonner";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import Sidebar, { EXPANDED_W, COLLAPSED_W } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/useUIStore";

const CursorSparkle = dynamic(() => import("@/components/effects/CursorSparkle"), {
  ssr: false,
});
const LoginModal = dynamic(() => import("@/components/auth/LoginModal"), { ssr: false });
const SettingsModal = dynamic(() => import("@/components/settings/SettingsModal"), {
  ssr: false,
});
const OnboardingModal = dynamic(() => import("@/components/onboarding/OnboardingModal"), {
  ssr: false,
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false);
  const pathname = usePathname();
  const shouldRenderOnboarding = pathname !== "/login" && pathname !== "/map";
  const isLogin = pathname === "/login";
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const mainMargin = isDesktop ? (sidebarCollapsed ? COLLAPSED_W : EXPANDED_W) : 0;

  return (
    <MotionProvider>
      <div className="min-h-screen bg-background">
        <CursorSparkle />
        <Toaster />
        <Sidebar />
        <MobileBottomNav />
        <LoginModal />
        <SettingsModal />
        {shouldRenderOnboarding && <OnboardingModal />}
        <m.main
          initial={false}
          animate={{ marginLeft: mainMargin }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className={cn(
            "min-h-screen",
            !isLogin &&
              "pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0",
          )}
        >
          {children}
        </m.main>
      </div>
    </MotionProvider>
  );
}
