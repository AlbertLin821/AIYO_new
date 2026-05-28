"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Lock, Mail, KeyRound, UserPlus, LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiPost } from "@/services/apiClient";
import { useUIStore } from "@/stores/useUIStore";

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function mapAuthError(code: string | null | undefined): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    AccessDenied: "登入被拒絕，請稍後再試或改用其他登入方式。",
    Configuration: "登入設定有誤，請確認環境變數是否正確。",
    OAuthSignin: "Google 登入初始化失敗，請稍後再試。",
    OAuthCallback: "Google 登入回呼失敗，請確認回呼網址設定是否正確。",
    OAuthCreateAccount: "Google 帳號建立失敗，請稍後再試。",
    Callback: "登入流程發生錯誤，請稍後再試。",
    OAuthAccountNotLinked: "此電子郵件已用其他方式註冊，請改用原本的登入方式。",
    CredentialsSignin: "電子郵件或密碼錯誤。",
    SessionRequired: "此頁面需要登入。",
    MISSING_EMAIL: "請輸入電子郵件。",
    MISSING_PASSWORD: "請輸入密碼。",
    USER_NOT_FOUND: "查無此帳號，請先註冊。",
    PASSWORD_NOT_SET: "此帳號尚未設定密碼，請改用 Google 登入或先建立密碼。",
    PASSWORD_INCORRECT: "密碼錯誤，請再試一次。",
    email_exists: "此電子郵件已被註冊。請直接登入。",
  };
  return map[code] || "登入失敗，請稍後再試。";
}

async function signInWithCredentials(input: {
  email: string;
  password: string;
  callbackUrl: string;
}) {
  const response = await signIn("credentials", {
    redirect: false,
    email: input.email,
    password: input.password,
    callbackUrl: input.callbackUrl,
  });

  if (!response) {
    return { ok: false, error: "CredentialsSignin", url: null };
  }

  return {
    ok: Boolean(response.ok),
    error: response.error || null,
    url: response.url || input.callbackUrl,
  };
}

function LoginModal() {
  const open = useUIStore((s) => s.loginModalOpen);
  const setOpen = useUIStore((s) => s.setLoginModalOpen);
  const storeCallbackUrl = useUIStore((s) => s.loginModalCallbackUrl);
  const pathname = usePathname();

  const callbackUrl = storeCallbackUrl || (pathname === "/login" ? "/" : pathname) || "/";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    void fetch("/api/runtime-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((config: { googleAuthEnabled?: boolean } | null) => {
        if (mounted) setGoogleEnabled(Boolean(config?.googleAuthEnabled));
      })
      .catch(() => {
        if (mounted) setGoogleEnabled(false);
      });
    return () => {
      mounted = false;
    };
  }, [open]);

  const resetForm = useCallback(() => {
    setMode("login");
    setName("");
    setEmail("");
    setPassword("");
    setFormError(null);
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setOpen(false);
    resetForm();
  }, [isSubmitting, setOpen, resetForm]);

  async function handleGoogleLogin() {
    setFormError(null);
    setIsSubmitting(true);
    await signIn("google", { callbackUrl });
    setIsSubmitting(false);
  }

  async function handleCredentialsLogin() {
    setFormError(null);
    setIsSubmitting(true);
    const result = await signInWithCredentials({ email, password, callbackUrl });
    setIsSubmitting(false);

    if (result?.ok) {
      setOpen(false);
      window.location.assign(result.url || callbackUrl);
      return;
    }
    setFormError(mapAuthError(result?.error || "CredentialsSignin"));
  }

  async function handleRegister() {
    setFormError(null);
    setIsSubmitting(true);
    try {
      await apiPost<{ name: string; email: string; password: string }, { id: string }>(
        "/api/auth/register",
        { name, email, password },
      );
      const result = await signInWithCredentials({ email, password, callbackUrl });
      if (result?.ok) {
        setOpen(false);
        window.location.assign(result.url || callbackUrl);
        return;
      }
      setFormError(mapAuthError(result?.error));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "註冊失敗，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  }

  const primaryAction = mode === "login" ? handleCredentialsLogin : handleRegister;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={!isSubmitting}
        className="rounded-3xl border-border-light p-5 shadow-soft-lg sm:max-w-md sm:p-8"
      >
        <DialogHeader className="mb-2 text-center sm:text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-lavender text-white">
            <Lock className="size-6" />
          </div>
          <DialogTitle className="text-2xl font-bold">
            {mode === "login" ? "登入" : "建立帳號"}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {mode === "login"
              ? "登入後可同步你的行程、聊天與協作資料。"
              : "建立帳號後即可開始同步你的旅遊工作區。"}
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <Alert variant="destructive" className="rounded-2xl border-danger/20 bg-danger/5">
            <AlertDescription className="text-danger">{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleGoogleLogin()}
            disabled={isSubmitting || googleEnabled === false}
            className="h-auto rounded-2xl border-border-light px-4 py-3 text-sm font-medium"
            title={
              googleEnabled === false
                ? "Google 登入尚未設定（請確認 GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET）"
                : "使用 Google 登入"
            }
          >
            <GoogleLogo className="size-5" />
            使用 Google 登入
          </Button>

          <div className="relative py-1">
            <Separator className="bg-border-light" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-popover px-3 text-xs text-muted">
              或
            </span>
          </div>

          <div className="rounded-2xl border border-border-light bg-cream/40 p-4">
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void primaryAction();
              }}
            >
              {mode === "register" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="login-name" className="text-xs text-muted">
                    名稱
                  </Label>
                  <Input
                    id="login-name"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl border-border bg-surface"
                    placeholder="例如：測試使用者"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="login-email" className="text-xs text-muted">
                  電子郵件
                </Label>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1">
                  <Mail className="size-4 shrink-0 text-muted" />
                  <Input
                    id="login-email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-0 bg-transparent px-0 shadow-none ring-0 focus-visible:ring-0"
                    placeholder="name@example.com"
                    inputMode="email"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password" className="text-xs text-muted">
                  密碼
                </Label>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1">
                  <KeyRound className="size-4 shrink-0 text-muted" />
                  <Input
                    id="login-password"
                    name="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-0 bg-transparent px-0 shadow-none ring-0 focus-visible:ring-0"
                    type="password"
                    placeholder="至少 8 個字元"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !email.trim() || !password.trim()}
                className="mt-1 h-auto rounded-xl bg-primary py-2.5 text-sm font-medium hover:bg-primary-dark"
              >
                {mode === "login" ? (
                  <>
                    <LogIn className="size-4" />
                    登入
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    建立帳號
                  </>
                )}
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFormError(null);
                setMode((c) => (c === "login" ? "register" : "login"));
              }}
              className="mt-3 h-auto w-full text-xs text-muted hover:text-foreground"
            >
              {mode === "login" ? "尚未有帳號？建立帳號" : "已經有帳號？回到登入"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default memo(LoginModal);
