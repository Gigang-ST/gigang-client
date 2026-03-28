"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 개발/스테이징에서만 이메일·비밀번호 로그인 UI를 노출할 때 사용합니다.
 * - 로컬: `pnpm dev` (NODE_ENV=development)면 자동 허용
 * - Vercel 개발계: `NEXT_PUBLIC_ENABLE_DEV_EMAIL_LOGIN=true`
 * 운영에는 위 변수를 두지 않으면 UI가 렌더되지 않습니다.
 */
export function isDevEmailLoginEnabled(): boolean {
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  return process.env.NEXT_PUBLIC_ENABLE_DEV_EMAIL_LOGIN === "true";
}

type DevEmailLoginProps = {
  /** OAuth와 동일한 로그인 후 이동 경로 */
  redirectPath: string;
  /** true면 카카오/Google 버튼과 동시에 누를 수 없게 비활성화 */
  oauthBusy: boolean;
  className?: string;
};

/** Supabase 이메일·비밀번호 로그인. `isDevEmailLoginEnabled()`가 true일 때만 마운트합니다. */
export function DevEmailLogin({
  redirectPath,
  oauthBusy,
  className,
}: DevEmailLoginProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    router.push(redirectPath);
    router.refresh();
  };

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4",
        className,
      )}
    >
      <p className="mb-3 text-center text-xs font-medium text-amber-800 dark:text-amber-200">
        개발 환경 전용 · 이메일 로그인
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dev-email-login-email">이메일</Label>
          <Input
            id="dev-email-login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy || oauthBusy}
            placeholder="test@example.com"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dev-email-login-password">비밀번호</Label>
          <Input
            id="dev-email-login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy || oauthBusy}
            className="h-10"
          />
        </div>
        {error ? (
          <p className="text-center text-sm text-destructive">{error}</p>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          className="h-10 w-full"
          disabled={busy || oauthBusy || !email.trim() || !password}
        >
          {busy ? "로그인 중..." : "이메일로 로그인"}
        </Button>
      </form>
    </div>
  );
}
