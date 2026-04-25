"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import ToastViewport from "@/components/system/ToastViewport";
import Sidebar from "@/components/layout/Sidebar";
import { PersistenceBootstrap } from "@/services/persistence";
import { useUIStore } from "@/stores/useUIStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const [isDesktop, setIsDesktop] = useState(false);
  const pathname = usePathname();
  const shouldRenderOnboarding = pathname !== "/login";

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PersistenceBootstrap />
      <ToastViewport />
      <Sidebar />
      {shouldRenderOnboarding && <OnboardingModal />}
      <motion.main
        initial={false}
        animate={{ marginLeft: isDesktop ? (sidebarCollapsed ? 72 : 240) : 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="min-h-screen"
      >
        {children}
      </motion.main>
    </div>
  );
}
