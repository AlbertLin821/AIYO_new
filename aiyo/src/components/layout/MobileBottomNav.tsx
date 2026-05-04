"use client";

import { CalendarDays, Home, Map, MessageCircle, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";

const items = [
  { href: "/", icon: Home, labelKey: "home" as const, ariaKey: "homeAria" as const },
  { href: "/map", icon: Map, labelKey: "map" as const, ariaKey: "mapAria" as const },
  { href: "/chat", icon: MessageCircle, labelKey: "chat" as const, ariaKey: "chatAria" as const },
  {
    href: "/itinerary",
    icon: CalendarDays,
    labelKey: "itinerary" as const,
    ariaKey: "itineraryAria" as const,
  },
  { href: "/profile", icon: User, labelKey: "profile" as const, ariaKey: "profileAria" as const },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label={t.nav.brandSubtitle}
    >
      <div className="mx-auto flex h-14 max-w-lg items-stretch justify-between">
        {items.map(({ href, icon: Icon, labelKey, ariaKey }) => {
          const isActive = pathname === href;
          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              aria-current={isActive ? "page" : undefined}
              aria-label={t.mobileNav[ariaKey]}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1",
                isActive ? "text-primary" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("size-5 shrink-0", isActive && "text-primary")} aria-hidden />
              <span className="w-full truncate text-center text-[10px] font-medium leading-tight">
                {t.nav[labelKey]}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
