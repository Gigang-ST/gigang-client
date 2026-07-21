"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 렌더 중 터진 예외를 콘솔에 남긴다 — 이 화면(전체 오류 폴백)이 떴을 때 원인 스택을 잡기 위함.
  // 재현이 어려운 클라 렌더 예외를 디버깅하려면 메시지·digest·스택이 필요하다(리포팅 도구 부재).
  useEffect(() => {
    console.error("[app/error] uncaught:", error?.message, "| digest:", error?.digest, error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6">
      <span className="text-5xl font-bold text-muted-foreground">오류</span>
      <p className="text-sm text-muted-foreground">
        문제가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <Button size="lg" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
