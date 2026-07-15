import "server-only";

import { dayjs } from "@/lib/dayjs";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * 회원 잔액을 0원 앵커로 봉인한다 — 재활성 초기화 / 재가입 시 과거 회비(예치금·미납)를
 * 청산하고 "이 시점 이후"만 부과되게 하는 개시잔액 스냅샷을 만든다.
 *
 * 왜 필요한가: 잔액은 재계산마다 앵커부터 전체 리플레이로 재생성된다. 삭제 회원이 재가입하면
 * team_id+mem_id 로 연결된 과거 fee_* 이력이 그대로 남아 있어, 앵커를 안 만들면 재가입 회원
 * 잔액에 과거가 다시 딸려온다. 0원 앵커(anchor_yn=true)를 만들면 재계산이 그 앵커를 잡아
 * 봉인 시점 다음 달부터만 부과한다(+ sumReflectedExemptions 가 앵커 이전 반영 면제를 제외).
 *
 * vers=0 슬롯을 UPDATE 로 덮어쓴다 — soft-delete + INSERT 는 UNIQUE(team_id,mem_id,vers=0)
 * 슬롯을 못 비워 충돌한다. 기존 스냅샷이 없으면 INSERT.
 */
export async function sealBalanceAnchor(
  db: ReturnType<typeof createAdminClient>,
  teamId: string,
  memId: string,
): Promise<{ error: string | null }> {
  const nowIso = dayjs().toISOString();
  const monthStart = dayjs().tz("Asia/Seoul").startOf("month");
  // crt_at 을 봉인 시각으로 명시 갱신한다 — 재계산이 anchor.crt_at 을 "이 앵커 이후 반영분만
  // 합산"의 기준(sumReflectedExemptions)으로 쓰기 때문. UPDATE 분기에서 crt_at 을 빼면 옛
  // (시딩) crt_at 이 남아, 청산했어야 할 과거 반영 면제가 baseBal 에 부활한다.
  const anchorRow = {
    // last_calc_dt 는 date 컬럼 — toISOString()(UTC)을 넣으면 KST 월초가 전월 말일로
    // 절삭돼(2026-07-01 KST → 2026-06-30) 재계산 fromMonth 가 한 달 앞당겨진다.
    // KST 월초 날짜 문자열을 그대로 넣는다.
    bal_amt: 0,
    last_calc_dt: monthStart.format("YYYY-MM-DD"),
    last_calc_at: nowIso,
    last_ref_pay_id: null,
    last_ref_exm_hist_id: null,
    anchor_yn: true,
    crt_at: nowIso,
  };

  // 이 회원의 과거 재활성-초기화 앵커(vers>0, anchor_yn=true)를 먼저 del 처리한다.
  // 재계산이 스냅샷을 갱신할 때 옛 vers=0 앵커를 del_yn=false 인 채 vers>0 으로 밀어두므로,
  // 초기화를 두 번 하면 anchor_yn=true 가 여러 건 쌓이고 재계산의 앵커 조회(crt_at asc)가
  // 가장 오래된 것을 잡아 둘째 초기화가 무효화된다. 여기서 옛 앵커를 정리해 항상 1건만 남긴다.
  // (시딩 앵커는 anchor_yn=false 라 영향 없음. 현재 슬롯 vers=0 은 아래 UPDATE 로 덮으므로 제외.)
  const { error: delErr } = await db
    .from("fee_mem_bal_snap")
    .update({ del_yn: true, upd_at: nowIso })
    .eq("team_id", teamId)
    .eq("mem_id", memId)
    .eq("anchor_yn", true)
    .eq("del_yn", false)
    .neq("vers", 0);
  if (delErr) return { error: `옛 앵커 정리 실패: ${delErr.message}` };

  const { data: existing, error: selErr } = await db
    .from("fee_mem_bal_snap")
    .select("bal_snap_id")
    .eq("team_id", teamId)
    .eq("mem_id", memId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (selErr) return { error: `앵커 조회 실패: ${selErr.message}` };

  if (existing) {
    const { error } = await db
      .from("fee_mem_bal_snap")
      .update(anchorRow)
      .eq("bal_snap_id", existing.bal_snap_id);
    if (error) return { error: `앵커 갱신 실패: ${error.message}` };
  } else {
    const { error } = await db
      .from("fee_mem_bal_snap")
      .insert({ team_id: teamId, mem_id: memId, vers: 0, del_yn: false, ...anchorRow });
    if (error) return { error: `앵커 생성 실패: ${error.message}` };
  }
  return { error: null };
}
