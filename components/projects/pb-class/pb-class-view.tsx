import { nowKST, parseEventTime } from "@/lib/dayjs";
import { loadMyPbClass } from "@/lib/queries/pb-class";
import { getCurrentMember } from "@/lib/queries/member";

import { EmptyState } from "@/components/common/empty-state";
import { Caption } from "@/components/common/typography";
import { CardItem } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";

import { PbApplySection } from "./pb-apply-section";
import { PbMyStatus } from "./pb-my-status";
import { PbPendingCard } from "./pb-pending-card";
import { PbRulesButton } from "./pb-rules-button";
import { PbRulesContent } from "./pb-rules-content";
import { PbSessionStrip } from "./pb-session-strip";

type PbClassViewProps = {
  event: { evt_id: string; evt_nm: string; stt_dt: string; end_dt: string };
  /** 비활성/탈퇴 회원 — 신청 시 공통 안내 게이트를 연다 */
  isInactive: boolean;
  inactiveKind?: "inactive" | "left";
};

/**
 * 프로젝트 탭의 겨울 10K PB 클래스 뷰 — 미신청 / 입금 대기 / 승인(출석·환급) 세 갈래.
 *
 * 기간제 마일리지런과 달리 월 이동도 차트도 없다. 출석(공식훈련 벙 참석)이 곧 실적이라
 * 화면이 짧고, 점수·팀전은 2단계 몫이라 여기엔 없다.
 */
export async function PbClassView({ event, isInactive, inactiveKind }: PbClassViewProps) {
  const { member, supabase } = await getCurrentMember();

  const title = (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 className="min-w-0 truncate whitespace-nowrap text-lg font-bold tracking-tight sm:text-xl">
        {event.evt_nm}
      </h2>
      {/* date 컬럼(_dt)이라 그대로 찍어도 어느 타임존에서나 같은 날짜다 */}
      <Caption>
        {parseEventTime(event.stt_dt).format("YYYY.M.D")} ~ {parseEventTime(event.end_dt).format("YYYY.M.D")}
      </Caption>
    </div>
  );

  // 로그인했지만 크루 가입 전 — 신청 대상이 아니다(참가자 행이 mem_id에 걸린다)
  if (!member) {
    return (
      <>
        {title}
        <EmptyState variant="card" message="크루 가입을 마치면 참가 신청할 수 있어요." />
      </>
    );
  }

  const data = await loadMyPbClass(supabase, event.evt_id, member.id, nowKST().toISOString());
  if (!data) {
    return (
      <>
        {title}
        <EmptyState variant="card" message="프로젝트 정보를 불러오지 못했어요." />
      </>
    );
  }

  const { cfg, sessions, me, currentWkNo } = data;

  // 미신청 — 규칙 요약 + 신청
  if (!me) {
    return (
      <>
        {title}
        <div className="flex flex-col gap-4">
          <SectionHeader label="RULES" />
          <CardItem className="p-5">
            <PbRulesContent cfg={cfg} />
          </CardItem>
        </div>
        <PbApplySection
          evtId={event.evt_id}
          cfg={cfg}
          currentWkNo={currentWkNo}
          isInactive={isInactive}
          inactiveKind={inactiveKind}
        />
      </>
    );
  }

  // 신청 완료 · 입금 확인 대기
  if (!me.aprvYn) {
    return (
      <>
        {title}
        <PbPendingCard amount={me.depositAmt + me.entryFeeAmt} />
        <PbRulesButton cfg={cfg} />
      </>
    );
  }

  // 승인 — 출석·환급 + 회차 띠
  return (
    <>
      {title}
      <PbMyStatus me={me} cfg={cfg} />
      <PbSessionStrip me={me} sessions={sessions} cfg={cfg} />
      <PbRulesButton cfg={cfg} />
    </>
  );
}
