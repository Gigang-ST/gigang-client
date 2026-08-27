"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";

import { dayjs } from "@/lib/dayjs";

import { currentMonthKST, nextMonthStr, todayDayKST } from "@/lib/dayjs";
import {
  calcBaseMileage,
  calcFinalMileage,
  roundMileage,
  countMonths,
  DEPOSIT_PER_MONTH,
  ENTRY_FEE,
  ENTRY_FEE_WITH_SINGLET,
  type MileageSport,
} from "@/lib/mileage";
import {
  buildAppliedMults as buildAppliedMultsCore,
  recalcGoalsFromMonth as recalcGoalsFromMonthCore,
  validateActivityDate,
  type ActivityLogInput,
} from "@/lib/mileage-run";
import { withActive } from "@/lib/actions/auth";
import {
  postPhotoPathFromUrl,
  removePostPhoto,
  uploadPostPhoto,
} from "@/lib/storage/post-photo";
import { isOwnPostPhotoUrl } from "@/lib/storage/post-photo-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";
import { activityLogBatchSchema, activityLogSchema } from "@/lib/validations/mileage";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

/**
 * 활동 로그 입력. 정본은 `lib/mileage-run.ts`(액션·운영 MCP 공용 코어)에 있고
 * 여기서는 기존 import 경로를 유지하기 위해 재export 한다.
 */
export type { ActivityLogInput } from "@/lib/mileage-run";

type ActionResult = { ok: boolean; message: string | null; grantedTitles?: string[] };

// ─────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────
//
// 날짜 규칙·배율 적용·목표 연쇄 재계산은 `lib/mileage-run.ts` 로 옮겼다.
// 운영 MCP(#497)가 같은 판정을 써야 하는데, 이 파일은 `withActive`(세션 쿠키)에 묶여 있어
// PAT 요청에서 호출할 수 없다. 보증금 환급이 걸린 계산이 두 벌이 되지 않도록 코어를 공유하고,
// 이 파일은 신원 해석과 프레임워크 부수효과(revalidatePath·updateTag·after)만 맡는다.

/** 코어 함수에 넘길 service-role 클라이언트를 만들어 부분 적용한다(호출부 시그니처 유지용). */
function buildAppliedMults(evtId: string, multIds: string[], actDt: string) {
  return buildAppliedMultsCore(createAdminClient(), evtId, multIds, actDt);
}

// ─────────────────────────────────────────
// 0. 활동 사진 업로드 (기강이야기 유입용)
// ─────────────────────────────────────────

export type UploadActivityPhotoResult =
  | { ok: false; message: string }
  | { ok: true; url: string };

/**
 * 마일리지런 기록에 붙일 사진을 올리고 공개 URL을 돌려준다.
 *
 * **업로드와 기록 저장을 갈라 둔 이유**: 마일리지런 폼은 배율·고도·미리보기까지 얹힌
 * JSON 액션(`logActivity`)이라 `File`을 실어 보낼 수 없다(브라우저 전용 타입). 그래서
 * 사진만 먼저 FormData로 올려 URL을 받고, 그 URL을 기존 JSON 흐름에 문자열 한 칸으로 태운다.
 * 기강이야기 직접 작성(`createRecordFlex`)은 필드가 셋뿐이라 통째로 FormData면 되지만
 * 여기는 그 방식이 안 맞는다 — 사진 처리 자체는 `uploadPostPhoto`로 공유한다.
 *
 * 사진을 올렸다가 기록 저장을 취소하면 파일이 고아로 남는다. 그건 감수한다 —
 * 되돌리기를 하려면 폼이 업로드 시점부터 경로를 들고 있어야 하는데, 그 복잡도가
 * webp 몇 십 KB보다 비싸다(기강이야기 쪽은 한 액션 안이라 되돌릴 수 있어서 되돌린다).
 */
