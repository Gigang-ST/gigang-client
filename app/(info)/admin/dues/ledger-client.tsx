"use client";

import { useMemo, useState, useTransition } from "react";

import { UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { leaveMemberFromDues } from "@/app/actions/admin/manage-member";
import { recalculateBalance } from "@/app/actions/dues/recalculate-balance";

import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { H2, Body, Caption, SectionLabel } from "@/components/common/typography";
import { SegmentControl } from "@/components/common/segment-control";
import { EmptyState } from "@/components/common/empty-state";
import { cn } from "@/lib/utils";

import type { LedgerRow } from "@/lib/queries/dues";

type Filter = "all" | "unpaid" | "prepaid";

/**
 * 회비 잔액 원장 랜딩 화면. 회원별 잔액 요약(미납/정상/예치) + 필터 + 이름 검색 + 회원 행을 보여준다.
 * 행 액션의 "면제"는 기존 면제 관리 화면(/admin/dues/exemptions)으로, 상단 "정책"은
 * 기존 정책 화면(/admin/dues/policy)으로 연결한다(폼 로직 중복 작성 방지).
 * "독려"/"미납자 전체 푸시"는 P3에서 활성화 예정이라 현재는 비활성 버튼으로만 노출한다.
 */
export function LedgerClient({
  rows,
  summary,
}: {
  rows: LedgerRow[];
  summary: { unpaid: number; ok: number; prepaid: number };
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [recalcPending, startRecalc] = useTransition();
  const [leavePending, startLeave] = useTransition();
  const [leavingMemberId, setLeavingMemberId] = useState<string | null>(null);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);
  const router = useRouter();

  // 취소 후 재계산 실패 등으로 스냅샷이 낡았을 때의 복구 진입점.
  // 재계산은 앵커+리플레이 방식이라 몇 번을 눌러도 결과가 같다(멱등).
  function onRecalcAll() {
    if (!confirm("전체 활성 회원의 회비 잔액을 다시 계산할까요?")) return;
    setRecalcMsg(null);
    startRecalc(async () => {
      const res = await recalculateBalance();
      setRecalcMsg(res.ok ? `재계산 완료 — ${res.updatedCount}명 갱신` : "재계산에 실패했습니다. 다시 시도해 주세요.");
      if (res.ok) router.refresh();
    });
  }

  function onLeaveMember(row: LedgerRow) {
    const amount = Math.abs(row.balance).toLocaleString();
    const monthsLabel = row.months === 0 ? "1개월 미만" : `${row.months}개월`;
    if (!confirm(`${row.name}님을 탈퇴 처리할까요?\n현재 ${monthsLabel} 미납, ${amount}원입니다.`)) return;

    setLeavingMemberId(row.memId);
    setRecalcMsg(null);
    startLeave(async () => {
      try {
        const res = await leaveMemberFromDues(row.memId, `회비 ${amount}원 미납으로 관리자 탈퇴 처리`);
        setRecalcMsg(res.ok ? `${row.name}님을 탈퇴 처리했습니다.` : res.message);
        if (res.ok) router.refresh();
      } catch {
        setRecalcMsg("탈퇴 처리에 실패했습니다. 다시 시도해 주세요.");
      } finally {
        setLeavingMemberId(null);
      }
    });
  }

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === "unpaid" && r.status !== "미납") return false;
        if (filter === "prepaid" && r.status !== "예치") return false;
        if (q && !r.name.includes(q)) return false;
        return true;
      }),
    [rows, filter, q],
  );

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
      <div className="flex items-center justify-between">
        <H2>회비 현황</H2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={recalcPending} onClick={onRecalcAll}>
            {recalcPending ? "재계산 중…" : "전체 재계산"}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/dues/policy">정책</Link>
          </Button>
        </div>
      </div>

      {recalcMsg && <Caption className="text-foreground">{recalcMsg}</Caption>}

      <div className="flex items-center gap-3">
        <Caption>
          미납 <span className="font-semibold text-destructive">{summary.unpaid}</span>
        </Caption>
        <Caption>
          정상 <span className="font-semibold text-foreground">{summary.ok}</span>
        </Caption>
        <Caption>
          예치 <span className="font-semibold text-success">{summary.prepaid}</span>
        </Caption>
      </div>

      <SegmentControl
        segments={[
          { value: "all", label: "전체" },
          { value: "unpaid", label: "미납만" },
          { value: "prepaid", label: "예치만" },
        ]}
        value={filter}
        onValueChange={(v) => setFilter(v as Filter)}
      />

      <Input placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="flex items-center justify-between pt-2">
        <SectionLabel>회원 목록 ({shown.length})</SectionLabel>
        <Button size="sm" variant="outline" disabled title="P3 예정">
          미납자 전체 푸시
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState variant="card" message="조건에 맞는 회원이 없습니다." />
      ) : (
        <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
          {shown.map((r) => (
            <div key={r.memId} className="flex items-center justify-between gap-3 px-4 py-3">
              {/* 이름 영역 = 회원별 납부 근거 드릴다운 진입점 (QS-7) */}
              <Link href={`/admin/dues/members/${r.memId}`} className="flex min-w-0 flex-col gap-0.5">
                <Body className="font-semibold underline-offset-2 hover:underline">{r.name}</Body>
                <Caption>
                  {r.balance === 0
                    ? "정상"
                    : r.months === 0
                      ? `1개월 미만 ${r.balance < 0 ? "미납" : "예치"}`
                      : `${r.months}개월 ${r.balance < 0 ? "미납" : "예치"}`}
                </Caption>
              </Link>
              <div className="flex items-center gap-2">
                <Body
                  className={cn(
                    "font-semibold whitespace-nowrap",
                    r.balance < 0 && "text-destructive",
                    r.balance > 0 && "text-success",
                  )}
                >
                  {r.balance > 0 ? "+" : ""}
                  {r.balance.toLocaleString()}원
                </Body>
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/dues/exemptions">면제</Link>
                </Button>
                {r.status === "미납" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    disabled={leavePending}
                    onClick={() => onLeaveMember(r)}
                  >
                    <UserX className="size-3.5" />
                    {leavePending && leavingMemberId === r.memId ? "처리 중…" : "탈퇴"}
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled title="P3 예정">
                  독려
                </Button>
              </div>
            </div>
          ))}
        </CardItem>
      )}
    </div>
  );
}
