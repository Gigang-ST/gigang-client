import "server-only";

import { dayjs } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 온보딩 6단계(참석 약속) 모임 선택 화면에 노출할 열린 모임.
 * 설계: docs/design/2026-07-08-뉴비온보딩-유령회원방지.md §4.1
 */
export type PledgeGathering = {
  gthrId: string;
  gthrNm: string;
  sttAt: string;
  locTxt: string | null;
  gthrTypeEnm: string;
};

/** 온보딩 페이지 노출 한도 */
const PLEDGE_GATHERING_LIMIT = 12;

/**
 * 아직 가입하지 않은 유저(온보딩 위저드) 대상으로 열린 모임 목록을 조회한다.
 * RLS를 타지 않는 admin 클라이언트 사용 — 온보딩 시점엔 mem_mst 행이 없어 authenticated
 * 정책(본인 mem_id 매칭류)이 통과되지 않기 때문.
 *
 * 조건: stt_at > now() AND del_yn = false AND 팀 일치, 정원(max_prt_cnt) 있는 모임은
 * 참석 인원 >= 정원이면 제외. 결과가 많지 않은 도메인이라 참석수는 IN 집계 1회로 가져온다.
 */
export async function getOpenGatheringsForPledge(): Promise<PledgeGathering[]> {
  const admin = createAdminClient();
  const { teamId } = await getRequestTeamContext();
  const nowIso = dayjs().toISOString();

  const { data: gatherings, error } = await admin
    .from("gthr_mst")
    .select("gthr_id, gthr_nm, gthr_type_enm, stt_at, loc_txt, max_prt_cnt")
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .gt("stt_at", nowIso)
    .order("stt_at", { ascending: true })
    // 정원 마감 모임이 섞여 있을 수 있어 여유 있게 가져온 뒤 아래서 필터링한다.
    .limit(PLEDGE_GATHERING_LIMIT * 2);

  if (error) {
    console.error("[onboarding] 참석 약속용 모임 조회 실패", error.message);
    return [];
  }
  if (!gatherings?.length) return [];

  const capped = gatherings.filter((g) => g.max_prt_cnt !== null);
  let attdCountByGthrId = new Map<string, number>();

  if (capped.length > 0) {
    const { data: attdRows, error: attdErr } = await admin
      .from("gthr_attd_rel")
      .select("gthr_id")
      .in(
        "gthr_id",
        capped.map((g) => g.gthr_id),
      );

    if (attdErr) {
      console.error("[onboarding] 모임 참석수 집계 실패", attdErr.message);
    } else {
      attdCountByGthrId = (attdRows ?? []).reduce((acc, r) => {
        acc.set(r.gthr_id, (acc.get(r.gthr_id) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());
    }
  }

  return gatherings
    .filter((g) => {
      if (g.max_prt_cnt === null) return true;
      const attdCount = attdCountByGthrId.get(g.gthr_id) ?? 0;
      return attdCount < g.max_prt_cnt;
    })
    .slice(0, PLEDGE_GATHERING_LIMIT)
    .map((g) => ({
      gthrId: g.gthr_id,
      gthrNm: g.gthr_nm,
      sttAt: g.stt_at,
      locTxt: g.loc_txt,
      gthrTypeEnm: g.gthr_type_enm,
    }));
}
