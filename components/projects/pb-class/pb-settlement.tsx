import type { PbClassBoard } from "@/lib/queries/pb-class";

import { StatCard } from "@/components/common/stat-card";
import { Caption } from "@/components/common/typography";
import { PB_MONEY_USE_DETAIL_TXT, PB_MONEY_USE_TXT } from "./format";
import { PbZone } from "./pb-zone";

/**
 * 정산 — 크루 전체의 보증금·환급 **합계**만.
 *
 * 예전엔 아래에 이름 · 출석 · 환급 목록이 붙어 있었는데 오너가 걷어 냈다(2026-10-08: 「이름별 출석, 환급은
 * 필요 없어」). 누가 몇 번 나왔는지는 점수판의 크루 출석표가 답하고, 남의 환급액까지 한 줄씩 늘어놓을
 * 이유는 없다 — 내 환급은 맨 위 「내 출석 · 환급」 카드가 말한다.
 *
 * 환급은 **지금까지의 출석 기준 예정액**이라 매주 바뀐다. 숫자는 전부 서버가
 * `summarizeRefund`로 낸 값(`board.totals`)을 그대로 쓴다 — 관리자 표와 같은 값이라
 * 화면이 다시 계산하면 사람 돈이 어긋날 자리가 생긴다. 입금 대기자는 아직 받은 돈이 아니라 합계에서 뺀다.
 */
export function PbSettlement({ board }: { board: PbClassBoard }) {
  const { totals } = board;

  return (
    <PbZone label="Settlement" lead="지금까지의 출석이면 이렇게 돌려드려요">
      <div className="grid grid-cols-2 gap-3 tabular-nums">
        {/* 보증금 합계는 두 칸 — 7자리 금액이 반칸에 들어가면 넘친다 */}
        <StatCard className="col-span-2" value={`${totals.depositSum.toLocaleString()}원`} label="보증금 합계" />
        <StatCard value={`${totals.refundSum.toLocaleString()}원`} label="환급 예정" />
        <StatCard value={`${totals.unrefundedSum.toLocaleString()}원`} label="미환급 · 회식비·운영비" />
      </div>

      <Caption className="leading-relaxed">
        출석이 늘면 매주 바뀌어요. 시즌이 끝나면 이 금액으로 정산해요.
      </Caption>
      {/* 「미환급」이 어디에 쓰이는지 — 안내 탭 정산 칸과 같은 문구(`format.ts`)라 한쪽만 옛 말로 남지 않는다 */}
      <Caption className="break-keep leading-relaxed">
        {`${PB_MONEY_USE_TXT}. ${PB_MONEY_USE_DETAIL_TXT}.`}
      </Caption>
    </PbZone>
  );
}
