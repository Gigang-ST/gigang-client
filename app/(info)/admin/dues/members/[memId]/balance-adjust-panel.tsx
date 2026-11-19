"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { adjustMemberBalance, revertBalanceAdjustment } from "@/app/actions/dues/adjust-balance";
import { formatKST } from "@/lib/dayjs";
import type { MemberBalAdj } from "@/lib/queries/dues";
import { cn } from "@/lib/utils";

import { Body, Caption, Micro } from "@/components/common/typography";
import { HelpTip } from "@/components/common/help-tip";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const won = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString()}원`;

/** 개시잔액 표시 + 관리자 조정·되돌리기 (#704). 조정은 사유 필수, 이력은 지우지 않고 남는다. */
export function BalanceAdjustPanel({
  memId,
  anchorAmt,
  adjustments,
}: {
  memId: string;
  anchorAmt: number | null;
  adjustments: MemberBalAdj[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amt, setAmt] = useState("");
  const [reason, setReason] = useState("");
  const [revertId, setRevertId] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState("");

  const activeSum = adjustments.filter((a) => !a.reverted && a.counted).reduce((s, a) => s + a.adjAmt, 0);

  function run(fn: () => Promise<{ ok: boolean; message: string | null }>, done: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.message ?? "처리하지 못했어요.");
        return;
      }
      toast.success("반영했어요.");
      done();
      router.refresh();
    });
  }

  return (
    <CardItem className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Caption>개시잔액</Caption>
          <HelpTip title="개시잔액">
            시스템을 쓰기 전(엑셀 수기 시절)에 넣어 둔 시작값이에요. 사실과 다르면 아래에서 사유와 함께 조정하고,
            잘못 조정했으면 되돌릴 수 있어요.
          </HelpTip>
        </div>
        <Body className="font-semibold">{anchorAmt === null ? "없음" : `${anchorAmt.toLocaleString()}원`}</Body>
      </div>
      {activeSum !== 0 && (
        <div className="flex items-center justify-between">
          <Caption>조정 합계</Caption>
          <Body className="font-semibold">{won(activeSum)}</Body>
        </div>
      )}

      <form
        className="flex flex-col gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(amt);
          run(
            () => adjustMemberBalance(memId, { adjAmt: Number.isFinite(n) ? n : 0, reason }),
            () => {
              setAmt("");
              setReason("");
            },
          );
        }}
      >
        <Caption>잔액 조정 (+는 늘림, -는 줄임)</Caption>
        <Input
          inputMode="numeric"
          placeholder="금액 (예: -5000)"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          disabled={pending}
        />
        <Input
          placeholder="사유 (필수)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
        />
        <Button type="submit" size="sm" disabled={pending || !amt.trim() || !reason.trim()}>
          조정하기
        </Button>
      </form>

      {adjustments.length > 0 && (
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {adjustments.map((a) => (
            <div key={a.adjId} className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between gap-2">
                <Body className={cn("font-semibold", a.reverted && "text-muted-foreground line-through")}>
                  {won(a.adjAmt)}
                </Body>
                <Micro>
                  {formatKST(a.createdAt, "YY.MM.DD HH:mm")}
                  {a.adjByName ? ` · ${a.adjByName}` : ""}
                </Micro>
              </div>
              <Caption>{a.reason}</Caption>
              {a.reverted && (
                <Micro>
                  되돌림{a.revertedAt ? ` ${formatKST(a.revertedAt, "YY.MM.DD HH:mm")}` : ""}
                  {a.revertReason ? ` · ${a.revertReason}` : ""}
                </Micro>
              )}
              {!a.reverted && !a.counted && <Micro>잔액 초기화 이전 조정이라 반영되지 않아요</Micro>}
              {!a.reverted &&
                (revertId === a.adjId ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="되돌리는 사유"
                      value={revertReason}
                      onChange={(e) => setRevertReason(e.target.value)}
                      disabled={pending}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || !revertReason.trim()}
                      onClick={() =>
                        run(
                          () => revertBalanceAdjustment(a.adjId, revertReason),
                          () => {
                            setRevertId(null);
                            setRevertReason("");
                          },
                        )
                      }
                    >
                      확인
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="self-start"
                    onClick={() => {
                      setRevertId(a.adjId);
                      setRevertReason("");
                    }}
                  >
                    되돌리기
                  </Button>
                ))}
            </div>
          ))}
        </div>
      )}
    </CardItem>
  );
}
