"use client";

import { motion } from "framer-motion";
import OnboardingModal from "@/components/onboarding/OnboardingModal";
import ToastViewport from "@/components/system/ToastViewport";
import Sidebar from "@/components/layout/Sidebar";
import { PersistenceBootstrap } from "@/services/persistence";
import { useUIStore } from "@/stores/useUIStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);

  return (
    <div className="min-h-screen bg-background">
      <PersistenceBootstrap />
      <ToastViewport />
      <Sidebar />
      <OnboardingModal />
      <motion.main
        initial={false}
        animate={{ marginLeft: sidebarCollapsed ? 72 : 240 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="min-h-screen"
      >
        {children}
      </motion.main>
    </div>
  );
}
