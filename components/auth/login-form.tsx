"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DevEmailLogin, isDevModeEnabled } from "@/components/auth/dev-email-login";
import { SocialLinksRow } from "@/components/social-links";
import { Button } from "@/components/ui/button";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<"kakao" | "google" | null>(
    null,
  );

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

    // OAuth 제공자가 query string(next)를 누락하는 경우를 대비해 임시 보관
    document.cookie = `oauth_next=${encodeURIComponent(safeNext)}; Path=/; Max-Age=600; SameSite=Lax`;

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
        <Image src="/logo.webp" alt="기강" width={80} height={80} priority className="dark:invert" />
        <p className="w-[280px] text-center text-[15px] leading-relaxed text-muted-foreground">
          운동을 좋아하는 사람들이 모여
          <br />
          만든 스포츠 팀
        </p>
      </div>

      {/* Buttons */}
      <div className="flex w-full flex-col gap-3">
        <Button
          type="button"
          onClick={() => handleOAuthLogin("kakao")}
          disabled={oauthProvider !== null}
          className="h-[52px] w-full rounded-xl bg-[#FEE500] text-base font-semibold text-[#191919] hover:bg-[#FEE500]/90"
        >
          <Image src="/kakao.png" alt="Kakao" width={20} height={20} />
          <span>
            {oauthProvider === "kakao" ? "연결 중..." : "카카오로 시작하기"}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuthLogin("google")}
          disabled={oauthProvider !== null}
          className="h-[52px] w-full rounded-xl border-[1.5px] text-base font-semibold"
        >
          <Image src="/google.webp" alt="Google" width={20} height={20} />
          <span>
            {oauthProvider === "google" ? "연결 중..." : "Google로 시작하기"}
          </span>
        </Button>
        {isDevModeEnabled() ? (
          <DevEmailLogin
            redirectPath={safeNext}
            oauthBusy={oauthProvider !== null}
            className="mt-1"
          />
        ) : null}
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <Link
          href="/"
          className="mt-1 text-center text-sm font-medium text-muted-foreground underline"
        >
          구경할래요
        </Link>
      </div>

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
