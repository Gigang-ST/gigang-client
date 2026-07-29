"use server";

import { withActive } from "@/lib/actions/auth";
import { getActvMonthRange } from "@/lib/activity-index";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/** 내역 한 줄 — 원장의 "적립↔회수 짝"을 하나로 합친 순액 한 건 */
export type ActvHistoryEntry = {
  id: string;
  /** 귀속일 YYYY-MM-DD (KST) */
  aply_dt: string;
  /** `pt_actv_type_enm` 원본 코드 — 라벨 변환은 `getActvTypeLabel()` */
  actv_type: string;
  /** 획득 순액 — 항상 양수(회수된 짝은 이 목록에서 아예 빠진다) */
  amount: number;
  /** 사람이 읽을 사유(적립 행 기준) */
  rsn_txt: string | null;
};

/** 원장에서 뽑아오는 원본 행 — 짝 맞춤·순액 계산에 쓴다 */
type LedgerRow = {
  pt_txn_id: string;
  aply_dt: string;
  actv_type_enm: string;
  pt_amt: number;
  ref_id: string | null;
  rsn_txt: string | null;
};

/**
 * 짝 키 — 어떤 적립과 회수가 한 쌍인지 정한다(트리거의 net 판정과 같은 기준).
 * 대부분 `(활동유형, ref_id)`지만, 마일리지런 기록만 ref_id가 NULL이라 `(mlg_record, 귀속일)`로 짝짓는다
 * (하루 1건 규칙이라 날짜가 곧 키). ref_id도 없는 예외(수동조정 등)는 행마다 독립 취급.
 */
function pairKey(row: LedgerRow): string {
  if (row.actv_type_enm === "mlg_record") return `mlg_record|${row.aply_dt}`;
  if (row.ref_id) return `${row.actv_type_enm}|${row.ref_id}`;
  return `solo|${row.pt_txn_id}`;
}

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
        .select("pt_txn_id, aply_dt, actv_type_enm, pt_amt, ref_id, rsn_txt")
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

      const rows = (data ?? []) as LedgerRow[];

      // 적립↔회수를 짝(pairKey)으로 묶어 순액을 낸다. 회수분과 그 획득 짝은 순액이 0이 돼
      // 목록에서 통째로 빠지고, **진짜 남은 획득(순액>0)만** 한 줄로 보인다. 순액이 0/음수인
      // 짝은 감춘다. 이렇게 해도 합계(순액들의 합)는 랭킹(원장 전체 net)과 일치한다 —
      // 회수 짝은 어차피 0을 더하므로. (rows는 aply_dt·crt_at 역순이라 그룹 첫 양수행이 최신 적립)
      const groups = new Map<string, { net: number; earn: LedgerRow | null }>();
      for (const row of rows) {
        const key = pairKey(row);
        const g = groups.get(key) ?? { net: 0, earn: null };
        g.net += row.pt_amt;
        if (row.pt_amt > 0 && g.earn === null) g.earn = row; // 최신 적립행을 대표로
        groups.set(key, g);
      }

      const entries: ActvHistoryEntry[] = [];
      for (const g of groups.values()) {
        if (g.net <= 0 || g.earn === null) continue; // 완전 회수(0)·순감소 짝은 숨긴다
        entries.push({
          id: g.earn.pt_txn_id,
          aply_dt: g.earn.aply_dt,
          actv_type: g.earn.actv_type_enm,
          amount: g.net,
          rsn_txt: g.earn.rsn_txt,
        });
      }
      // 대표(적립)일 역순 — Map은 삽입순이라 정렬을 다시 잡는다
      entries.sort((a, b) => (a.aply_dt < b.aply_dt ? 1 : a.aply_dt > b.aply_dt ? -1 : 0));

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
