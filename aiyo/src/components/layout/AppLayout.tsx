"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import CursorSparkle from "@/components/effects/CursorSparkle";
import LoginModal from "@/components/auth/LoginModal";
import SettingsModal from "@/components/settings/SettingsModal";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import ToastViewport from "@/components/system/ToastViewport";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import Sidebar, { EXPANDED_W, COLLAPSED_W } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/useUIStore";

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
    <div className="min-h-screen bg-background">
      <CursorSparkle />
      <ToastViewport />
      <Sidebar />
      <MobileBottomNav />
      <LoginModal />
      <SettingsModal />
      {shouldRenderOnboarding && <OnboardingModal />}
      <motion.main
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
      </motion.main>
    </div>
  );
}
