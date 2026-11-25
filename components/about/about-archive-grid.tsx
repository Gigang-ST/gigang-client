"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type ArchivePhoto = { readonly src: string; readonly alt: string };

/** 이 거리(px)보다 길게 옆으로 밀면 넘긴다. */
const SWIPE_MIN_PX = 48;

/**
 * 기강의 장면들 — 사진 격자 + 크게 보기(라이트박스).
 * 사진을 누르면 확대하고, 닫기 · 좌우 버튼 · 키보드 ←/→/Esc · 모바일 좌우 스와이프로 넘긴다.
 * 이미지 최적화는 쓰지 않는다(정적 파일, Vercel 변환 호출 0 — about-page.tsx 주석 참고).
 */
export function AboutArchiveGrid({ photos }: { photos: readonly ArchivePhoto[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const count = photos.length;
  const open = index !== null;

  const close = useCallback(() => {
    setIndex(null);
    openerRef.current?.focus();
  }, []);
  const step = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i === null ? i : (i + dir + count) % count)),
    [count],
  );

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close, step]);

  // 넘기는 사진 앞뒤 한 장씩 미리 받아 둔다.
  useEffect(() => {
    if (index === null) return;
    for (const d of [1, -1]) {
      const img = new window.Image();
      img.src = photos[(index + d + count) % count].src;
    }
  }, [index, photos, count]);

  const current = index === null ? null : photos[index];

  return (
    <>
      <div className="ab-grid">
        {photos.map((p, i) => (
          <button
            key={p.src}
            type="button"
            className="ab-photo ab-grid-btn"
            aria-label={`${p.alt} 크게 보기`}
            onClick={(e) => {
              openerRef.current = e.currentTarget;
              setIndex(i);
            }}
          >
            <Image src={p.src} alt="" fill sizes="(min-width: 1000px) 280px, 33vw" unoptimized />
          </button>
        ))}
      </div>

      {current && index !== null && (
        <div
          className="ab-lb"
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
          onClick={close}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start === null) return;
            const dx = e.changedTouches[0].clientX - start;
            if (Math.abs(dx) >= SWIPE_MIN_PX) step(dx < 0 ? 1 : -1);
          }}
        >
          <button ref={closeRef} type="button" className="ab-lb-close" aria-label="닫기" onClick={close}>
            ×
          </button>
          <button
            type="button"
            className="ab-lb-nav prev"
            aria-label="이전 사진"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
          >
            ‹
          </button>
          <figure className="ab-lb-fig" onClick={(e) => e.stopPropagation()}>
            <Image
              key={current.src}
              src={current.src}
              alt={current.alt}
              width={1080}
              height={1350}
              sizes="100vw"
              unoptimized
              draggable={false}
            />
            <figcaption>
              {current.alt} · {index + 1} / {count}
            </figcaption>
          </figure>
          <button
            type="button"
            className="ab-lb-nav next"
            aria-label="다음 사진"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}
