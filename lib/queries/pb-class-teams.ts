import type { SupabaseClient } from "@supabase/supabase-js";

import type { StoryPost } from "@/lib/queries/story-posts";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Database } from "@/lib/supabase/database.types";
import { pickNextTraining } from "@/lib/pb-class-teams";

type Db = SupabaseClient<Database>;

/**
 * PB 클래스 「Teams」 칸의 팀원 사진 — 동계 훈련 기간(프로젝트 시작일~)에 참가자들이 깅스타그램에 올린 사진 글.
 *
 * 전광판의 `get_team_posts`는 16건씩 끊어 주는 지면용이라(팀 전체 최신순) 참가자 사진이 그 안에 다 들어온다는
 * 보장이 없다. 그래서 `post_mst`를 직접 읽는다 — SELECT 정책이 공개(`del_yn = false`)라 회원 세션으로 읽힌다.
 * 거르는 규칙은 그 RPC와 같다: 깅스타그램(`record_flex`) · 안 지운 것 · **사진 있는 것만**.
 * 기간이 지날수록 느는 조회라 `fetchAllRows`로 끝까지 읽는다(AGENTS.md §대량 조회).
 *
 * 이름·얼굴은 참가자 목록이 이미 들고 있어 조인하지 않는다(`names`로 받는다). 댓글 수·대표 칭호는 옵셔널이라
 * 비워 둔다 — 릴스 뷰어가 댓글 수를 직접 잰다.
 */
export async function loadPbTeamPhotos(
  db: Db,
  args: {
    teamId: string;
    memIds: readonly string[];
    /** 프로젝트 시작일(YYYY-MM-DD) — 활동일(`act_dt`, date 컬럼) 기준으로 자른다 */
    sttDt: string;
    names: ReadonlyMap<string, { memNm: string; avatarUrl: string | null }>;
  },
): Promise<StoryPost[]> {
  const { teamId, memIds, sttDt, names } = args;
  if (memIds.length === 0) return [];

  const rows = await fetchAllRows(
    () =>
      db
        .from("post_mst")
        .select("post_id, mem_id, photo_url, cmnt_txt, dst_km, sprt_enm, act_dt, src_enm, crt_at")
        .eq("team_id", teamId)
        .eq("post_type_enm", "record_flex")
        .eq("del_yn", false)
        .not("photo_url", "is", null)
        .gte("act_dt", sttDt)
        .in("mem_id", [...memIds])
        // 전광판과 같은 순서 — 활동일 → 작성 시각 → id(페이지 경계가 안전하게 유일 키로 끝낸다)
        .order("act_dt", { ascending: false })
        .order("crt_at", { ascending: false })
        .order("post_id", { ascending: false }),
    { label: "pb-teams:post_mst" },
  );

  return rows.map((r) => {
    const who = names.get(r.mem_id);
    return {
      post_id: r.post_id,
      mem_id: r.mem_id,
      mem_nm: who?.memNm ?? "(알 수 없음)",
      avatar_url: who?.avatarUrl ?? null,
      photo_url: r.photo_url,
      cmnt_txt: r.cmnt_txt,
      dst_km: r.dst_km,
      sprt_enm: r.sprt_enm,
      act_dt: r.act_dt,
      src_enm: r.src_enm,
      crt_at: r.crt_at,
    };
  });
}

/** 다가오는 공식훈련 한 회차 — 참석을 누른 사람 id 와 함께 */
export type PbNextTraining = {
  gthrId: string;
  /** 시작 시각(timestamptz ISO) */
  sttAt: string;
  /** 참석 누른 사람 전원(프로젝트 참가자가 아닌 사람도 포함 — 모임 상세의 참석 수와 같다) */
  attendeeIds: string[];
};

/**
 * 이 프로젝트에 연결된 공식훈련·측정 벙 중 **아직 시작하지 않은 가장 가까운 회차**와 그 참석자(#698).
 *
 * 누적 출석 보드(`loadPbClassBoard`)는 지난 회차만 세고 캐시도 물고 있어 쓰지 않는다 — 참석 취소·누름이
 * 바로 보이려면 이 조회는 요청마다 읽는다(두 번의 가벼운 SELECT). 권한은 별도 필요 없다:
 * `evt_gthr_rel`·`gthr_mst`·`gthr_attd_rel` SELECT 정책이 모두 「같은 팀 멤버」라 일반 팀원 세션으로 읽힌다.
 * 삭제(한파 취소)된 벙은 `gthr_mst` RLS 가 걸러 임베드가 null 로 온다 — 건너뛴다.
 * 다가오는 회차가 없으면 null.
 */
export async function loadNextPbTraining(db: Db, evtId: string, nowIso: string): Promise<PbNextTraining | null> {
  const { data, error } = await db
    .from("evt_gthr_rel")
    .select("gthr_id, gthr_mst(stt_at, del_yn)")
    .eq("evt_id", evtId);
  if (error) throw new Error(`loadNextPbTraining 조회 실패: ${error.message}`);

  const next = pickNextTraining(
    (data ?? []).map((r) => {
      const g = Array.isArray(r.gthr_mst) ? r.gthr_mst[0] : r.gthr_mst;
      return { gthrId: r.gthr_id, sttAt: g?.stt_at ?? null, delYn: g?.del_yn ?? true };
    }),
    nowIso,
  );
  if (!next) return null;

  const rows = await fetchAllRows(
    () => db.from("gthr_attd_rel").select("mem_id").eq("gthr_id", next.gthrId).order("attd_id", { ascending: true }),
    { label: "pb-teams:next-gthr_attd_rel" },
  );
  return { ...next, attendeeIds: rows.map((r) => r.mem_id) };
}
