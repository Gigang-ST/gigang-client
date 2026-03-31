"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body>
        <div style={{ display: "flex", minHeight: "100svh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "1.5rem" }}>
          <span style={{ fontSize: "3rem", fontWeight: 700, color: "#a1a1aa" }}>오류</span>
          <p style={{ fontSize: "0.875rem", color: "#a1a1aa" }}>
            문제가 발생했습니다. 잠시 후 다시 시도해주세요.
          </p>
          <button
            onClick={reset}
            style={{ height: "2.5rem", padding: "0 1.5rem", borderRadius: "0.5rem", backgroundColor: "#18181b", color: "#fafafa", fontSize: "0.875rem", fontWeight: 500, border: "none", cursor: "pointer" }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
