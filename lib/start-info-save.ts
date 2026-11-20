import "server-only";

import { dayjs } from "@/lib/dayjs";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import {
  hasStartInfo,
  startInfoSchema,
  type StartInfoSrcCode,
  type StartInfoValues,
} from "@/lib/validations/start-info";

type Result = { ok: true } | { ok: false; message: string };

/**
 * 시작 정보 저장 — 가입 폼(`finishTeamJoin`)과 프로필(`updateStartInfo`)이 공유한다.
 *
 * - 경력·주간 거리·"완주 못 해봄"은 `mem_onbd_prf`(사람 것)에, 거리별 기록은 `mem_start_rec_rel`에 둔다.
 * - **입력 시각**: 처음 받은 출처·시각(`start_info_src_cd`·`start_info_at`)은 한 번 정해지면 덮지 않고,
 *   마지막 수정 시각(`start_info_upd_at`)만 갱신한다 — 가입 때 적은 값과 나중에 채운 값을 가르려는 것이다.
 *   기록 행도 같다: 새 거리만 출처를 새로 적고, 이미 있는 거리는 값만 고친다.
 * - 입력이 하나도 없으면 아무것도 쓰지 않는다(가입 때 건너뛴 사람의 행·시각을 만들지 않는다).
 *   프로필에서 전부 비운 저장(이미 값이 있던 사람)은 그대로 반영한다.
 * - 대상 `memId` 는 호출부가 로그인 세션에서 정한 값만 넘긴다.
 */
export async function saveStartInfo(
  memId: string,
  input: StartInfoValues,
  src: StartInfoSrcCode,
): Promise<Result> {
  const parsed = startInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다." };
  const v = parsed.data;

  const admin = createUntypedAdminClient();
  const now = dayjs().toISOString();

  const { data: prev, error: prevErr } = await admin
    .from("mem_onbd_prf")
    .select("start_info_at")
    .eq("mem_id", memId)
    .maybeSingle();
  if (prevErr) return { ok: false, message: "시작 정보를 확인하지 못했습니다." };

  const hadBefore = Boolean(prev?.start_info_at);
  // 가입 폼에서 건너뛴 경우(다른 팀 가입·재가입 포함)엔 이미 있던 값을 빈 값으로 덮지 않는다.
  // 프로필에서의 저장만 "전부 비우기"를 반영한다.
  if (!hasStartInfo(v) && (src === "SIGNUP" || !hadBefore)) return { ok: true };

  const { error: prfErr } = await admin.from("mem_onbd_prf").upsert(
    {
      mem_id: memId,
      run_career_cd: v.runCareerCd,
      wkly_dist_cd: v.wklyDistCd,
      start_rec_none_yn: v.recNone,
      start_info_upd_at: now,
      ...(hadBefore ? {} : { start_info_src_cd: src, start_info_at: now }),
    },
    { onConflict: "mem_id" },
  );
  if (prfErr) {
    console.error("[start-info] mem_onbd_prf 저장 실패", memId, prfErr.message);
    return { ok: false, message: "시작 정보 저장에 실패했습니다." };
  }

  const { data: cur, error: curErr } = await admin
    .from("mem_start_rec_rel")
    .select("dist_cd")
    .eq("mem_id", memId);
  if (curErr) {
    console.error("[start-info] 기록 조회 실패", memId, curErr.message);
    return { ok: false, message: "시작 정보 저장에 실패했습니다." };
  }
  const have = new Set((cur ?? []).map((r: { dist_cd: string }) => r.dist_cd));
  const keep = new Set<string>(v.records.map((r) => r.distCd));

  const removed = [...have].filter((d) => !keep.has(d));
  if (removed.length > 0) {
    const { error } = await admin.from("mem_start_rec_rel").delete().eq("mem_id", memId).in("dist_cd", removed);
    if (error) {
      console.error("[start-info] 기록 삭제 실패", memId, error.message);
      return { ok: false, message: "시작 정보 저장에 실패했습니다." };
    }
  }

  for (const r of v.records) {
    const { error } = have.has(r.distCd)
      ? await admin
          .from("mem_start_rec_rel")
          .update({ rec_sec: r.recSec })
          .eq("mem_id", memId)
          .eq("dist_cd", r.distCd)
      : await admin
          .from("mem_start_rec_rel")
          .insert({ mem_id: memId, dist_cd: r.distCd, rec_sec: r.recSec, src_cd: src });
    if (error) {
      console.error("[start-info] 기록 저장 실패", memId, r.distCd, error.message);
      return { ok: false, message: "시작 정보 저장에 실패했습니다." };
    }
  }
  return { ok: true };
}
