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
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => handleOAuthLogin("kakao")}
              disabled={oauthProvider !== null}
            >
              {oauthProvider === "kakao"
                ? "Connecting..."
                : "Continue with Kakao"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => handleOAuthLogin("google")}
              disabled={oauthProvider !== null}
            >
              {oauthProvider === "google"
                ? "Connecting..."
                : "Continue with Google"}
            </Button>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
