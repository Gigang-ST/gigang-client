import { remainingSessCnt, type PbClassCfg } from "@/lib/pb-class";
import type { PbParticipant } from "@/lib/queries/pb-class";

import { HelpTip } from "@/components/common/help-tip";
import { StatCard } from "@/components/common/stat-card";
import { Caption } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";

/**
 * 승인된 참가자의 숫자 3개 — 내 출석 · 환급 예상 · 전액까지.
 *
 * 분모(`remainingSessCnt`)는 **합류 시점 산술값**이다. 연결된 벙 수를 세면 한파로 연결이
 * 빠지는 순간 내 분모가 조용히 바뀐다(#577 「분모를 바꾸지 않는다」).
 * 환급 계산은 서버가 `summarizeRefund`로 낸 `me.summary`를 그대로 쓴다 — 관리자 표와 같은 값.
 */
export function PbMyStatus({ me, cfg }: { me: PbParticipant; cfg: PbClassCfg }) {
  const { summary } = me;
  const remaining = remainingSessCnt(me.joinWkNo, cfg);
  const attdLabel = me.joinWkNo > 1 ? `내 출석 · W${me.joinWkNo} 합류` : "내 출석";
  const attdValue = (
    <>
      {summary.attdCnt}
      <span className="text-base font-medium text-muted-foreground"> / {remaining}</span>
    </>
  );

  // 늦은 합류 — 환급 칸이 전부 0원/없음이라 보여 줄수록 오해만 낳는다. 줄을 통째로 바꾼다.
  if (summary.late || summary.required === null) {
    return (
      <div className="flex flex-col gap-3">
        <StatCard value={attdValue} label={attdLabel} />
        <CardItem variant="dashed" className="text-center">
          <Caption className="text-foreground">
            보증금 없이 참가 중이에요 — 환급 대상이 아니에요
          </Caption>
        </CardItem>
      </div>
    );
  }

  const { required, toFull, refund } = summary;
  const perAttd = Math.floor(me.depositAmt / required);
  const full = toFull === 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard value={attdValue} label={attdLabel} />
      <StatCard
        value={full ? "전액 확보" : `${toFull}회`}
        label="전액까지"
        valueClassName={full ? "text-success" : undefined}
      />
      {/* 환급 예상은 두 칸을 쓴다 — 4자리 금액이 반칸에 들어가면 넘치거나 글씨가 줄어든다 */}
      <div className="relative col-span-2">
        <StatCard value={`${refund.toLocaleString()}원`} label="환급 예상" />
        <HelpTip title="환급 예상" className="absolute right-1 top-1">
          출석 1회마다 보증금의 1/{required}({perAttd.toLocaleString()}원)을 돌려받아요.{" "}
          {me.joinWkNo > 1
            ? `W${me.joinWkNo} 합류라 남은 ${remaining}회 중 ${required}회 출석하면 전액이에요.`
            : `${cfg.totSessCnt}회 중 ${required}회 출석하면 전액이에요.`}
        </HelpTip>
      </div>
    </div>
  );
}
