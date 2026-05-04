"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Lock, Mail, KeyRound, UserPlus, LogIn } from "lucide-react";
import { getProviders, signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPost } from "@/services/apiClient";
import { zhTW as t } from "@/locales/zh-TW";

function mapAuthError(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }

  const map: Record<string, string> = {
    // NextAuth common errors
    AccessDenied: "登入被拒絕，請稍後再試或改用其他登入方式。",
    Configuration: "登入設定有誤，請確認環境變數是否正確。",
    OAuthSignin: "Google 登入初始化失敗，請稍後再試。",
    OAuthCallback: "Google 登入回呼失敗，請確認回呼網址設定是否正確。",
    OAuthCreateAccount: "Google 帳號建立失敗，請稍後再試。",
    Callback: "登入流程發生錯誤，請稍後再試。",
    OAuthAccountNotLinked: "此電子郵件已用其他方式註冊，請改用原本的登入方式。",
    CredentialsSignin: "電子郵件或密碼錯誤。",
    SessionRequired: "此頁面需要登入。",

    // Custom credential errors thrown from authorize()
    MISSING_EMAIL: "請輸入電子郵件。",
    MISSING_PASSWORD: "請輸入密碼。",
    USER_NOT_FOUND: "查無此帳號，請先註冊。",
    PASSWORD_NOT_SET: "此帳號尚未設定密碼，請改用 Google 登入或先建立密碼。",
    PASSWORD_INCORRECT: "密碼錯誤，請再試一次。",

    // Register API errors (mirrors server-side codes when bubbled up)
    email_exists: "此電子郵件已被註冊。請直接登入。",
  };

  return map[code] || "登入失敗，請稍後再試。";
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const callbackUrl = useMemo(
    () => searchParams.get("callbackUrl") || "/profile",
    [searchParams],
  );
  const initialError = useMemo(() => searchParams.get("error"), [searchParams]);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(mapAuthError(initialError));
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, router, status]);

  useEffect(() => {
    let mounted = true;
    void getProviders()
      .then((providers) => {
        if (!mounted) {
          return;
        }
        setGoogleEnabled(Boolean(providers?.google));
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setGoogleEnabled(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleGoogleLogin() {
    setFormError(null);
    setIsSubmitting(true);
    await signIn("google", { callbackUrl });
    setIsSubmitting(false);
  }

  async function handleCredentialsLogin() {
    setFormError(null);
    setIsSubmitting(true);
    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
      callbackUrl,
    });
    setIsSubmitting(false);

    if (result?.ok) {
      // Force a full navigation so SessionProvider picks up the new session reliably.
      window.location.assign(callbackUrl);
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
        {
          name,
          email,
          password,
        },
      );

      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl,
      });

      if (result?.ok) {
        window.location.assign(callbackUrl);
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
    <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-border-light bg-surface p-5 shadow-soft-lg sm:p-8"
      >
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-lavender text-white">
            <Lock className="size-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {mode === "login" ? "登入" : "建立帳號"}
          </h1>
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
            <Globe className="size-4" />
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
                    onChange={(event) => setName(event.target.value)}
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
                  onChange={(event) => setEmail(event.target.value)}
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
                  onChange={(event) => setPassword(event.target.value)}
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
                setMode((current) => (current === "login" ? "register" : "login"));
              }}
              className="mt-3 w-full text-center text-xs text-muted hover:text-foreground"
            >
              {mode === "login" ? "尚未有帳號？建立帳號" : "已經有帳號？回到登入"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
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
