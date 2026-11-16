import "server-only";
import { unstable_cache } from "next/cache";

import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";
import { dayjs, todayKST } from "@/lib/dayjs";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { teamCacheTags } from "@/lib/team-cache-tag";
import {
  buildUpcomingSection,
  type UpcomingGathering,
  type UpcomingProject,
} from "@/lib/seo/llms/upcoming";

/** 앞으로 며칠치를 싣는가 */
export const LLMS_UPCOMING_DAYS = 14;
/** 모임이 폭주해도 본문이 부풀지 않게 */
const GATHERING_LIMIT = 30;

/**
 * llms.txt 에 실을 「다가오는 일정」 섹션 글. 모임(`gthr_mst`)과 진행 중 프로젝트(`evt_team_mst` ACTIVE)만 읽는다.
 *
 * - 공개 범위는 OG 카드와 같다(이름·시각·장소) — 포맷터 머리 주석 참고. 참석(`gthr_attd_rel`) 테이블은 안 건드린다.
 * - 캐시는 홈 캘린더 태그를 같이 쓴다(`getCachedGatheringOg` 와 같은 이유 — 모임 생성·수정·삭제 때 같이 털린다).
 *   시간 기준 1시간 재검증이라 크롤러가 몰려도 DB 호출은 팀당 시간당 ~1회다. 키에 오늘 날짜를 넣지 않는다 —
 *   자정마다 캐시가 비는 걸 피하고, 1시간 안의 어긋남은 허용한다(콜백 안에서 지금을 읽는다).
 * - 조회 실패는 빈 일정으로 물러난다(llms.txt 전체가 500 이 되는 것보다 낫다).
 */
export function getCachedLlmsUpcoming(teamId: string): Promise<string> {
  return unstable_cache(
    async (): Promise<string> => {
      const admin = createUntypedAdminClient();
      const nowIso = dayjs().toISOString();
      const untilIso = dayjs().add(LLMS_UPCOMING_DAYS, "day").toISOString();
      const today = todayKST();

      const [gthr, evt] = await Promise.all([
        admin
          .from("gthr_mst")
          .select("gthr_nm, stt_at, loc_txt")
          .eq("team_id", teamId)
          .eq("del_yn", false)
          .gt("stt_at", nowIso)
          .lte("stt_at", untilIso)
          .order("stt_at", { ascending: true })
          .limit(GATHERING_LIMIT),
        admin
          .from("evt_team_mst")
          .select("evt_nm, stt_dt, end_dt")
          .eq("team_id", teamId)
          .eq("stts_enm", "ACTIVE")
          .gte("end_dt", today)
          .order("stt_dt", { ascending: true }),
      ]);

      if (gthr.error) console.error("[llms.txt] 모임 조회 실패", gthr.error.message);
      if (evt.error) console.error("[llms.txt] 프로젝트 조회 실패", evt.error.message);

      const gatherings: UpcomingGathering[] = (gthr.data ?? []).map((r) => ({
        gthrNm: r.gthr_nm as string,
        sttAt: r.stt_at as string,
        locTxt: (r.loc_txt as string | null) ?? null,
      }));
      const projects: UpcomingProject[] = (evt.data ?? []).map((r) => ({
        evtNm: r.evt_nm as string,
        sttDt: r.stt_dt as string,
        endDt: r.end_dt as string,
      }));

      return buildUpcomingSection({ gatherings, projects, days: LLMS_UPCOMING_DAYS });
    },
    ["llms-upcoming", teamId],
    { tags: teamCacheTags(HOME_CALENDAR_CACHE_TAG, teamId), revalidate: 3600 },
  )();
}