export async function uploadActivityPhoto(
  formData: FormData,
): Promise<UploadActivityPhotoResult> {
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, message: "사진을 선택해 주세요." };
  }

  try {
    return await withActive(async ({ member, supabase }) => {
      const uploaded = await uploadPostPhoto(supabase, member.id, file);
      if (!uploaded.ok) return { ok: false as const, message: uploaded.message };
      return { ok: true as const, url: uploaded.url };
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요";
    return { ok: false, message };
  }
}

// ─────────────────────────────────────────
// 1. 프로젝트 참여 신청
// ─────────────────────────────────────────

export async function joinProject(
  evtId: string,
  initGoal: number,
  hasSinglet: boolean,
): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const db = createAdminClient();

    const { data: evt, error: evtError } = await db
      .from("evt_team_mst")
      .select("end_dt, stt_dt")
      .eq("evt_id", evtId)
      .single();

    if (evtError || !evt) return { ok: false, message: "이벤트를 찾을 수 없습니다" };

    const curMonth = currentMonthKST();
    const evtStartMonth = evt.stt_dt.slice(0, 7) + "-01";
    const evtEndMonth = evt.end_dt.slice(0, 7) + "-01";
    const depositStart = curMonth < evtStartMonth ? evtStartMonth : curMonth;
    const remainMonths = countMonths(depositStart, evtEndMonth);

    const depositAmt = remainMonths * DEPOSIT_PER_MONTH;
    const entryFeeAmt = hasSinglet ? ENTRY_FEE_WITH_SINGLET : ENTRY_FEE;
    const singletFeeAmt = 0;

    const { data: prt, error: prtError } = await db
      .from("evt_team_prt_rel")
      .insert({
        evt_id: evtId, mem_id: member.id, aprv_yn: false, stt_mth: curMonth,
        init_goal: initGoal, deposit_amt: depositAmt, entry_fee_amt: entryFeeAmt,
        singlet_fee_amt: singletFeeAmt, has_singlet_yn: hasSinglet,
      })
      .select("prt_id")
      .single();

    if (prtError) {
      if (prtError.code === "23505") return { ok: false, message: "이미 참여 신청하셨습니다" };
      return { ok: false, message: "참여 신청에 실패했습니다" };
    }
    if (!prt) return { ok: false, message: "참여 신청 처리에 실패했습니다" };

    const goalRows: {
      prt_id: string;
      base_dt: string;
      goal_mlg: number;
      achv_yn: boolean;
      act_cnt: number;
      achv_mlg: number;
      lst_act_dt: string | null;
    }[] = [];
    let m = curMonth;
    while (m <= evtEndMonth) {
      goalRows.push({ prt_id: prt.prt_id, base_dt: m, goal_mlg: initGoal, achv_yn: false, act_cnt: 0, achv_mlg: 0, lst_act_dt: null });
      m = nextMonthStr(m);
    }

    const { error: goalError } = await db.from("evt_mlg_mth_snap").insert(goalRows);
    if (goalError) {
      await db.from("evt_team_prt_rel").delete().eq("prt_id", prt.prt_id);
      return { ok: false, message: "월별 목표 생성에 실패했습니다" };
    }

    revalidatePath("/projects");

    const { data: teamMemRow } = await db
      .from("team_mem_rel")
      .select("team_mem_id, team_id")
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (teamMemRow) {
      const ctx = {
        trigger: "mileage_run" as const,
        teamId: teamMemRow.team_id,
        teamMemId: teamMemRow.team_mem_id,
        projectId: evtId,
        actDt: currentMonthKST(),
        prevAchvYn: false,
      };
      after(() => evaluateAndGrantTitles(ctx).catch((e) => console.error("[title-engine] mileage_run(join) 평가 실패", e)));
    }

    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 2. 활동 기록 추가
// ─────────────────────────────────────────

export async function logActivity(
  evtId: string,
  input: ActivityLogInput,
): Promise<ActionResult> {
  const parsed = activityLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다" };
  const validInput = parsed.data;

  return withActive(async ({ member }) => {
    const isAdmin = !!member.admin;
    const dateErr = validateActivityDate(validInput.act_dt, isAdmin);
    if (dateErr) return { ok: false, message: dateErr };

    // 사진은 **본인 폴더**의 것만 붙일 수 있다. 스키마가 출처(우리 버킷)는 봤지만 소유권은
    // mem_id를 알아야 판정할 수 있어 여기서 본다 — 없으면 남이 올린 공개 URL을 그대로
    // 자기 기록에 붙여 남의 사진을 자기 것으로 전광판에 세울 수 있다
    // (Storage RLS는 *쓰기*만 막지, 남의 공개 URL을 *참조*하는 건 못 막는다).
    if (validInput.photo_url && !isOwnPostPhotoUrl(validInput.photo_url, member.id)) {
      return { ok: false, message: "사진 주소가 올바르지 않습니다" };
    }

    const db = createAdminClient();
    const { data: participant, error: participantErr } = await db
      .from("evt_team_prt_rel")
      .select("prt_id")
      .eq("evt_id", evtId)
      .eq("mem_id", member.id)
      .eq("aprv_yn", true)
      .single();

    if (participantErr || !participant) return { ok: false, message: "참여 신청 정보를 찾을 수 없습니다" };

    const { appliedMults, multValues, error: multErr } = await buildAppliedMults(evtId, validInput.applied_mult_ids, validInput.act_dt);
    if (multErr) return { ok: false, message: multErr };

    const baseMlg = roundMileage(calcBaseMileage(validInput.sprt_enm, validInput.distance_km, validInput.elevation_m));
    const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

    const actMonth = validInput.act_dt.slice(0, 7) + "-01";
    const { data: prevSnap } = await db
      .from("evt_mlg_mth_snap")
      .select("achv_yn")
      .eq("prt_id", participant.prt_id)
      .eq("base_dt", actMonth)
      .maybeSingle();
    const prevAchvYn = prevSnap?.achv_yn ?? false;

    const { error } = await db.from("evt_mlg_act_hist").insert({
      prt_id: participant.prt_id, act_dt: validInput.act_dt, sprt_enm: validInput.sprt_enm,
      dst_km: validInput.distance_km, elv_m: validInput.elevation_m,
      base_mlg: baseMlg, aply_mults: appliedMults, final_mlg: finalMlg,
      review: validInput.review?.trim() || null,
      // 사진이 있으면 DB 트리거가 이 기록을 기강이야기 운동기록에도 세운다(사진이 게이트)
      photo_url: validInput.photo_url || null,
    });

    if (error) return { ok: false, message: "활동 기록 추가에 실패했습니다" };

    // 사진이 붙었으면 지면이 바뀐다 — 전광판 캐시(5분)를 기다리지 않고 즉시 반영한다.
    // `revalidatePath("/projects")`만으론 /story의 `story-posts` 태그가 안 풀린다.
    if (validInput.photo_url) updateTag("story-posts");

    try {
      await recalcGoalsFromMonth(evtId, participant.prt_id);
    } catch (e) {
      console.error("[mileage] 목표 재계산 실패(logActivity)", e);
      return { ok: false, message: "목표 재계산에 실패했습니다. 잠시 후 다시 시도해주세요" };
    }

    const { data: teamMemRow, error: teamMemErr } = await db
      .from("team_mem_rel")
      .select("team_mem_id, team_id")
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    console.info("[title-engine] teamMemRow:", teamMemRow, "error:", teamMemErr);
    if (teamMemRow) {
      const ctx = {
        trigger: "mileage_run" as const,
        teamId: teamMemRow.team_id,
        teamMemId: teamMemRow.team_mem_id,
        projectId: evtId,
        actDt: validInput.act_dt,
        prevAchvYn,
      };
      console.info("[title-engine] ctx:", ctx);
      // 응답 밖에서 — 기록은 이미 저장됐고 이 경로는 반환값(획득 칭호)을 쓰지 않는다.
      // 획득 사실은 엔진이 보내는 인앱 알림+푸시(`ttl_grnt`)로 전해진다.
      after(() =>
        evaluateAndGrantTitles(ctx).catch((e) => console.error("[title-engine] mileage_run(log) 평가 실패", e)),
      );
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 3. 활동 기록 다건 추가
// ─────────────────────────────────────────

export async function logActivitiesBatch(
  evtId: string,
  inputs: ActivityLogInput[],
): Promise<ActionResult> {
  const parsed = activityLogBatchSchema.safeParse(inputs);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다" };
  const validInputs = parsed.data;

  return withActive(async ({ member }) => {
    const isAdmin = !!member.admin;

    // 사진 소유권 — 한 건이라도 남의 폴더면 통째로 막는다(단건 경로와 같은 규칙).
    if (
      validInputs.some(
        (i) => i.photo_url && !isOwnPostPhotoUrl(i.photo_url, member.id),
      )
    ) {
      return { ok: false, message: "사진 주소가 올바르지 않습니다" };
    }

    const db = createAdminClient();
    const { data: participant, error: participantErr } = await db
      .from("evt_team_prt_rel")
      .select("prt_id")
      .eq("evt_id", evtId)
      .eq("mem_id", member.id)
      .eq("aprv_yn", true)
      .single();

    if (participantErr || !participant) return { ok: false, message: "참여 신청 정보를 찾을 수 없습니다" };

    const rows: {
      prt_id: string;
      act_dt: string;
      sprt_enm: MileageSport;
      dst_km: number;
      elv_m: number;
      base_mlg: number;
      aply_mults: { mult_id: string; mult_nm: string; mult_val: number }[];
      final_mlg: number;
      review: string | null;
      photo_url: string | null;
    }[] = [];

    for (let i = 0; i < validInputs.length; i++) {
      const input = validInputs[i];
      const dateErr = validateActivityDate(input.act_dt, isAdmin);
      if (dateErr) return { ok: false, message: `${i + 1}번째 기록: ${dateErr}` };

      const { appliedMults, multValues, error: multErr } = await buildAppliedMults(evtId, input.applied_mult_ids, input.act_dt);
      if (multErr) return { ok: false, message: `${i + 1}번째 기록: ${multErr}` };

      const baseMlg = roundMileage(calcBaseMileage(input.sprt_enm, input.distance_km, input.elevation_m));
      const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

      rows.push({
        prt_id: participant.prt_id, act_dt: input.act_dt, sprt_enm: input.sprt_enm,
        dst_km: input.distance_km, elv_m: input.elevation_m,
        base_mlg: baseMlg, aply_mults: appliedMults, final_mlg: finalMlg,
        review: input.review?.trim() || null,
        // 사진이 있으면 DB 트리거가 이 기록을 기강이야기 운동기록에도 세운다(사진이 게이트)
        photo_url: input.photo_url || null,
      });
    }

    const uniqueDates = [...new Set(validInputs.map((i) => i.act_dt))];
    const prevAchvYnMap = new Map<string, boolean>();
    for (const actDt of uniqueDates) {
      const actMonth = actDt.slice(0, 7) + "-01";
      const { data: snap } = await db
        .from("evt_mlg_mth_snap")
        .select("achv_yn")
        .eq("prt_id", participant.prt_id)
        .eq("base_dt", actMonth)
        .maybeSingle();
      prevAchvYnMap.set(actDt, snap?.achv_yn ?? false);
    }

    const { error } = await db.from("evt_mlg_act_hist").insert(rows);
    if (error) return { ok: false, message: "활동 기록 저장에 실패했습니다" };

    // 한 건이라도 사진이 붙었으면 기강이야기 지면이 바뀐다(트리거가 post를 세운다)
    if (rows.some((r) => r.photo_url)) updateTag("story-posts");

    try {
      await recalcGoalsFromMonth(evtId, participant.prt_id);
    } catch (e) {
      console.error("[mileage] 목표 재계산 실패(logActivitiesBatch)", e);
      return { ok: false, message: "목표 재계산에 실패했습니다. 잠시 후 다시 시도해주세요" };
    }

    const { data: teamMemRow } = await db
      .from("team_mem_rel")
      .select("team_mem_id, team_id")
      .eq("mem_id", member.id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    const allGranted: string[] = [];
    if (teamMemRow) {
      for (const actDt of uniqueDates) {
        const ctx = {
          trigger: "mileage_run" as const,
          teamId: teamMemRow.team_id,
          teamMemId: teamMemRow.team_mem_id,
          projectId: evtId,
          actDt,
          prevAchvYn: prevAchvYnMap.get(actDt) ?? false,
        };
        const granted = await evaluateAndGrantTitles(ctx).catch((e) => {
          console.error("[title-engine] mileage_run(batch) 평가 실패", e);
          return [] as string[];
        });
        allGranted.push(...granted);
      }
    }

    revalidatePath("/projects");
    return { ok: true, message: null, grantedTitles: allGranted };
  });
}

// ─────────────────────────────────────────
// 4. 활동 기록 수정
// ─────────────────────────────────────────

export async function updateActivity(
  actId: string,
  input: ActivityLogInput,
): Promise<ActionResult> {
  const parsed = activityLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "입력값이 올바르지 않습니다" };
  const validInput = parsed.data;

  return withActive(async ({ member, supabase }) => {
    const isAdmin = !!member.admin;
    const db = createAdminClient();

    const { data: existing, error: fetchErr } = await db
      .from("evt_mlg_act_hist")
      .select("act_id, prt_id, photo_url, evt_team_prt_rel!inner(mem_id, evt_id)")
      .eq("act_id", actId)
      .single();

    if (fetchErr || !existing) return { ok: false, message: "기록을 찾을 수 없습니다" };
    const existingParticipant = existing.evt_team_prt_rel as { mem_id: string; evt_id: string };
    if (!isAdmin && existingParticipant.mem_id !== member.id) {
      return { ok: false, message: "본인 기록만 수정할 수 있습니다" };
    }

    const dateErr = validateActivityDate(validInput.act_dt, isAdmin);
    if (dateErr) return { ok: false, message: dateErr };

    // 사진 소유권은 **기록 주인**(existingParticipant.mem_id) 기준이다 — 수정하는 사람이
    // 아니라. 관리자가 남의 기록을 고칠 때 자기 폴더 사진을 붙이면, 그 기록의 주인 이름으로
    // 엉뚱한 사진이 전광판에 선다. 업로드 액션도 자기 폴더에만 쓰므로 관리자가 남의 기록에
    // 새 사진을 붙이는 건 애초에 불가능하고, 여기선 기존 사진 유지만 통과하면 된다.
    if (
      validInput.photo_url &&
      !isOwnPostPhotoUrl(validInput.photo_url, existingParticipant.mem_id)
    ) {
      return { ok: false, message: "사진 주소가 올바르지 않습니다" };
    }

    const { appliedMults, multValues, error: multErr } = await buildAppliedMults(
      existingParticipant.evt_id, validInput.applied_mult_ids, validInput.act_dt,
    );
    if (multErr) return { ok: false, message: multErr };

    const baseMlg = roundMileage(calcBaseMileage(validInput.sprt_enm, validInput.distance_km, validInput.elevation_m));
    const finalMlg = roundMileage(calcFinalMileage(baseMlg, multValues));

    const prevPhotoUrl = existing.photo_url as string | null;
    const nextPhotoUrl = validInput.photo_url || null;

    const { error } = await db
      .from("evt_mlg_act_hist")
      .update({
        act_dt: validInput.act_dt, sprt_enm: validInput.sprt_enm, dst_km: validInput.distance_km,
        elv_m: validInput.elevation_m, base_mlg: baseMlg, aply_mults: appliedMults,
        final_mlg: finalMlg, review: validInput.review?.trim() || null,
        photo_url: nextPhotoUrl, updated_at: dayjs().toISOString(),
      })
      .eq("act_id", actId);

    if (error) return { ok: false, message: "활동 기록 수정에 실패했습니다" };

    // 사진을 갈아끼웠거나 지웠으면 이전 파일은 아무도 참조하지 않는다 — Storage에서 치운다.
    // DB 갱신이 성공한 뒤에 지운다: 먼저 지우면 갱신이 실패했을 때 원본이 사진을 잃는다.
    if (prevPhotoUrl && prevPhotoUrl !== nextPhotoUrl) {
      const prevPath = postPhotoPathFromUrl(prevPhotoUrl);
      if (prevPath) await removePostPhoto(supabase, prevPath);
    }
    // 사진이 붙거나 떨어지면 기강이야기 지면이 바뀐다(트리거가 post를 세우거나 내린다)
    if (prevPhotoUrl || nextPhotoUrl) updateTag("story-posts");

    try {
      await recalcGoalsFromMonth(existingParticipant.evt_id, existing.prt_id);
    } catch (e) {
      console.error("[mileage] 목표 재계산 실패(updateActivity)", e);
      return { ok: false, message: "목표 재계산에 실패했습니다. 잠시 후 다시 시도해주세요" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 5. 활동 기록 삭제
// ─────────────────────────────────────────

export async function deleteActivity(actId: string): Promise<ActionResult> {
  return withActive(async ({ member, supabase }) => {
    const isAdmin = !!member.admin;
    const db = createAdminClient();

    const { data: existing, error: fetchErr } = await db
      .from("evt_mlg_act_hist")
      .select("act_id, prt_id, act_dt, photo_url, evt_team_prt_rel!inner(mem_id, evt_id)")
      .eq("act_id", actId)
      .single();

    if (fetchErr || !existing) return { ok: false, message: "기록을 찾을 수 없습니다" };
    const existingParticipant = existing.evt_team_prt_rel as { mem_id: string; evt_id: string };
    if (!isAdmin && existingParticipant.mem_id !== member.id) {
      return { ok: false, message: "본인 기록만 삭제할 수 있습니다" };
    }

    const dateErr = validateActivityDate(existing.act_dt, isAdmin);
    if (dateErr) return { ok: false, message: dateErr };

    const photoUrl = existing.photo_url as string | null;

    const { error } = await db.from("evt_mlg_act_hist").delete().eq("act_id", actId);
    if (error) return { ok: false, message: "활동 기록 삭제에 실패했습니다" };

    // 원본이 사라지면 트리거가 대응 post를 내린다 — 사진 파일도 같이 치우고 지면을 갱신한다
    if (photoUrl) {
      const path = postPhotoPathFromUrl(photoUrl);
      if (path) await removePostPhoto(supabase, path);
      updateTag("story-posts");
    }

    try {
      await recalcGoalsFromMonth(existingParticipant.evt_id, existing.prt_id);
    } catch (e) {
      console.error("[mileage] 목표 재계산 실패(deleteActivity)", e);
      return { ok: false, message: "목표 재계산에 실패했습니다. 잠시 후 다시 시도해주세요" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 6. 월별 목표 수정
// ─────────────────────────────────────────

export async function updateMonthlyGoal(goalId: string, newGoal: number): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const isAdmin = !!member.admin;

    if (!isAdmin && todayDayKST() > 14) {
      return { ok: false, message: "목표는 매월 14일까지만 수정할 수 있습니다" };
    }

    const db = createAdminClient();

    const { data: existing, error: fetchErr } = await db
      .from("evt_mlg_mth_snap")
      .select("goal_id, prt_id, goal_mlg, evt_team_prt_rel!inner(mem_id, evt_id)")
      .eq("goal_id", goalId)
      .single();

    if (fetchErr || !existing) return { ok: false, message: "목표를 찾을 수 없습니다" };
    const participant = existing.evt_team_prt_rel as { mem_id: string; evt_id: string };
    const evtId = participant.evt_id;
    if (!isAdmin && participant.mem_id !== member.id) return { ok: false, message: "본인 목표만 수정할 수 있습니다" };
    if (!isAdmin && newGoal < Number(existing.goal_mlg)) return { ok: false, message: "목표는 현재 값 이상으로만 설정할 수 있습니다" };

    const { error } = await db
      .from("evt_mlg_mth_snap")
      .update({ goal_mlg: newGoal, updated_at: dayjs().toISOString() })
      .eq("goal_id", goalId);

    if (error) return { ok: false, message: "목표 수정에 실패했습니다" };

    try {
      await recalcGoalsFromMonth(evtId, existing.prt_id, goalId);
    } catch (e) {
      console.error("[mileage] 목표 재계산 실패(updateMonthlyGoal)", e);
      return { ok: false, message: "목표 재계산에 실패했습니다. 잠시 후 다시 시도해주세요" };
    }

    revalidatePath("/projects");
    return { ok: true, message: null };
  });
}

// ─────────────────────────────────────────
// 7. 목표 연쇄 재계산 (내부)
// ─────────────────────────────────────────

/** 코어 함수에 service-role 클라이언트를 물려 준다 — 로직 정본은 `lib/mileage-run.ts`. */
async function recalcGoalsFromMonth(
  evtId: string,
  prtId: string,
  anchorGoalId?: string,
): Promise<void> {
  return recalcGoalsFromMonthCore(createAdminClient(), evtId, prtId, anchorGoalId);
}
