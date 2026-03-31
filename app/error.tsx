"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6">
      <span className="text-5xl font-bold text-muted-foreground">오류</span>
      <p className="text-sm text-muted-foreground">
        문제가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <button
        onClick={reset}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground"
      >
        다시 시도
      </button>
    </div>
  );
}
