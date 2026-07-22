import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

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
  rctn_count: number;
  /** 로그인 사용자가 이미 누른 리액션 (없으면 null) */
  my_rctn: RctnCd | null;
};

export type StoryNewbie = ReactableItem & {
  entity_type: "newbie";
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
};

export type StoryRecord = ReactableItem & {
  entity_type: "record";
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  sport: string;
  evt: string;
  rec_time_sec: number;
  race_nm: string | null;
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

export type StoryFeed = {
  newbies: StoryNewbie[];
  records: StoryRecord[];
  races: StoryRace[];
  month_rank: StoryRankEntry[];
  actv_rank: StoryActvRankEntry[];
  week_stat: StoryWeekStat;
};

const EMPTY_FEED: StoryFeed = {
  newbies: [],
  records: [],
  races: [],
  month_rank: [],
  actv_rank: [],
  week_stat: { gthr_cnt: 0, attd_cnt: 0, rec_cnt: 0 },
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
        console.error("[getStoryFeed] 전광판 피드 조회 실패", error);
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
