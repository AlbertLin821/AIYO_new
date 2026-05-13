"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Mail, KeyRound, UserPlus, LogIn, X } from "lucide-react";
import { signIn } from "next-auth/react";
import { usePathname } from "next/navigation";
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
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/25 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-heading"
            className="relative w-full max-w-md rounded-3xl border border-border-light bg-surface p-5 shadow-soft-lg sm:p-8"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-border-light disabled:opacity-50"
              aria-label="關閉"
            >
              <X className="size-4" aria-hidden />
            </button>

            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-lavender text-white">
                <Lock className="size-6" />
              </div>
              <h2 id="login-modal-heading" className="text-2xl font-bold text-foreground">
                {mode === "login" ? "登入" : "建立帳號"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {mode === "login"
                  ? "登入後可同步你的行程、聊天與協作資料。"
                  : "建立帳號後即可開始同步你的旅遊工作區。"}
              </p>
            </div>

            {formError && (
              <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                {formError}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={() => void handleGoogleLogin()}
                disabled={isSubmitting || googleEnabled === false}
                className="flex items-center justify-center gap-2 rounded-2xl border border-border-light px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-cream/60 disabled:cursor-not-allowed disabled:opacity-60"
                title={
                  googleEnabled === false
                    ? "Google 登入尚未設定（請確認 GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET）"
                    : "使用 Google 登入"
                }
              >
                <GoogleLogo className="size-5" />
                使用 Google 登入
              </button>

              <div className="relative py-1 text-center text-xs text-muted">
                <span className="bg-surface px-3">或</span>
                <div className="absolute left-0 right-0 top-1/2 -z-10 h-px bg-border-light" />
              </div>

              <div className="rounded-2xl border border-border-light bg-cream/40 p-4">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void primaryAction();
                  }}
                >
                  {mode === "register" && (
                    <>
                      <label className="mb-2 block text-xs font-medium text-muted">名稱</label>
                      <input
                        name="name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mb-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="例如：測試使用者"
                      />
                    </>
                  )}

                  <label className="mb-2 block text-xs font-medium text-muted">電子郵件</label>
                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                    <Mail className="size-4 text-muted" />
                    <input
                      name="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-transparent text-sm text-foreground focus:outline-none"
                      placeholder="name@example.com"
                      inputMode="email"
                    />
                  </div>

                  <label className="mb-2 block text-xs font-medium text-muted">密碼</label>
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                    <KeyRound className="size-4 text-muted" />
                    <input
                      name="password"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-transparent text-sm text-foreground focus:outline-none"
                      type="password"
                      placeholder="至少 8 個字元"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !email.trim() || !password.trim()}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
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
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setMode((c) => (c === "login" ? "register" : "login"));
                  }}
                  className="mt-3 w-full text-center text-xs text-muted hover:text-foreground"
                >
                  {mode === "login" ? "尚未有帳號？建立帳號" : "已經有帳號？回到登入"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(LoginModal);
