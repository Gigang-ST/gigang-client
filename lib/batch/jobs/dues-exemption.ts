import { dayjs } from "@/lib/dayjs";
import { calcExemption, capExemptionAmount } from "@/lib/dues/calc-exemption";
import {
  buildActiveIntervals,
  isFullyActiveMonth,
  isMonthCharged,
} from "@/lib/dues/ledger-replay";
import { createAdminClient } from "@/lib/supabase/admin";

import { capChanges } from "@/lib/batch/types";
import type { BatchChange, BatchContext, BatchResult } from "@/lib/batch/types";

const KST = "Asia/Seoul";

/**
 * 참여 기반 회비 감면 배치 — 월 마감 후 전월 참여 감면을 면제 내역에 확정(설계 §8).
 *
 * ⚠️ **이 파일은 `"use server"`가 아니다.** 서버 액션으로 노출되면 클라이언트가 임의의
 *    `teamId`를 넘겨 직접 호출할 수 있다(IDOR). 권한 검사는 호출부가 한다 —
 *    관리자는 `runBatch`의 `withAdmin`, 크론은 `CRON_SECRET`.
 *
 * - 대상 월: 기본 전월(baseMonth 미지정 시). 'YYYY-MM' 지정 가능(과거 소급).
 * - 대상 멤버: 대상 월에 회비가 부과되는 활성 팀 멤버(첫 부과월 ≤ 대상월 — firstChargeMonth).
 *   가입 당월 미부과 회원(JOIN_MONTH_EXEMPT_FROM 이후 가입)의 가입월은 제외.
 * - 멤버별 get_member_monthly_activity(team, mem, ym) → calcExemption(대상월 회비단가).
 * - exmAmt>0 이면 grant_src_enm='rule_attd_quest', rflt_yn=false 로 INSERT.
 *   멱등: 같은 월 퀘스트 면제가 이미 있으면 스킵(존재 확인 후 INSERT). 부분 유니크 인덱스
 *   uk_fee_exm_hist_quest 가 동시성 경합 시 최종 방어선.
 * - **월별 면제 캡**: 그 달 면제 총액이 부과액을 못 넘게 남은 여유분만 준다(설계 §6.5).
 * - 잔액 반영은 **안 한다** — 감면이 제대로 돌았는지 사람이 확인한 뒤 재계산하는 게
 *   의도된 관문이다(배치 자동화 설계 §3.6). 자동화해도 이 경계는 그대로 둔다.
 *
 * ⚠️ 성능: 멤버당 집계 RPC 1회 호출(N+1). 월 1회·수백 명 규모라 허용.
 */
