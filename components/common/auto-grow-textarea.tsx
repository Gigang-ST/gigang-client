"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

import { Textarea } from "@/components/ui/textarea";

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
      // 스타일은 ui/textarea 공통 컴포넌트를 상속 — 드리프트 방지.
      // 높이는 자동 계산이 담당하므로 min-h를 풀고, 폼 입력 규격(13px)·리사이즈 금지만 오버라이드.
      <Textarea
        ref={innerRef}
        rows={minRows}
        value={value}
        onChange={onChange}
        className={cn("min-h-0 resize-none text-[13px] md:text-[13px]", className)}
        {...props}
      />
    );
  },
);
