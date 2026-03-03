"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<"kakao" | "google" | null>(
    null,
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/";
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  const handleOAuthLogin = async (provider: "kakao" | "google") => {
    const supabase = createClient();
    setOauthProvider(provider);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      "/onboarding",
    )}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    });

    if (error) {
      setError(error.message);
      setOauthProvider(null);
      return;
    }

    // OAuth는 리다이렉트가 정상 흐름이므로, 여기서 바로 처리 종료.
    router.prefetch(safeNext);
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="bg-transparent">
        <CardHeader>
          <CardTitle className="text-2xl">로그인</CardTitle>
        </CardHeader>
        <CardContent className="bg-transparent">
          <div className="flex flex-col gap-6">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between border-[#FEE500] bg-[#FEE500] text-black hover:bg-[#FEE500]/90 hover:text-black"
              onClick={() => handleOAuthLogin("kakao")}
              disabled={oauthProvider !== null}
            >
              <span className="flex items-center gap-2">
                <Image src="/kakao.png" alt="Kakao" width={18} height={18} />
                <span>
                  {oauthProvider === "kakao"
                    ? "연결 중..."
                    : "카카오로 로그인"}
                </span>
              </span>
              <span className="w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => handleOAuthLogin("google")}
              disabled={oauthProvider !== null}
            >
              <span className="flex items-center gap-2">
                <Image src="/google.webp" alt="Google" width={18} height={18} />
                <span>
                  {oauthProvider === "google"
                    ? "연결 중..."
                    : "구글로 로그인"}
                </span>
              </span>
              <span className="w-4" aria-hidden />
            </Button>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
