"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightToLine,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Compass,
  Home,
  Map,
  MessageCircle,
  LogOut,
  User,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import { useUIStore } from "@/stores/useUIStore";

const navItems = [
  { icon: Home, labelKey: "home" as const, href: "/" },
  { icon: Map, labelKey: "map" as const, href: "/map" },
  { icon: MessageCircle, labelKey: "chat" as const, href: "/chat" },
  { icon: CalendarDays, labelKey: "itinerary" as const, href: "/itinerary" },
  { icon: User, labelKey: "profile" as const, href: "/profile" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 z-40 hidden h-screen flex-col border-r-2 border-border bg-surface shadow-soft lg:flex"
    >
      <div className="flex h-16 items-center gap-3 border-b border-border bg-surface-elevated/60 px-4">
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
              <p className="text-[11px] text-muted leading-none">{t.nav.brandSubtitle}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => router.push(item.href)}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                "hover:bg-primary/8",
                isActive
                  ? "bg-primary/15 text-primary shadow-sm ring-2 ring-primary/25"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-5 flex-shrink-0 transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted group-hover:text-foreground",
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
                    {t.nav[item.labelKey]}
                  </motion.span>
                )}
              </AnimatePresence>
              {isActive && !sidebarCollapsed && (
                <motion.div
                  layoutId="activeNav"
                  className="ml-auto size-1.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <div
          className={cn(
            "mb-2 rounded-2xl border border-border bg-peach-light/40 p-3",
            sidebarCollapsed && "px-2 py-2",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {(session?.user?.name || session?.user?.email || "A")[0]?.toUpperCase()}
            </div>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {status === "authenticated"
                      ? session?.user?.name || session?.user?.email || t.sidebar.guest
                      : t.sidebar.guest}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {status === "authenticated"
                      ? session?.user?.email || ""
                      : t.sidebar.signInHint}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={() =>
              status === "authenticated" ? void signOut({ callbackUrl: "/" }) : void signIn()
            }
            className={cn(
              "mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
              status === "authenticated"
                ? "bg-border-light text-foreground hover:bg-border"
                : "bg-primary text-white hover:bg-primary-dark",
            )}
            title={status === "authenticated" ? t.sidebar.signOut : t.sidebar.signIn}
          >
            {status === "authenticated" ? (
              <LogOut className="size-4" />
            ) : (
              <ArrowRightToLine className="size-4" />
            )}
            {!sidebarCollapsed && (
              <span>{status === "authenticated" ? t.sidebar.signOut : t.sidebar.signIn}</span>
            )}
          </button>
        </div>

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
