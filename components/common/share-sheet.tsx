"use client";

import { useState } from "react";

import { Check, Copy, Link, MessageCircle } from "lucide-react";

import {
  ResponsiveDrawer,
  ResponsiveDrawerContent,
  ResponsiveDrawerHeader,
  ResponsiveDrawerTitle,
  ResponsiveDrawerDescription,
} from "@/components/common/responsive-drawer";
import { Button } from "@/components/ui/button";

type ShareSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  timeLabel: string;
  contentSnippet?: string;
  /** 이 게시물 상세보기 딥링크. 없으면 현재 페이지 URL 사용 */
  pageUrl?: string;
};

export function ShareSheet({
  open,
  onOpenChange,
  title,
  timeLabel,
  contentSnippet,
  pageUrl,
}: ShareSheetProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  function getUrl() {
    return pageUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  }

  function buildText() {
    const lines = [`📌 ${title}`, `🕐 ${timeLabel}`];
    if (contentSnippet) lines.push("", contentSnippet.slice(0, 80) + (contentSnippet.length > 80 ? "…" : ""));
    lines.push("", getUrl());
    return lines.join("\n");
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(getUrl());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1500);
  }

  async function handleCopyText() {
    await navigator.clipboard.writeText(buildText());
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 1500);
  }

  function handleKakao() {
    const text = buildText();
    // 카카오톡 앱 URL 스킴으로 공유 텍스트 전달 (모바일)
    const kakaoUrl = `kakaotalk://send?text=${encodeURIComponent(text)}`;
    window.location.href = kakaoUrl;
  }

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <ResponsiveDrawerContent
        dialogClassName="max-w-sm p-0 gap-0 overflow-hidden"
        drawerClassName="h-auto"
      >
        <ResponsiveDrawerHeader className="border-b border-border px-4 py-4 text-left">
          <ResponsiveDrawerTitle>공유하기</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription className="sr-only">공유 옵션</ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        <div className="flex flex-col gap-2 p-4">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors active:bg-muted"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              {copiedLink ? <Check className="size-4 text-success" /> : <Link className="size-4" />}
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-medium">링크 복사</span>
              <span className="text-[12px] text-muted-foreground">이 게시물 주소를 복사</span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors active:bg-muted"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              {copiedText ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-medium">텍스트로 복사</span>
              <span className="text-[12px] text-muted-foreground">제목·시간·내용·링크를 한번에 복사</span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleKakao}
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors active:bg-muted"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FEE500]">
              <MessageCircle className="size-4 text-[#3C1E1E]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-medium">카카오톡으로 공유</span>
              <span className="text-[12px] text-muted-foreground">카카오톡 앱으로 바로 전송</span>
            </div>
          </button>
        </div>

        <div className="px-4 pb-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
        </div>
      </ResponsiveDrawerContent>
    </ResponsiveDrawer>
  );
}
