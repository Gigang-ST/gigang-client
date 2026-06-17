"use client";

import { useState } from "react";

import { Check, Copy, Share2 } from "lucide-react";

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
  const [copiedText, setCopiedText] = useState(false);

  function getUrl() {
    return pageUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  }

  function buildText() {
    const lines = [title, timeLabel];
    if (contentSnippet) lines.push("", contentSnippet.slice(0, 100) + (contentSnippet.length > 100 ? ".." : ""));
    lines.push("", getUrl());
    return lines.join("\n");
  }

  async function handleCopyText() {
    await navigator.clipboard.writeText(buildText());
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 1500);
  }

  async function handleNativeShare() {
    if (!navigator.share) {
      await handleCopyText();
      return;
    }
    const text = contentSnippet
      ? contentSnippet.slice(0, 80) + (contentSnippet.length > 80 ? "..." : "")
      : undefined;
    try {
      await navigator.share({ title: `${title} - ${timeLabel}`, text, url: getUrl() });
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") throw e;
    }
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
            onClick={handleNativeShare}
            className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors active:bg-muted"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Share2 className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-medium">다른 앱으로 공유</span>
              <span className="text-[12px] text-muted-foreground">카카오톡, 문자 등으로 공유</span>
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
