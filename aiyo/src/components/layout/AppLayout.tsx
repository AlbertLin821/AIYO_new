'use client';

import { useUIStore } from '@/stores/useUIStore';
import Sidebar from './Sidebar';
import OnboardingModal from '../onboarding/OnboardingModal';
import { motion } from 'framer-motion';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <div className="min-h-screen bg-background">
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
