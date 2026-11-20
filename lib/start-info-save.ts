import "server-only";

import { dayjs } from "@/lib/dayjs";
import { planStartInfoSave } from "@/lib/start-info-plan";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import {
  RUN_CAREER_CODES,
  START_REC_DIST_CODES,
  startInfoSchema,
  WKLY_DIST_CODES,
  type StartInfoSrcCode,
  type StartInfoValues,
} from "@/lib/validations/start-info";

type Result = { ok: true } | { ok: false; message: string };

const FAIL: Result = { ok: false, message: "시작 정보 저장에 실패했습니다." };

function pick<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * 시작 정보 저장 — 가입 폼(`finishTeamJoin`)과 프로필(`updateStartInfo`)이 공유한다.
 * 무엇을 쓸지는 `planStartInfoSave`(순수 함수)가 정하고 여기선 실행만 한다.
 *
 * - 경력·주간 거리·"완주 못 해봄"은 `mem_onbd_prf`(사람 것)에, 거리별 기록은 `mem_start_rec_rel`에 둔다.
 * - **입력 시각**: 처음 받은 출처·시각(`start_info_src_cd`·`start_info_at`)은 한 번 정해지면 덮지 않고,
 *   마지막 수정 시각(`start_info_upd_at`)만 갱신한다. 기록 행도 새 거리만 출처를 적고, 있는 거리는 값만 고친다.
 * - 대상 `memId` 는 호출부가 로그인 세션에서 정한 값만 넘긴다.
 * - 한 트랜잭션이 아니다(PostgREST 여러 호출). 중간에 끊겨도 같은 입력으로 다시 저장하면 같은 상태로 수렴하고
 *   (멱등), 가입 경로에선 비치명이다. RPC 로 묶는 건 dev DB 에서 검증할 수 있을 때 따로 한다.
 */
export async function saveStartInfo(
  memId: string,
  input: StartInfoValues,
  src: StartInfoSrcCode,
): Promise<Result> {
  const parsed = startInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다." };

  const admin = createUntypedAdminClient();

  const [{ data: prf, error: prfErr }, { data: recs, error: recErr }] = await Promise.all([
    admin
      .from("mem_onbd_prf")
      .select("run_career_cd, wkly_dist_cd, start_rec_none_yn, start_info_at")
      .eq("mem_id", memId)
      .maybeSingle(),
    admin.from("mem_start_rec_rel").select("dist_cd, rec_sec").eq("mem_id", memId),
  ]);
  if (prfErr || recErr) {
    console.error("[start-info] 기존 값 조회 실패", memId, (prfErr ?? recErr)?.message);
    return FAIL;
  }

  const plan = planStartInfoSave(
    {
      hadBefore: Boolean(prf?.start_info_at),
      values: {
        runCareerCd: pick(RUN_CAREER_CODES, prf?.run_career_cd),
        wklyDistCd: pick(WKLY_DIST_CODES, prf?.wkly_dist_cd),
        recNone: prf?.start_rec_none_yn === true,
        records: (recs ?? []).flatMap((r: { dist_cd: string; rec_sec: number }) => {
          const distCd = pick(START_REC_DIST_CODES, r.dist_cd);
          return distCd ? [{ distCd, recSec: Number(r.rec_sec) }] : [];
        }),
      },
    },
    parsed.data,
    src,
  );
  if (plan.skip) return { ok: true };

  const now = dayjs().toISOString();
  const { error: upErr } = await admin.from("mem_onbd_prf").upsert(
    {
      mem_id: memId,
      run_career_cd: plan.prf.runCareerCd,
      wkly_dist_cd: plan.prf.wklyDistCd,
      start_rec_none_yn: plan.prf.recNone,
      start_info_upd_at: now,
      ...(plan.prf.first ? { start_info_src_cd: src, start_info_at: now } : {}),
    },
    { onConflict: "mem_id" },
  );
  if (upErr) {
    console.error("[start-info] mem_onbd_prf 저장 실패", memId, upErr.message);
    return FAIL;
  }

  if (plan.removed.length > 0) {
    const { error } = await admin.from("mem_start_rec_rel").delete().eq("mem_id", memId).in("dist_cd", plan.removed);
    if (error) {
      console.error("[start-info] 기록 삭제 실패", memId, error.message);
      return FAIL;
    }
  }
  for (const r of plan.updates) {
    const { error } = await admin
      .from("mem_start_rec_rel")
      .update({ rec_sec: r.recSec })
      .eq("mem_id", memId)
      .eq("dist_cd", r.distCd);
    if (error) {
      console.error("[start-info] 기록 수정 실패", memId, r.distCd, error.message);
      return FAIL;
    }
  }
  for (const r of plan.inserts) {
    const { error } = await admin
      .from("mem_start_rec_rel")
      .insert({ mem_id: memId, dist_cd: r.distCd, rec_sec: r.recSec, src_cd: src });
    if (error) {
      console.error("[start-info] 기록 추가 실패", memId, r.distCd, error.message);
      return FAIL;
    }
  }
  return { ok: true };
}
