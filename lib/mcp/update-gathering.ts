import type { SupabaseClient } from "@supabase/supabase-js";

import { dayjs } from "@/lib/dayjs";
import { parseCancelResult } from "@/lib/gathering/cancel-result";
import { notifyGatheringUpdated } from "@/lib/gathering/kakao-dispatch";
import { runPromotionFollowups } from "@/lib/gathering/promotion-followup";
import type { OperatorContext } from "@/lib/mcp/auth";
import { toKstLabel, toUtcIsoKst } from "@/lib/mcp/kst-datetime";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import { isPastLockedFor, PAST_EVENT_ERROR } from "@/lib/past-event";
import type { Database } from "@/lib/supabase/database.types";
import { updateGthrSchema } from "@/lib/validations/gathering";

/**
 * 기강 운영 MCP — write 도구 `update_gathering`(#644).
 *
 * `create_gathering`(#485)의 짝이다. 앱의 `updateGathering` 서버 액션은 세션 쿠키에 묶여 MCP 에서
 * 못 부르므로(create-gathering.ts 머리 주석 참조) 같은 규칙을 토큰 컨텍스트로 다시 구현한다.
 *
 * ## 앱과 맞춘 것
 * - 검증: 앱 수정 폼과 같은 `updateGthrSchema`(제목·장소·정원·본문 규칙 공유).
 * - 팀 경계: 조회에 `team_id = ctx.team_id` 를 건다 — service-role 이라 RLS 가 없으므로 코드가 강제한다.
 * - 권한: **모임 작성자 또는 운영진**. 지난 모임은 운영진만(`isPastLockedFor`).
 * - 종료<시작 거부(#495): 한쪽만 바꾸는 수정은 스키마가 못 잡아 기존값과 합쳐 다시 본다.
 * - 정원 증가 → 대기열 승급(RPC `promote_gthr_waitlist_notice`).
 *
 * ## 앱과 다른 것
 * - **알림은 기본 안 보낸다.** `notify: true` 일 때만 참석자 `gthr_upd` 인앱+푸시, 일시·장소가 바뀐
 *   경우의 단톡방 변경 공지, 승급자·빈 자리 알림이 나간다(앱은 항상 보낸다). AI 가 오타를 고치는
 *   수준의 수정에 참석자가 매번 알림을 받지 않게 하려는 것이다.
 * - `dry_run` 은 전/후 비교만 돌려주고 아무것도 쓰지 않는다. 감사행(`mcp_audit_log`)을 남긴다.
 *
 * 승인제·참여조건·면제 프로젝트·종류/종목은 이 도구가 다루지 않는다(웹에서 수정).
 * `server-only` 체인 때문에 테스트는 `insert-noti`·`kakao-dispatch`·`promotion-followup` 을 mock 해야 한다.
 */

type Db = SupabaseClient<Database>;

/** 이 도구가 바꿀 수 있는 필드. */
export const UPDATE_GATHERING_FIELDS = [
  "gthr_nm",
  "stt_at",
  "end_at",
  "loc_txt",
  "max_prt_cnt",
  "desc_txt",
] as const;
export type UpdateGatheringField = (typeof UPDATE_GATHERING_FIELDS)[number];

export type UpdateGatheringInput = {
  gathering_id: string;
  gthr_nm?: string;
  stt_at?: string;
  end_at?: string | null;
  loc_txt?: string;
  max_prt_cnt?: number | null;
  desc_txt?: string | null;
  dry_run?: boolean;
  notify?: boolean;
};

export type GatheringFieldChange = {
  /** 사람이 읽는 값 — 일시는 KST 라벨(`YYYY-MM-DD(요일) HH:mm`). */
  before: string | number | null;
  after: string | number | null;
};

export type UpdateGatheringResult = {
  dry_run: boolean;
  gthr_id: string;
  gthr_nm: string;
  /** 실제로 값이 달라지는(달라진) 필드 이름. 비어 있으면 아무것도 쓰지 않았다. */
  changed_fields: UpdateGatheringField[];
  changes: Partial<Record<UpdateGatheringField, GatheringFieldChange>>;
  notify: boolean;
  /** 실제 인앱 알림이 들어간 참석자 수. notify 가 아니거나 dry_run 이면 0. */
  notified_cnt: number;
  /** 정원이 늘어 대기열에서 참석으로 올라간 인원. dry_run 이면 0. */
  promoted_cnt: number;
  /**
   * 단톡방 변경 공지. `requested` = 발송을 요청했다(일시·장소가 바뀐 경우만, 방 설정이 없으면 내부에서 건너뜀).
   * `skipped` = notify 가 아니거나 일시·장소가 안 바뀜.
   */
  kakao_notice: "requested" | "skipped" | "failed";
  audit_id: string | null;
};

