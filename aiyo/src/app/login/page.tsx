"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useUIStore } from "@/stores/useUIStore";
import { zhTW as t } from "@/locales/zh-TW";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setLoginModalOpen = useUIStore((s) => s.setLoginModalOpen);
  const loginModalOpen = useUIStore((s) => s.loginModalOpen);
  const hasOpenedModalRef = useRef(false);

  const callbackUrl = useMemo(() => {
    const direct = searchParams.get("callbackUrl");
    if (direct) return direct;
    const legacyRedirect = searchParams.get("redirect");
    if (legacyRedirect) return legacyRedirect;
    return "/";
  }, [searchParams]);

  useEffect(() => {
    setLoginModalOpen(true, callbackUrl);
  }, [setLoginModalOpen, callbackUrl]);

  useEffect(() => {
    if (loginModalOpen) {
      hasOpenedModalRef.current = true;
      return;
    }
    if (hasOpenedModalRef.current) {
      router.replace(callbackUrl);
    }
  }, [loginModalOpen, router, callbackUrl]);

  return null;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <p className="text-sm text-muted">{t.login.suspenseFallback}</p>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
