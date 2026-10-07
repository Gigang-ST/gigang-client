import { wkLabel } from "@/lib/pb-class";
import type { PbParticipant } from "@/lib/queries/pb-class";

import { Body, Caption, Micro } from "@/components/common/typography";
import { AccountCopyButton } from "@/components/projects/account-copy-button";
import { CardItem } from "@/components/ui/card";
import { PbZone } from "./pb-zone";

/**
 * 신청 완료 · 입금 확인 대기 — 무엇을 얼마 보내면 되는지가 이 카드의 전부다.
 *
 * 입금액은 **참가자 행에 저장된 금액**이다(서버가 신청 시점 주차·할인으로 확정한 값). 화면이 주차를
 * 다시 계산해 보여 주면 주 경계를 넘긴 사람이 신청 화면에서 본 금액과 다른 금액을 보게 된다.
 * 할인(`depositDcAmt`)도 저장값을 그대로 적는다 — 사유를 같이 적어야 남과 금액이 다른 이유가 읽힌다.
 */
export function PbPendingCard({
  me,
}: {
  me: Pick<PbParticipant, "depositAmt" | "entryFeeAmt" | "depositDcAmt" | "joinWkNo">;
}) {
  const dc = me.depositDcAmt ?? 0;
  const total = me.depositAmt + me.entryFeeAmt;
  return (
    <PbZone label="Pending" lead="신청했어요 — 입금이 확인되면 승인돼요">
      <CardItem className="flex flex-col gap-4 p-5">
        <div className="flex flex-col items-center gap-1 text-center">
          <Caption>모임 계좌로 보내 주세요</Caption>
          <span className="font-numeric text-[34px] font-medium leading-none tabular-nums text-foreground">
            {total.toLocaleString()}
            <span className="ml-0.5 text-lg text-muted-foreground">원</span>
          </span>
          {me.joinWkNo > 1 && <Micro>{wkLabel(me.joinWkNo)} 합류 기준</Micro>}
        </div>

        <div className="flex flex-col rounded-xl bg-muted px-4 py-1">
          {me.depositAmt > 0 && (
            <div className="rule-row flex items-start justify-between gap-3 py-3">
              <span className="flex flex-col gap-0.5">
                <Caption className="font-medium text-foreground">보증금</Caption>
                {dc > 0 && (
                  <Micro className="font-semibold text-primary">마일리지런 참가자 보증금 −{dc.toLocaleString()}원</Micro>
                )}
              </span>
              <Body className="tabular-nums">{me.depositAmt.toLocaleString()}원</Body>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3 py-3">
            <Caption className="font-medium text-foreground">참가비</Caption>
            <Body className="tabular-nums">{me.entryFeeAmt.toLocaleString()}원</Body>
          </div>
        </div>

        <AccountCopyButton />
        <Caption className="text-center">입금이 확인되면 운영진이 승인해요.</Caption>
      </CardItem>
    </PbZone>
  );
}