type Existing = {
  gthr_nm: string;
  stt_at: string;
  end_at: string | null;
  loc_txt: string | null;
  desc_txt: string | null;
  max_prt_cnt: number | null;
  short_id: string | null;
  crt_by: string | null;
};

/** 일시 필드는 KST 라벨로, 나머지는 값 그대로 — 사람이 눈으로 전/후를 맞대는 용도. */
function display(field: UpdateGatheringField, v: unknown): string | number | null {
  if (v == null) return null;
  if (field === "stt_at" || field === "end_at") return toKstLabel(v as string);
  return v as string | number;
}

export async function updateGatheringViaMcp(
  supabase: Db,
  ctx: OperatorContext,
  input: UpdateGatheringInput,
  baseUrl?: string | null,
): Promise<UpdateGatheringResult> {
  const notify = input.notify === true;

  const wanted = UPDATE_GATHERING_FIELDS.filter((f) => input[f] !== undefined);
  if (wanted.length === 0) {
    throw new ToolInputError(
      `바꿀 필드를 하나 이상 주세요(${UPDATE_GATHERING_FIELDS.join(", ")}).`,
    );
  }

  // 앱 수정 폼과 같은 스키마. 일시는 KST 문자열 그대로 통과시키고 형식은 아래 파서가 강제한다.
  const parsed = updateGthrSchema.safeParse({
    gthr_id: input.gathering_id,
    ...Object.fromEntries(wanted.map((f) => [f, input[f]])),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ToolInputError(`${first.path.join(".") || "입력"}: ${first.message}`);
  }

  // 팀 경계 — 다른 팀 모임은 "없음"으로 응답한다(존재 여부도 새지 않게).
  const { data: existing } = await supabase
    .from("gthr_mst")
    .select("gthr_nm, stt_at, end_at, loc_txt, desc_txt, max_prt_cnt, short_id, crt_by")
    .eq("gthr_id", input.gathering_id)
    .eq("team_id", ctx.team_id)
    .eq("del_yn", false)
    .maybeSingle();
  if (!existing) throw new ToolInputError("모임을 찾을 수 없습니다.");
  const prev = { ...(existing as Existing) };

  if (prev.crt_by !== ctx.mem_id && !ctx.is_admin) {
    throw new ToolDeniedError("모임 수정은 모임 작성자 또는 운영진(admin)만 실행할 수 있습니다.");
  }
  if (isPastLockedFor(ctx.is_admin, prev.stt_at, prev.end_at)) {
    throw new ToolDeniedError(PAST_EVENT_ERROR);
  }

  // 바꿀 값(DB 형식). 일시는 KST → UTC ISO.
  const next: Record<UpdateGatheringField, unknown> = {
    gthr_nm: prev.gthr_nm,
    stt_at: prev.stt_at,
    end_at: prev.end_at,
    loc_txt: prev.loc_txt,
    desc_txt: prev.desc_txt,
    max_prt_cnt: prev.max_prt_cnt,
  };
  if (input.gthr_nm !== undefined) next.gthr_nm = parsed.data.gthr_nm;
  if (input.stt_at !== undefined) next.stt_at = toUtcIsoKst("시작 일시(stt_at)", input.stt_at);
  if (input.end_at !== undefined) {
    next.end_at = input.end_at ? toUtcIsoKst("종료 일시(end_at)", input.end_at) : null;
  }
  if (input.loc_txt !== undefined) next.loc_txt = parsed.data.loc_txt;
  if (input.desc_txt !== undefined) next.desc_txt = parsed.data.desc_txt ?? null;
  if (input.max_prt_cnt !== undefined) next.max_prt_cnt = parsed.data.max_prt_cnt ?? null;

  // 한쪽만 바꾸는 수정은 스키마가 못 잡는다(#495) — 합친 값으로 다시 본다.
  if (next.end_at && dayjs(next.end_at as string).isBefore(dayjs(next.stt_at as string))) {
    throw new ToolInputError(
      "종료 일시(end_at)가 시작 일시(stt_at)보다 앞섭니다. 날짜를 다시 확인해 주세요.",
    );
  }

  // 지난 일시로 옮기는 것도 운영진만 — 작성자가 모임을 달력에서 지난 일정으로 만들지 못하게.
  if (isPastLockedFor(ctx.is_admin, next.stt_at as string, next.end_at as string | null)) {
    throw new ToolDeniedError(PAST_EVENT_ERROR);
  }

  const changes: UpdateGatheringResult["changes"] = {};
  const changedFields: UpdateGatheringField[] = [];
  for (const f of wanted) {
    const before = prev[f];
    const after = next[f];
    if (before === after) continue;
    changedFields.push(f);
    changes[f] = { before: display(f, before), after: display(f, after) };
  }

  const base: UpdateGatheringResult = {
    dry_run: input.dry_run === true,
    gthr_id: input.gathering_id,
    gthr_nm: next.gthr_nm as string,
    changed_fields: changedFields,
    changes,
    notify,
    notified_cnt: 0,
    promoted_cnt: 0,
    kakao_notice: "skipped",
    audit_id: null,
  };

  // dry_run 이거나 바뀐 게 없으면 여기서 끝 — 아무것도 쓰지 않는다.
  if (input.dry_run || changedFields.length === 0) return base;

  const patch: Record<string, unknown> = { upd_at: dayjs().toISOString() };
  for (const f of changedFields) patch[f] = next[f];
  const { error: updErr } = await supabase
    .from("gthr_mst")
    .update(patch)
    .eq("gthr_id", input.gathering_id)
    .eq("team_id", ctx.team_id);
  if (updErr) throw new ToolInputError("모임 수정에 실패했습니다. 입력값을 확인해 주세요.");

  // 정원이 늘어난 경우에만 대기열을 당긴다(앱과 같은 규칙 — null→숫자는 제한을 건 것이라 제외).
  // 승급은 데이터 정합이라 notify 와 무관하게 하되, 승급자 **알림**은 notify 일 때만 보낸다.
  const capBefore = prev.max_prt_cnt;
  const capAfter = next.max_prt_cnt as number | null;
  let promotedCnt = 0;
  if (capBefore !== null && capAfter !== null && capAfter > capBefore) {
    try {
      const { data: raw, error } = await (
        supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
        }
      ).rpc("promote_gthr_waitlist_notice", { p_gthr_id: input.gathering_id, p_team_id: ctx.team_id });
      if (error) {
        console.error("[mcp] update_gathering 정원 증가 승급 실패", error.message);
      } else {
        const { promoted, notifyOpenSeat } = parseCancelResult(raw);
        promotedCnt = promoted.length;
        if (notify) {
          await runPromotionFollowups(supabase as never, {
            teamId: ctx.team_id,
            gthrId: input.gathering_id,
            gthrNm: next.gthr_nm as string,
            cause: "capacity",
            promoted,
            notifyOpenSeat,
          });
        }
      }
    } catch (e) {
      console.error("[mcp] update_gathering 승급 처리 실패", e);
    }
  }

  let notifiedCnt = 0;
  let kakaoNotice: UpdateGatheringResult["kakao_notice"] = "skipped";
  if (notify) {
    try {
      const { data: attendees } = await supabase
        .from("gthr_attd_rel")
        .select("mem_id")
        .eq("gthr_id", input.gathering_id)
        .neq("mem_id", ctx.mem_id);
      if (attendees?.length) {
        const nm = next.gthr_nm as string;
        const { notifiedMemIds } = await insertNotiMany({
          teamId: ctx.team_id,
          memIds: attendees.map((a) => a.mem_id as string),
          notiTypeEnm: "gthr_upd",
          notiNm: `'${nm}' 모임 정보가 변경됐습니다.`,
          notiCont: `[모임] ${nm}`,
          refId: input.gathering_id,
          refTypeEnm: "gathering",
        });
        notifiedCnt = notifiedMemIds.length;
      }
    } catch (e) {
      console.error("[mcp] update_gathering 알림 발송 실패", e);
    }

    // 단톡방 변경 공지 — 함수 안에서 일시·장소가 실제로 바뀐 경우에만 나간다.
    if (changedFields.includes("stt_at") || changedFields.includes("end_at") || changedFields.includes("loc_txt")) {
      try {
        await notifyGatheringUpdated({
          teamId: ctx.team_id,
          gthrId: input.gathering_id,
          ref: prev.short_id ?? input.gathering_id,
          origin: baseUrl ?? null,
          title: next.gthr_nm as string,
          sttAt: next.stt_at as string,
          endAt: next.end_at as string | null,
          location: (next.loc_txt as string | null) ?? null,
          authorName: ctx.mem_nm || null,
          prev: { sttAt: prev.stt_at, endAt: prev.end_at, location: prev.loc_txt ?? null },
        });
        kakaoNotice = "requested";
      } catch (e) {
        console.error("[mcp] update_gathering 단톡방 공지 실패", e);
        kakaoNotice = "failed";
      }
    }
  }

  const auditId = crypto.randomUUID();
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "update_gathering",
    params_json: {
      gthr_id: input.gathering_id,
      changed_fields: changedFields,
      changes,
      notify,
      notified_cnt: notifiedCnt,
      promoted_cnt: promotedCnt,
      kakao_notice: kakaoNotice,
    },
    result_summary: `update_gathering ok: gthr_id=${input.gathering_id} fields=${changedFields.join(",")} notified=${notifiedCnt}`,
  });
  if (auditErr) console.error("[mcp] update_gathering 감사 기록 실패", auditErr.message);

  return {
    ...base,
    notified_cnt: notifiedCnt,
    promoted_cnt: promotedCnt,
    kakao_notice: kakaoNotice,
    audit_id: auditId,
  };
}
