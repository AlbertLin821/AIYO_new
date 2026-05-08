"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import ToastViewport from "@/components/system/ToastViewport";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import Sidebar from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/useUIStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const [isDesktop, setIsDesktop] = useState(false);
  const pathname = usePathname();
  const shouldRenderOnboarding = pathname !== "/login" && pathname !== "/map";
  const isLogin = pathname === "/login";

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <ToastViewport />
      <Sidebar />
      <MobileBottomNav />
      {shouldRenderOnboarding && <OnboardingModal />}
      <motion.main
        initial={false}
        animate={{ marginLeft: isDesktop ? (sidebarCollapsed ? 72 : 240) : 0 }}
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
