import { pickRecapPageExtras, type MileageRecap } from "@/lib/mileage-recap";
import type { RecapParty } from "@/lib/mileage-recap-seasons";

import { RecapCelebrate } from "./recap-celebrate";
import {
  RecapAwards,
  RecapBonus,
  RecapCalendar,
  RecapCities,
  RecapCredits,
  RecapFinale,
  RecapHero,
  RecapLastDay,
  RecapMasthead,
  RecapMemoriesZone,
  RecapMySeason,
  RecapNumbers,
  RecapRhythm,
} from "./recap-sections";

/**
 * 돌아보기 본문 — 진짜 페이지(`/projects/recap`)가 그린다.
 *
 * 순서(크루가 정한 것): 돌아보기(히어로) → 마이 시즌 → 메모리스 → 크루 → 어워즈 → 넘버스 →
 * 에브리데이 → 시티스 → 웬 → 보너스 → 라스트 데이 → 마무리(인사·단체사진·회식 초대).
 * 사람(나·추억·크루·시상)이 먼저 오고 숫자(넘버스~보너스)가 뒤를 받친 다음, 마지막 날로 닫는다.
 *
 * 들어올 때마다 바뀌는 것(수상자 옆 한 장·내 한 장·추억 첫 장)은 여기서 서버가 뽑는다.
 */
export function RecapPage({
  recap,
  myMemId,
  party = null,
  groupPhotoUrls = [],
}: {
  recap: MileageRecap;
  myMemId: string | null;
  /** 시즌 마무리 회식 — 아직 안 열렸을 때만 넘긴다(지난 회식에 오라고 하지 않게) */
  party?: RecapParty | null;
  /** 마무리 인사 위 단체사진들(`RECAP_SEASON_EXTRAS`) */
  groupPhotoUrls?: string[];
}) {
  // 사람별 집계는 **내 것만** 넘긴다 — 전원 몫을 클라이언트 payload에 실을 이유가 없다.
  const { members, ...view } = recap;
  const mine = myMemId ? (members[myMemId] ?? null) : null;
  const extras = pickRecapPageExtras(view, mine ? myMemId : null);

  return (
    <div className="flex flex-col gap-16 pb-24">
      <div className="flex flex-col">
        <RecapMasthead recap={view} />
        <RecapHero recap={view} />
      </div>
      {mine && <RecapMySeason mine={mine} awards={view.awards} myMemory={extras.myMemory} />}
      <RecapMemoriesZone
        recap={view}
        initialIndex={extras.memoryStart}
        upcoming={extras.memoryQueue}
      />
      <RecapCredits recap={view} />
      {/* 시상식 입장 — 가입 완료 화면과 같은 폭죽이 한 번 터진다 */}
      <RecapCelebrate>
        <RecapAwards recap={view} winnerMemories={extras.winnerMemories} />
      </RecapCelebrate>
      <RecapNumbers recap={view} />
      <RecapCalendar recap={view} />
      <RecapCities recap={view} />
      <RecapRhythm recap={view} />
      <RecapBonus recap={view} />
      <RecapLastDay recap={view} />
      <RecapFinale recap={view} party={party} groupPhotoUrls={groupPhotoUrls} />
    </div>
  );
}
