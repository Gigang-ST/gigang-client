import type { PbClassBoard } from "@/lib/queries/pb-class";

import { SectionHeader } from "@/components/common/section-header";
import { StatCard } from "@/components/common/stat-card";
import { Body, Caption, Micro } from "@/components/common/typography";

/**
 * 정산 — 승인된 참가자 전원의 출석·환급 현황을 한눈에.
 *
 * 환급은 **지금까지의 출석 기준 예정액**이라 매주 바뀐다. 숫자는 전부 서버가
 * `summarizeRefund`로 낸 값(`board.totals`·참가자 `summary`)을 그대로 쓴다 — 관리자 표와 같은 값이라
 * 화면이 다시 계산하면 사람 돈이 어긋날 자리가 생긴다.
 * 입금 대기자는 아직 받은 돈이 아니라 목록에서도 합계에서도 뺀다.
 * 늦은 합류자(보증금 없음)는 환급 대상이 아니므로 0원이 아니라 「환급 없음」으로 말한다.
 */
export function PbSettlement({ board, myMemId }: { board: PbClassBoard; myMemId?: string }) {
  const { totals } = board;
  const approved = board.participants.filter((p) => p.aprvYn);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader label="SETTLEMENT" />

      <div className="grid grid-cols-2 gap-3">
        {/* 보증금 합계는 두 칸 — 7자리 금액이 반칸에 들어가면 넘친다 */}
        <StatCard className="col-span-2" value={`${totals.depositSum.toLocaleString()}원`} label="보증금 합계" />
        <StatCard value={`${totals.refundSum.toLocaleString()}원`} label="환급 예정" />
        <StatCard value={`${totals.unrefundedSum.toLocaleString()}원`} label="미환급 · 회식비·대회비" />
      </div>

      {approved.length > 0 && (
        <ul aria-label="참가자별 출석·환급">
          <li aria-hidden className="flex items-center gap-3 border-b border-border pb-1.5">
            <Micro className="min-w-0 flex-1">이름</Micro>
            <Micro className="w-10 text-right">출석</Micro>
            <Micro className="w-20 text-right">환급</Micro>
          </li>
          {approved.map((p) => {
            const noRefund = p.summary.late || p.summary.required === null;
            return (
              <li key={p.prtId} className="flex items-center gap-3 border-b border-border py-2.5">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Body className="truncate">{p.memNm}</Body>
                  {p.memId === myMemId && <Micro className="shrink-0 font-semibold text-primary">나</Micro>}
                </span>
                <Caption className="w-10 text-right text-foreground">{p.summary.attdCnt}회</Caption>
                <Caption className="w-20 text-right text-foreground">
                  {noRefund ? "환급 없음" : `${p.summary.refund.toLocaleString()}원`}
                </Caption>
              </li>
            );
          })}
        </ul>
      )}

      <Caption className="leading-relaxed">
        출석이 늘면 매주 바뀌어요. 시즌이 끝나면 이 금액으로 정산해요.
      </Caption>
    </div>
  );
}
