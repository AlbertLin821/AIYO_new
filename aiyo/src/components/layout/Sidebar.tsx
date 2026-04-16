'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import {
  Home,
  Map,
  MessageCircle,
  CalendarDays,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  Compass,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { icon: Home, label: '首頁', href: '/' },
  { icon: Map, label: '地圖規劃', href: '/map' },
  { icon: MessageCircle, label: 'AI 對話', href: '/chat' },
  { icon: CalendarDays, label: '行程管理', href: '/itinerary' },
  { icon: User, label: '個人資料', href: '/profile' },
  { icon: Users, label: '多人共編', href: '/collaborate' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 z-40 h-screen bg-surface border-r border-border-light flex flex-col shadow-soft"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border-light">
        <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-primary to-lavender text-white flex-shrink-0">
          <Compass className="size-5" />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <h1 className="font-bold text-lg text-foreground tracking-tight">AIYO</h1>
              <p className="text-[11px] text-muted leading-none">旅遊智慧規劃</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer',
                'hover:bg-primary/8',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted hover:text-foreground'
              )}
            >
              <Icon
                className={cn(
                  'size-5 flex-shrink-0 transition-colors duration-200',
                  isActive ? 'text-primary' : 'text-muted group-hover:text-foreground'
                )}
              />
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {isActive && !sidebarCollapsed && (
                <motion.div
                  layoutId="activeNav"
                  className="ml-auto size-1.5 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Toggle Button */}
      <div className="px-3 pb-4">
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center w-full py-2 rounded-xl text-muted hover:text-foreground hover:bg-primary/8 transition-all duration-200 cursor-pointer"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="size-5" />
          ) : (
            <ChevronLeft className="size-5" />
          )}
        </button>
      </div>
    </motion.aside>
  );
}
