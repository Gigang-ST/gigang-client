import "server-only";

import { unstable_cache } from "next/cache";

import { reactionKey, type MyReactionMap } from "@/lib/story-reaction";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRequestAbortError } from "@/lib/supabase/is-abort-error";

import type { MemberCardCompactData } from "@/lib/queries/member-card";

/** 리액션 코드 정본 6종 — DB CHECK 제약(`rctn_mst_rctn_cd_chk`)과 동일 목록 */
export const RCTN_CODES = [
  "welcome",
  "fire",
  "cheer",
  "clap",
  "lol",
  "boo",
] as const;

export type RctnCd = (typeof RCTN_CODES)[number];

/** 리액션이 붙을 수 있는 아이템 종류 */
export type StoryEntityType = "newbie" | "record" | "race";

type ReactableItem = {
  entity_type: StoryEntityType;
  entity_id: string;
  event_at: string;
  /** 이 아이템에 어울리는 리액션 1종 */
  rctn_cd: RctnCd;
  /** 항목 총합 — 모든 멤버의 누른 횟수 합계(sum(rctn_cnt)) */
  rctn_count: number;
  /** 로그인 사용자가 이미 누른 리액션 (없으면 null) */
  my_rctn: RctnCd | null;
  /** 로그인 사용자가 이 항목에 누른 누적 횟수. 상한(99) 도달 판정용 */
  my_cnt: number;
};

export type StoryNewbie = ReactableItem & {
  entity_type: "newbie";
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
} & MemberCardCompactData;

export type StoryRecord = ReactableItem & {
  entity_type: "record";
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  sport: string;
  evt: string;
  rec_time_sec: number;
  race_nm: string | null;
  /** 대회 개최일 YYYY-MM-DD — 목록에 함께 표시하고 최근 30일 판정에도 쓴다 */
  race_dt: string | null;
};

export type StoryRace = ReactableItem & {
  entity_type: "race";
  comp_id: string;
  short_id: string | null;
  comp_nm: string;
  stt_dt: string;
  reg_cnt: number;
  runners: { mem_id: string; mem_nm: string; avatar_url: string | null }[];
};

export type StoryRankEntry = {
  rank: number;
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  attd_cnt: number;
};

/**
 * 기강활동지수 랭킹 항목 (전체 누적 합산, 상위 10명).
 * `actv_score`는 내부적으로 기강 포인트 원장(`pt_txn_hist`)을 합산한 값이지만,
 * 기강 포인트는 히든 운영이라 이 타입·API 표면에는 "포인트" 표기를 쓰지 않는다.
 */
export type StoryActvRankEntry = {
  rank: number;
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  actv_score: number;
};

/** 이번 주(KST, 월요일 시작 ~ now) 크루 합계 통계 */
export type StoryWeekStat = {
  gthr_cnt: number;
  attd_cnt: number;
  rec_cnt: number;
};

/**
 * 멤버 각오(한 줄 다짐) — 만료 없이 누적, 최근순 노출.
 * 리액션이 붙지 않아(현재 스콥) `ReactableItem`을 상속하지 않는다 — newbie/record/race와
 * 형태가 다르다는 뜻이므로 스토리 UI에서 리액션 버튼을 실수로 붙이지 않도록 타입으로 막는다.
 */
export type StoryPledge = {
  pldg_id: string;
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  pldg_txt: string;
  /** ISO timestamptz 문자열 — 표시 시 dayjs(val)로 상대시간 변환 */
  crt_at: string;
};

export type StoryFeed = {
  newbies: StoryNewbie[];
  records: StoryRecord[];
  races: StoryRace[];
  month_rank: StoryRankEntry[];
  actv_rank: StoryActvRankEntry[];
  week_stat: StoryWeekStat;
  pledges: StoryPledge[];
};

const EMPTY_FEED: StoryFeed = {
  newbies: [],
  records: [],
  races: [],
  month_rank: [],
  actv_rank: [],
  week_stat: { gthr_cnt: 0, attd_cnt: 0, rec_cnt: 0 },
  pledges: [],
};

/**
 * 전광판 피드 조회.
 *
 * 공개 데이터라 캐시하되, **리액션 카운트·내 리액션은 캐시에 태우지 않는다** — `p_mem_id`를
 * 넘기지 않고 조회한 뒤, 내 리액션은 클라이언트가 오버레이한다(홈의 `is_attending` 패턴).
 * 그래야 사용자마다 캐시가 갈라지지 않는다.
 */
