"use client";

import { useEffect, useMemo, useState } from "react";

import { ExternalLink } from "lucide-react";

type OgData = {
  title: string | null;
  image: string | null;
  description: string | null;
  hostname: string | null;
};

export function LinkPreviewCard({ url }: { url: string }) {
  const [og, setOg] = useState<OgData | null>(null);
  const [loading, setLoading] = useState(true);

  // 미리보기를 못 만들어도 목적지는 알려준다 — 게시글 제목은 이미 카드 위에 있어서
  // "링크 바로가기"는 아무 정보도 주지 않는다. 호스트명은 URL만으로 늘 구할 수 있으므로
  // /api/og 응답이 아예 실패해도(og === null) 이 라벨은 남는다.
  const hostname = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }, [url]);

  useEffect(() => {
    fetch(`/api/og?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((data: OgData) => setOg(data))
      .catch(() => setOg(null))
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) {
    return (
      <div className="h-14 animate-pulse rounded-xl border border-border bg-muted" />
    );
  }

  // OG 이미지 없으면 기존 텍스트 버튼 형태로 폴백
  if (!og?.image) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-md border border-border py-2 text-sm transition-colors hover:bg-muted"
      >
        <ExternalLink className="size-3.5" />
        {og?.title ?? (hostname ? `${hostname} 열기` : "링크 바로가기")}
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex overflow-hidden rounded-xl border border-border transition-colors hover:bg-muted/50 active:bg-muted"
    >
      {/* 썸네일 */}
      <div className="relative h-[72px] w-[72px] shrink-0 bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={og.image}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>

      {/* 텍스트 */}
      <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2">
        {og.title && (
          <p className="line-clamp-1 text-[13px] font-medium leading-snug">
            {og.title}
          </p>
        )}
        {og.description && (
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            {og.description}
          </p>
        )}
        {og.hostname && (
          <p className="text-[10px] text-muted-foreground">{og.hostname}</p>
        )}
      </div>
    </a>
  );
}
