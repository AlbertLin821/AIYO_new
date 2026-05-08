"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";

export default function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <SessionProvider session={null} refetchOnWindowFocus={false}>
        {children}
      </SessionProvider>
    );
  }

  return (
    <SessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false}>
      {children}
    </SessionProvider>
  );
}
