"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * 내용 길이에 따라 세로 높이가 자동으로 늘어나는 textarea.
 *
 * - 모바일에서 드래그 리사이즈는 잡기 어려우므로 입력에 맞춰 스스로 커진다.
 * - `minRows`로 기본(빈 상태) 높이를, `maxRows`로 상한을 지정한다. 상한 초과 시 내부 스크롤.
 * - 제어형 value 변경(입력·리셋·프리필)과 초기 마운트 시점에 높이를 재계산한다.
 */
export type AutoGrowTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number;
  maxRows?: number;
};

export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
  function AutoGrowTextarea({ className, minRows = 5, maxRows = 16, value, onChange, ...props }, ref) {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    const resize = () => {
      const el = innerRef.current;
      if (!el) return;
      // 먼저 높이를 초기화해야 줄어들 때도 정확한 scrollHeight를 얻는다.
      el.style.height = "auto";
      const style = window.getComputedStyle(el);
      const lineHeight = parseFloat(style.lineHeight) || 20;
      const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const maxHeight = lineHeight * maxRows + paddingY + borderY;
      const next = Math.min(el.scrollHeight, maxHeight);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    };

    // 입력·리셋·프리필 등 제어형 value 변경 시 높이 반영 — 리렌더 후 1회만 실행돼
    // onChange에서 중복 호출할 필요 없음(키입력당 강제 리플로우 1회로 제한).
    useEffect(() => {
      resize();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <textarea
        ref={innerRef}
        rows={minRows}
        value={value}
        onChange={onChange}
        className={cn(
          "flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