export function getStoryFeed(teamId: string): Promise<StoryFeed> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc("get_team_story_feed", {
        p_team_id: teamId,
      });

      if (error) {
        if (!isRequestAbortError(error)) {
          console.error("[getStoryFeed] 전광판 피드 조회 실패", error);
        }
        return EMPTY_FEED;
      }

      // 구버전 RPC가 아직 배포된 환경에서는 새 키(actv_rank·week_stat)가 없다.
      // 캐스팅만 하면 클라이언트가 undefined를 만나 터지므로 기본값 위에 덮어쓴다.
      return { ...EMPTY_FEED, ...((data as Partial<StoryFeed> | null) ?? {}) };
    },
    ["story-feed", teamId],
    { tags: ["story-feed", "gatherings", "records", "competitions"], revalidate: 300 },
  )();
}

/** 항목별 응원 — 모두의 누적 총합(total)과 내가 누른 몫(mine) */
export type StoryReactionCounts = {
  /** `entity_type:entity_id` → 모든 멤버 합계 */
  totals: MyReactionMap;
  /** `entity_type:entity_id` → 내가 누른 누적 (비로그인이면 빈 맵) */
  mine: MyReactionMap;
};

/**
 * 항목별 응원 총합 — 모든 멤버 합계. **30초 캐시.**
 *
 * 피드 본문 캐시(5분)에 응원 총합을 실으면 "모두가 누른 만큼 쌓여 보인다"는 게 5분씩 밀린다.
 * 그렇다고 매 요청 집계하면 트래픽이 늘 때 부담이라, 공개 집계인 총합만 **짧게(30초)** 캐시한다
 * — 실시간까지는 아니어도 "일정 시간마다 누적 합산"이면 된다는 요구에 맞춘 절충.
 * `revalidateTag`는 응원마다 부르지 않는다(연타로 캐시가 남아나지 않는다) — 시간 만료에 맡긴다.
 *
 * `rctn_mst`는 (팀 × 항목 × 멤버) 1행 구조라 한 팀 분량은 작다. 항목이 많아지면 DB 집계 RPC로 옮긴다.
 */
function getReactionTotals(teamId: string): Promise<MyReactionMap> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("rctn_mst")
        .select("entity_type, entity_id, rctn_cnt")
        .eq("team_id", teamId);

      if (error) {
        if (!isRequestAbortError(error)) {
          console.error("[getReactionTotals] 응원 총합 조회 실패", error);
        }
        return {};
      }

      const totals: MyReactionMap = {};
      for (const row of data ?? []) {
        const key = reactionKey(row.entity_type as StoryEntityType, row.entity_id);
        totals[key] = (totals[key] ?? 0) + row.rctn_cnt;
      }
      return totals;
    },
    ["story-reaction-totals", teamId],
    { tags: ["story-reactions"], revalidate: 30 },
  )();
}

/**
 * 전광판 응원 집계 — 총합(30초 캐시)과 내 몫(비캐시)을 합쳐 돌려준다.
 *
 * 총합은 사용자와 무관하니 캐시에서 공유하고, 내 몫은 사용자별이라 캐시하면 갈라지므로 매번
 * 최신으로 읽는다(내 필터라 가볍다). 클라이언트는 리드의 총합·내 몫을 이걸로 오버레이한다.
 * memId가 없으면(비로그인) mine은 빈 맵.
 */
export async function getStoryReactions(
  teamId: string,
  memId: string | null,
): Promise<StoryReactionCounts> {
  const totals = await getReactionTotals(teamId);
  if (!memId) return { totals, mine: {} };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("rctn_mst")
    .select("entity_type, entity_id, rctn_cnt")
    .eq("team_id", teamId)
    .eq("mem_id", memId);

  if (error) {
    if (!isRequestAbortError(error)) {
      console.error("[getStoryReactions] 내 응원 조회 실패", error);
    }
    return { totals, mine: {} };
  }

  const mine: MyReactionMap = {};
  for (const row of data ?? []) {
    mine[reactionKey(row.entity_type as StoryEntityType, row.entity_id)] =
      row.rctn_cnt;
  }
  return { totals, mine };
}
