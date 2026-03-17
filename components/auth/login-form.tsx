"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { SocialLinksRow } from "@/components/social-links";

/** 로컬(개발)에서만 true — 빌드 시 인라인되므로 프로덕션 번들에는 이메일 로그인 UI가 안 나옴 */
const isLocalDev = process.env.NODE_ENV === "development";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<"kakao" | "google" | null>(
    null,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/onboarding";

  const handleOAuthLogin = async (provider: "kakao" | "google") => {
    const supabase = createClient();
    setOauthProvider(provider);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    });

    if (error) {
      setError(error.message);
      setOauthProvider(null);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setEmailLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      setError(err.message);
      setEmailLoading(false);
      return;
    }
    window.location.assign(safeNext);
  };

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-12 px-8",
        className,
      )}
      {...props}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <Image src="/logo.webp" alt="기강" width={80} height={80} priority />
        <p className="w-[280px] text-center text-[15px] leading-relaxed text-muted-foreground">
          운동을 좋아하는 사람들이 모여
          <br />
          만든 스포츠 팀
        </p>
      </div>

      {/* Buttons */}
      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={() => handleOAuthLogin("kakao")}
          disabled={oauthProvider !== null}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-base font-semibold text-[#191919] transition-opacity disabled:opacity-50"
        >
          <Image src="/kakao.png" alt="Kakao" width={20} height={20} />
          <span>
            {oauthProvider === "kakao" ? "연결 중..." : "카카오로 시작하기"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleOAuthLogin("google")}
          disabled={oauthProvider !== null}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-border text-base font-semibold text-foreground transition-opacity disabled:opacity-50"
        >
          <Image src="/google.webp" alt="Google" width={20} height={20} />
          <span>
            {oauthProvider === "google" ? "연결 중..." : "Google로 시작하기"}
          </span>
        </button>
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <Link
          href="/"
          className="mt-1 text-center text-sm font-medium text-muted-foreground underline"
        >
          구경할래요
        </Link>
      </div>

      {/* 로컬 전용: 이메일 로그인 (pnpm dev 시에만 노출) */}
      {isLocalDev && (
        <form
          onSubmit={handleEmailLogin}
          className="w-full max-w-sm rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4 text-left"
        >
          <p className="mb-2 text-xs font-medium text-amber-800">
            로컬 전용 · 이메일 로그인
          </p>
          <div className="flex flex-col gap-2">
            <Input
              type="email"
              placeholder="이메일"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder="비밀번호"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={emailLoading}
              className="h-9 w-full rounded-lg bg-amber-600 text-sm font-semibold text-white disabled:opacity-50"
            >
              {emailLoading ? "로그인 중..." : "이메일로 로그인"}
            </button>
          </div>
        </form>
      )}

      {/* Social Links */}
      <SocialLinksRow />

      {/* Footer */}
      <p className="w-[300px] text-center text-xs leading-relaxed text-[#A1A1AA]">
        계속 진행하면{" "}
        <Link href="/terms" className="underline">
          이용약관
        </Link>{" "}
        및{" "}
        <Link href="/privacy" className="underline">
          개인정보 처리방침
        </Link>
        에
        <br />
        동의하는 것으로 간주합니다.
      </p>
    </div>
  );
}
