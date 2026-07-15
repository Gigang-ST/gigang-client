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
    bal_amt: 0,
    last_calc_dt: monthStart.toISOString(),
    last_calc_at: nowIso,
    last_ref_pay_id: null,
    last_ref_exm_hist_id: null,
    anchor_yn: true,
    crt_at: nowIso,
  };

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
