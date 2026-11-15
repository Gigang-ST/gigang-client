"use client";

import { useState } from "react";

import { Check, Copy } from "lucide-react";

import type { TeamAccount } from "@/lib/team-channels";

/**
 * 모임 계좌 복사 버튼 — 마일리지런·PB 클래스 입금 안내가 **같이 쓴다**.
 *
 * 계좌는 팀마다 다르다 — 팀 설정(`bank.team_account`)에서 서버가 읽어 `account` 로 내려준다
 * (`lib/team-social.ts`의 `getTeamAccount`). 코드에 박아 두면 다른 팀 회원이 기강 계좌로 돈을 보낸다.
 * 계좌가 없는 팀(설정 전)은 "운영진에게 물어봐 주세요"로 물러난다 — 빈 버튼을 세우지 않는다.
 */
export function AccountCopyButton({ account }: { account: TeamAccount | null }) {
  const [copied, setCopied] = useState(false);

  if (!account) {
    return <p className="text-center text-sm text-muted-foreground">입금 계좌는 운영진에게 물어봐 주세요.</p>;
  }
  // 보이는 번호는 하이픈이 섞여 있다 — 은행 앱 붙여넣기는 숫자만
  const digits = account.number.replace(/\D/g, "");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(digits);
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
        {account.bank} {account.number}
      </span>
      {copied ? (
        <Check className="size-4 text-success" />
      ) : (
        <Copy className="size-4 text-muted-foreground" />
      )}
    </button>
  );
}
