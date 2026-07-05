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
import { Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";

type ShareSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  timeLabel: string;
  /** 장소 (모임 등) */
  locationText?: string;
  /** 본문 텍스트 */
  contentSnippet?: string;
  /** 본문에 첨부된 외부 링크 */
  contentUrl?: string;
  /** 이 게시물 상세보기 딥링크. 없으면 현재 페이지 URL 사용 */
  pageUrl?: string;
  /**
   * 완성된 공유 본문을 직접 지정. 주어지면 title/timeLabel 등 자동 조립을 무시하고 이 텍스트를 그대로 공유한다.
   * (모임처럼 도메인별로 멘트를 다듬고 싶을 때 사용)
   */
  shareText?: string;
  /** 시트 상단 제목 (기본 "공유하기") — 주간 일정 등 용도별 문구 지정용 */
  headerTitle?: string;
};

export function ShareSheet({
  open,
  onOpenChange,
  title,
  timeLabel,
  locationText,
  contentSnippet,
  contentUrl,
  pageUrl,
  shareText,
  headerTitle = "공유하기",
}: ShareSheetProps) {
  const [copiedText, setCopiedText] = useState(false);

  function getUrl() {
    return pageUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  }

  function buildText() {
    // 호출부가 완성 본문을 넘기면 그대로 사용(모임 등 도메인별 멘트)
    if (shareText) return shareText;

    const lines = [title, timeLabel];

    if (locationText) lines.push(locationText);
    if (contentSnippet) {
      const text = contentSnippet.trim();
      lines.push("", text.slice(0, 100) + (text.length > 100 ? ".." : ""));
    }
    if (contentUrl) lines.push(contentUrl);

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
    try {
      await navigator.share({ text: buildText() });
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
          <ResponsiveDrawerTitle>{headerTitle}</ResponsiveDrawerTitle>
          <ResponsiveDrawerDescription className="sr-only">공유 옵션</ResponsiveDrawerDescription>
        </ResponsiveDrawerHeader>

        <div className="flex flex-col gap-2 p-4">
          {/* 공유될 본문 미리보기 — 보내기 전에 무엇이 나가는지 그대로 보여준다 */}
          <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-muted px-3.5 py-3">
            <Caption className="whitespace-pre-wrap break-words leading-relaxed">
              {buildText()}
            </Caption>
          </div>

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
