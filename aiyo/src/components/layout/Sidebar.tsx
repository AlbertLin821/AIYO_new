"use client";

import { AnimatePresence, m } from "@/lib/motion";
import {
  ArrowRightToLine,
  CalendarDays,
  Compass,
  Home,
  Loader2,
  LogOut,
  Map,
  Menu,
  MessageCircle,
  Settings,
  User,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import { useUIStore } from "@/stores/useUIStore";

const EXPANDED_W = 240;
const COLLAPSED_W = 68;

const navItems = [
  { icon: Home, labelKey: "home" as const, href: "/" },
  { icon: Map, labelKey: "map" as const, href: "/map" },
  { icon: MessageCircle, labelKey: "chat" as const, href: "/chat" },
  { icon: CalendarDays, labelKey: "itinerary" as const, href: "/itinerary" },
  { icon: User, labelKey: "profile" as const, href: "/profile" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const setLoginModalOpen = useUIStore((s) => s.setLoginModalOpen);
  const setSettingsModalOpen = useUIStore((s) => s.setSettingsModalOpen);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const width = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <m.aside
      initial={false}
      animate={{ width }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 z-40 hidden h-screen flex-col border-r-2 border-border bg-surface shadow-soft lg:flex"
    >
      <div className="flex h-16 items-center gap-3 border-b border-border bg-surface-elevated/60 px-3">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-primary/8 hover:text-foreground flex-shrink-0"
          aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
        >
          <Menu className="size-5" />
        </button>
        <AnimatePresence>
          {!collapsed && (
            <m.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden flex items-center gap-3"
            >
              <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-primary to-lavender text-white flex-shrink-0">
                <Compass className="size-5" />
              </div>
              <div className="overflow-hidden">
                <h1 className="font-bold text-lg text-foreground tracking-tight whitespace-nowrap">AIYO</h1>
                <p className="text-[11px] text-muted leading-none whitespace-nowrap">{t.nav.brandSubtitle}</p>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 py-4 px-2 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? t.nav[item.labelKey] : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                "hover:bg-primary/8",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
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
                {!collapsed && (
                  <m.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {t.nav[item.labelKey]}
                  </m.span>
                )}
              </AnimatePresence>
              {isActive && !collapsed && (
                <m.div
                  layoutId="activeNav"
                  className="ml-auto size-1.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 pb-3">
        <div className={cn(
          "mb-2 rounded-2xl border border-border bg-peach-light/40",
          collapsed ? "p-2" : "p-3",
        )}>
          <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary flex-shrink-0">
              {(session?.user?.name || session?.user?.email || "A")[0]?.toUpperCase()}
            </div>
            <AnimatePresence>
              {!collapsed && (
                <m.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0 flex-1 overflow-hidden"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {status === "loading"
                      ? t.sidebar.sessionLoading
                      : status === "authenticated"
                        ? session?.user?.name || session?.user?.email || t.sidebar.guest
                        : t.sidebar.guest}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {status === "loading"
                      ? t.sidebar.sessionLoadingHint
                      : status === "authenticated"
                        ? session?.user?.email || ""
                        : t.sidebar.signInHint}
                  </p>
                </m.div>
              )}
            </AnimatePresence>
          </div>

          <div className={cn("mt-3 flex gap-2", collapsed ? "flex-col" : "")}>
            {status === "authenticated" ? (
              <button
                onClick={() => setSettingsModalOpen(true)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                  "bg-border-light text-foreground hover:bg-border",
                  collapsed ? "w-full" : "flex-1",
                )}
                title="設定"
              >
                <Settings className="size-4" />
                <AnimatePresence>
                  {!collapsed && (
                    <m.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      設定
                    </m.span>
                  )}
                </AnimatePresence>
              </button>
            ) : null}
            <button
              onClick={() =>
                status === "authenticated"
                  ? void signOut({ callbackUrl: "/" })
                  : status === "unauthenticated"
                    ? setLoginModalOpen(true)
                    : undefined
              }
              disabled={status === "loading"}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                status === "authenticated"
                  ? "bg-border-light text-foreground hover:bg-border"
                  : status === "loading"
                    ? "cursor-not-allowed bg-border-light/60 text-muted"
                    : "bg-primary text-white hover:bg-primary-dark",
                collapsed ? "w-full" : status === "authenticated" ? "flex-1" : "w-full",
              )}
              title={
                status === "loading"
                  ? t.sidebar.sessionLoading
                  : status === "authenticated"
                    ? t.sidebar.signOut
                    : t.sidebar.signIn
              }
            >
              {status === "authenticated" ? (
                <LogOut className="size-4" />
              ) : status === "loading" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRightToLine className="size-4" />
              )}
              <AnimatePresence>
                {!collapsed && (
                  <m.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {status === "loading"
                      ? t.sidebar.sessionLoading
                      : status === "authenticated"
                        ? t.sidebar.signOut
                        : t.sidebar.signIn}
                  </m.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </div>
    </m.aside>
  );
}

export { EXPANDED_W, COLLAPSED_W };
