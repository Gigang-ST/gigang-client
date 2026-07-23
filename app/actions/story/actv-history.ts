"use server";

import { withActive } from "@/lib/actions/auth";
import { getActvMonthRange } from "@/lib/activity-index";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/** 내역 한 줄 — 원장 1행을 화면용으로 줄인 것 */
export type ActvHistoryEntry = {
  id: string;
  /** 귀속일 YYYY-MM-DD (KST) */
  aply_dt: string;
  /** `pt_actv_type_enm` 원본 코드 — 라벨 변환은 `getActvTypeLabel()` */
  actv_type: string;
  /** 증감량. 회수는 음수 */
  amount: number;
  /** 사람이 읽을 사유. 회수 행에서 특히 중요 */
  rsn_txt: string | null;
};

export type ActvHistoryResult =
  | { ok: false; message: string }
  | { ok: true; entries: ActvHistoryEntry[]; total: number };

/** 한 달치 내역이 이보다 길어질 일은 없다. 방어적 상한 */
const MAX_ROWS = 200;

/**
 * 이번 달 활동량 내역 — 귀속일(`aply_dt`) 역순.
 *
 * 활동량 랭킹이 공개 지표라 남의 내역도 볼 수 있다. 다만 원장 조회는 로그인·활동 멤버로
 * 제한한다(비로그인 스크래핑 방지). 전광판은 비로그인도 보이므로 호출부가 버튼 자체를 가린다.
 *
 * 구간은 랭킹 집계(`get_team_story_feed`의 `actv_rank`)와 **정확히 같아야 한다** —
 * 합계가 랭킹 숫자와 안 맞으면 그게 곧 버그로 읽힌다. 그래서 경계를 `getActvMonthRange()`
 * 한 곳에서 가져온다. 상한(`to`=오늘)이 특히 중요하다: 대회 적립은 **개최일**에 귀속되므로
 * 없으면 미래 대회 신청분이 이번 달에 미리 잡힌다.
 */
export async function getActvHistory(memId: string): Promise<ActvHistoryResult> {
  try {
    return await withActive(async () => {
      const { teamId } = await getRequestTeamContext();
      const { from, to } = getActvMonthRange();
      const db = createAdminClient();

      const { data, error } = await db
        .from("pt_txn_hist")
        .select("pt_txn_id, aply_dt, actv_type_enm, pt_amt, rsn_txt")
        .eq("team_id", teamId)
        .eq("mem_id", memId)
        .gte("aply_dt", from)
        .lte("aply_dt", to)
        .order("aply_dt", { ascending: false })
        .order("crt_at", { ascending: false })
        .limit(MAX_ROWS);

      if (error) {
        console.error("[getActvHistory] 내역 조회 실패", error);
        return { ok: false as const, message: "잠시 후 다시 시도해 주세요" };
      }

      const entries: ActvHistoryEntry[] = (data ?? []).map((row) => ({
        id: row.pt_txn_id,
        aply_dt: row.aply_dt,
        actv_type: row.actv_type_enm,
        amount: row.pt_amt,
        rsn_txt: row.rsn_txt,
      }));

      return {
        ok: true as const,
        entries,
        total: entries.reduce((sum, e) => sum + e.amount, 0),
      };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}