export async function batchDuesExemption(
  ctx: BatchContext,
  baseMonth?: string,
): Promise<BatchResult> {
  const db = createAdminClient();
  const { teamId, actorMemId } = ctx;

  const ym = baseMonth
    ? dayjs(baseMonth).format("YYYY-MM")
    : dayjs().tz(KST).subtract(1, "month").format("YYYY-MM");
  // 입력 오류·정책 위반은 throw → 실행 이력이 status='failed'로 기록된다(success 오표기 방지).
  if (ym === "Invalid Date") throw new Error("대상 월 형식이 올바르지 않습니다(YYYY-MM).");

  // 당월·미래월 차단: 배치는 "월 마감 후 전월 확정"만 한다(설계 §8.3).
  const curYm = dayjs().tz(KST).format("YYYY-MM");
  if (ym >= curYm) {
    throw new Error(`진행 중이거나 미래인 달(${ym})은 확정할 수 없습니다. 마감된 전월 이하만 가능합니다.`);
  }

  const monthStart = `${ym}-01`;
  const monthEnd = dayjs(monthStart).tz(KST).endOf("month").format("YYYY-MM-DD");

  // 대상 월 회비 단가 (소급 정확성: 현재 단가가 아니라 그 달에 적용되던 단가)
  const { data: policies, error: policyErr } = await db
    .from("fee_policy_cfg")
    .select("aply_stt_dt, aply_end_dt, monthly_fee_amt")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .order("aply_stt_dt", { ascending: true });
  if (policyErr) throw new Error(`회비 정책 조회 실패: ${policyErr.message}`);

  const policy = (policies ?? [])
    .filter((p) => p.aply_stt_dt <= monthEnd && p.aply_end_dt >= monthStart)
    .at(-1);
  if (!policy) {
    return {
      msg: `대상 월(${ym})에 적용되는 회비 정책이 없습니다.`,
      metrics: [{ label: "대상", value: 0 }, { label: "부여", value: 0 }],
      changedCount: 0,
      changes: [],
      warnings: [`${ym}에 적용되는 회비 정책이 없어 아무것도 하지 않았습니다.`],
    };
  }
  const monthlyFeeAmt = policy.monthly_fee_amt;

  // 대상 멤버: 대상 월에 회비가 부과되는 활성 멤버(첫 부과월 ≤ 대상월).
  const { data: members, error: memberErr } = await db
    .from("team_mem_rel")
    .select("mem_id, join_dt")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active");
  if (memberErr) throw new Error(`대상 멤버 조회 실패: ${memberErr.message}`);

  const targets = (members ?? []).filter((m) => isMonthCharged(m.join_dt, ym));
  if (!targets.length) {
    return {
      msg: `대상 멤버가 없습니다 (대상 월: ${ym}).`,
      metrics: [{ label: "대상", value: 0 }, { label: "부여", value: 0 }],
      changedCount: 0,
      changes: [],
      warnings: null,
    };
  }

  // 변경 목록에 이름을 실으려면 mem_nm이 필요하다. 멤버 수만큼 조회하지 않고 한 번에 맵으로.
  const { data: memRows } = await db
    .from("mem_mst")
    .select("mem_id, mem_nm")
    .in("mem_id", targets.map((m) => m.mem_id));
  const nameById = new Map((memRows ?? []).map((r) => [r.mem_id, r.mem_nm]));

  let granted = 0;
  let skippedZero = 0;
  let alreadyGranted = 0;
  let skippedInactive = 0;
  let cappedCount = 0;
  const errors: string[] = [];
  const changes: BatchChange[] = [];

  for (const m of targets) {
    // 대상 월에 온전히 active였던 회원만 감면 — 부과하지 않는 달에 감면만 적재되면 공돈이 된다.
    const { data: relHist, error: relHistErr } = await db
      .from("team_mem_rel")
      .select("mem_st_cd, eff_at, del_yn")
      .eq("team_id", teamId)
      .eq("mem_id", m.mem_id)
      .order("eff_at", { ascending: true });
    if (relHistErr) {
      errors.push(`${m.mem_id} 상태 이력 조회 실패: ${relHistErr.message}`);
      continue;
    }
    const activeIntervals = relHist?.length
      ? buildActiveIntervals(
          relHist.map((r) => ({ mem_st_cd: r.del_yn ? "deleted" : r.mem_st_cd, eff_at: r.eff_at })),
        )
      : undefined;
    // activeIntervals 미제공(이력 없는 도입 전 회원)이면 판정 생략 = 기존 동작.
    if (activeIntervals && !isFullyActiveMonth(activeIntervals, ym)) {
      skippedInactive++;
      continue;
    }

    const { data: statRows, error: statErr } = await db.rpc("get_member_monthly_activity", {
      p_team_id: teamId,
      p_mem_id: m.mem_id,
      p_ym: ym,
    });
    if (statErr) {
      errors.push(`${m.mem_id} 집계 실패: ${statErr.message}`);
      continue;
    }

    const stat = statRows?.[0] ?? { attend_cnt: 0, regular_attend_cnt: 0, hosted_cnt: 0 };
    const result = calcExemption(
      { attendCnt: stat.attend_cnt, regularAttendCnt: stat.regular_attend_cnt, hostedCnt: stat.hosted_cnt },
      monthlyFeeAmt,
    );

    if (result.exmAmt <= 0) {
      skippedZero++;
      continue;
    }

    // 사유: "[5월 회비 감면] 참여 4회 (정모 참여)" — 어느 달 무엇으로 감면됐는지 명확히
    const monthLabel = dayjs(monthStart).format("M월");
    const gateLabel = stat.regular_attend_cnt > 0 ? "정모 참여" : "모임 개설";
    const rsnTxt = `[${monthLabel} 회비 감면] 참여 ${stat.attend_cnt}회 (${gateLabel})`;

    // 멱등: 이미 같은 월 퀘스트 면제가 있으면 그대로 둔다.
    const { data: existing } = await db
      .from("fee_due_exm_hist")
      .select("exm_hist_id")
      .eq("team_id", teamId)
      .eq("mem_id", m.mem_id)
      .eq("aply_ym", ym)
      .eq("grant_src_enm", "rule_attd_quest")
      .eq("del_yn", false)
      .maybeSingle();
    if (existing) {
      alreadyGranted++;
      continue;
    }

    // 면제는 감면이지 환급이 아니다 — 그 달 면제 총액은 부과액을 못 넘는다(설계 §6.5).
    // 출처를 가리지 않고 그 달 전체를 본다 — 관리자 수동 면제도 같은 예산을 쓴다.
    const { data: sameMonthExms, error: exmSumErr } = await db
      .from("fee_due_exm_hist")
      .select("exm_amt")
      .eq("team_id", teamId)
      .eq("mem_id", m.mem_id)
      .eq("aply_ym", ym)
      .eq("del_yn", false);
    if (exmSumErr) {
      errors.push(`${m.mem_id} 기존 면제 조회 실패: ${exmSumErr.message}`);
      continue;
    }

    const alreadyExempted = (sameMonthExms ?? []).reduce((s, e) => s + (e.exm_amt ?? 0), 0);
    const cappedAmt = capExemptionAmount(result.exmAmt, monthlyFeeAmt, alreadyExempted);
    // 여유가 0이면 적재하지 않는다. 0원짜리 면제 행은 내역만 어지럽힌다.
    if (cappedAmt <= 0) {
      cappedCount++;
      continue;
    }
    if (cappedAmt < result.exmAmt) cappedCount++;

    const { error: insErr } = await db.from("fee_due_exm_hist").insert({
      team_id: teamId,
      mem_id: m.mem_id,
      exm_cfg_id: null,
      aply_ym: ym,
      exm_amt: cappedAmt,
      grant_src_enm: "rule_attd_quest",
      rsn_txt: rsnTxt,
      // 자동 실행이면 승인자가 없다. 화면은 trig_type으로 "자동"을 보여 준다.
      aprv_by_mem_id: actorMemId,
      aprv_at: dayjs().toISOString(),
      rflt_yn: false,
      vers: 0,
      del_yn: false,
    });
    if (insErr) {
      errors.push(`${m.mem_id} 면제 INSERT 실패: ${insErr.message}`);
      continue;
    }
    granted++;
    changes.push({
      memNm: nameById.get(m.mem_id) ?? m.mem_id,
      what: `${monthLabel} 회비 감면 ${cappedAmt.toLocaleString()}원 (참여 ${stat.attend_cnt}회)`,
    });
  }

  const dupSuffix = alreadyGranted > 0 ? `, ${alreadyGranted}명 기존 부여(스킵)` : "";
  const inactSuffix = skippedInactive > 0 ? `, ${skippedInactive}명 비활성월(제외)` : "";
  const capSuffix = cappedCount > 0 ? `, ${cappedCount}명 기존 면제로 한도 초과(감액·제외)` : "";
  const summary = `대상 월 ${ym}: ${targets.length}명 중 ${granted}명 감면 부여, ${skippedZero}명 미해당${inactSuffix}${dupSuffix}${capSuffix}`;

  // 멤버별 처리 오류가 하나라도 있으면 throw → 이력에 status='failed'로 남긴다.
  // 성공분(granted)은 이미 INSERT됐고, 요약을 메시지에 담아 어디까지 됐는지 보이게 한다.
  if (errors.length) {
    throw new Error(`${summary} / 오류 ${errors.length}건: ${errors.slice(0, 3).join("; ")}`);
  }

  const capped = capChanges(changes);
  return {
    msg: summary,
    // 읽는 순서에 뜻이 있다: 대상 → 부여 → 나머지 사유. 배열이라 순서가 보존된다.
    metrics: [
      { label: "대상", value: targets.length },
      { label: "부여", value: granted },
      { label: "미해당", value: skippedZero },
      ...(alreadyGranted > 0 ? [{ label: "기존부여", value: alreadyGranted }] : []),
      ...(skippedInactive > 0 ? [{ label: "비활성월", value: skippedInactive }] : []),
      ...(cappedCount > 0 ? [{ label: "한도초과", value: cappedCount }] : []),
    ],
    changedCount: granted,
    changes: capped.changes,
    warnings: capped.warnings.length ? capped.warnings : null,
  };
}
