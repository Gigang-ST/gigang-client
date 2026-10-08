"use client";

import { useState } from "react";

import { Check, Copy } from "lucide-react";

/**
 * 모임 계좌 복사 버튼 — 마일리지런·PB 클래스 입금 안내가 **같이 쓴다**.
 *
 * 계좌가 바뀌는 날 한쪽만 고쳐 두 프로젝트가 서로 다른 계좌를 안내하는 일이 없도록
 * 계좌 정보와 복사 동작을 이 한 곳에만 둔다(join-section 안에 있던 것을 그대로 옮겼다).
 */
const MEETING_ACCOUNT = {
  bank: "카카오뱅크",
  number: "3333096788223",
  displayNumber: "3333-09-6788223",
};

export function AccountCopyButton() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(MEETING_ACCOUNT.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("복사에 실패했습니다.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
    >
      <span>
        {MEETING_ACCOUNT.bank} {MEETING_ACCOUNT.displayNumber}
      </span>
      {copied ? (
        <Check className="size-4 text-success" />
      ) : (
        <Copy className="size-4 text-muted-foreground" />
      )}
    </button>
  );
}
