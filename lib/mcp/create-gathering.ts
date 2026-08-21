import type { SupabaseClient } from "@supabase/supabase-js";

import { dayjs } from "@/lib/dayjs";
import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import type { Database } from "@/lib/supabase/database.types";
import { createGthrSchema } from "@/lib/validations/gathering";

/**
 * 기강 운영 MCP — write 도구 `create_gathering`(#485).
 *
 * ## 왜 서버 액션을 그대로 못 쓰는가
 * 이슈는 `app/actions/gathering/manage-gathering.ts` 의 `createGathering()` 을 호출하면 된다고
 * 봤지만, 그 액션은 `withActive` → `getCurrentMember()` → **Supabase 세션 쿠키**에 묶여 있다.
 * MCP 요청이 들고 오는 건 `Authorization: Bearer <PAT>` 뿐이라 세션이 없어 곧바로
 * "로그인이 필요합니다."로 떨어진다. 팀도 `getRequestTeamContext()`(Host 파싱)가 아니라
 * 토큰 컨텍스트(`ctx.team_id`)에서 와야 한다. 그래서 같은 일을 하는 경로를 여기 따로 둔다.
 *
 * ## 앱과 맞춘 것 / 다른 것
 * - **맞춤**: 입력 검증(`createGthrSchema` 공유), KST→UTC 변환, 작성자 자동 참석,
 *   팀 전원 `gthr_new` 알림(인앱+푸시). 앱으로 만든 벙과 MCP 로 만든 벙이 다르게 굴면
 *   "왜 알림이 안 왔지"가 도구 탓인지 알 수 없다.
 * - **다름**: ① admin 게이트(§안전장치) ② 감사행(`mcp_audit_log`) ③ `dry_run`
 *   ④ 알림을 `after()` 로 미루지 않고 인라인으로 보내 **실제 발송 인원을 응답에 싣는다**
 *   (AI 가 "몇 명에게 알림이 갔다"까지 답할 수 있어야 사람이 웹을 다시 열지 않는다).
 *
 * ## service-role 클라이언트 주입식
 * 클라이언트를 인자로 받아 이 모듈은 `admin.ts`(server-only)를 import 하지 않는다
 * (queries.ts·send-push.ts 와 동일). 단 `insertNotiMany` 는 server-only 체인이라
 * 이 모듈을 테스트할 때는 `vi.mock("@/lib/notifications/insert-noti")` 가 필수다
 * ([[troubleshooting/vitest-server-only-trap]]).
 */

type Db = SupabaseClient<Database>;

/** 모임 알림 타입 — 앱의 `createGathering` 과 동일(`noti_mst` CHECK·NOTI_ICON 등록됨). */
const GTHR_NEW_NOTI_TYPE = "gthr_new";

/**
 * 도구가 받는 일시 형식. **KST 벽시계 시각**만 받는다.
 *
 * `Z`·`+09:00` 같은 오프셋 표기를 섞어 받으면 `dayjs.tz(x, "Asia/Seoul")` 가 그 값을 다시
 * KST 로 해석해 9시간이 조용히 밀린다 — 벙이 엉뚱한 시각에 서는데 아무 에러도 안 난다.
 * 형식을 하나로 좁혀 그 경로 자체를 없앤다(앱 폼도 `YYYY-MM-DDTHH:mm` 을 넘긴다).
 */
const KST_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

export type CreateGatheringInput = {
  gthr_nm: string;
  gthr_type_enm: string;
  sprt_cd: string;
  stt_at: string;
  end_at?: string | null;
  loc_txt?: string | null;
  desc_txt?: string | null;
  max_prt_cnt?: number | null;
  dry_run?: boolean;
};

export type CreateGatheringResult = {
  dry_run: boolean;
  gthr_id: string | null;
  short_id: string | null;
  gthr_url: string | null;
  gthr_nm: string;
  gthr_type_enm: string;
  sprt_cd: string;
  /** 저장된 값을 KST 로 되읽은 것 — AI 가 날짜를 잘못 파싱했는지 사람이 눈으로 잡는 자리. */
  stt_at_kst: string;
  end_at_kst: string | null;
  loc_txt: string | null;
  max_prt_cnt: number | null;
  /** 실제 인앱 알림이 들어간 인원(수신거부 필터 반영). dry_run 이면 0. */
  notified_cnt: number;
  audit_id: string | null;
};

/**
 * KST 벽시계 문자열 → UTC ISO. 형식 위반은 안전 에러로 되돌린다(9시간 밀림 방지).
 *
 * **`isValid()` 로는 부족하다**(2026-08-21 E2E 에서 실제로 통과했다): dayjs 는 범위를 벗어난
 * 값을 거부하지 않고 **굴린다**. `2026-13-05` → `2027-01-05`, `2026-02-31` → `2026-03-03`,
 * `25:99` → 다음 날 `02:39`. 전부 `isValid() === true` 라, 월을 잘못 적은 벙이 **에러 하나
 * 없이 딴 달에 선다** — 오프셋 표기를 막아 놓고 정작 같은 결과를 다른 문으로 들여보내는 꼴이다.
 *
 * 그래서 파싱 결과를 **되찍어 입력과 대조**한다. 굴러간 값은 원문과 달라지므로 여기서 걸린다.
 */
function toUtcIsoKst(label: string, localDt: string): string {
  const raw = localDt.trim();
  if (!KST_DATETIME_RE.test(raw)) {
    throw new ToolInputError(
      `${label} 은 KST 기준 'YYYY-MM-DD HH:mm' 형식이어야 합니다(시간대 표기 없이). 받은 값: ${localDt}`,
    );
  }
  const normalized = raw.replace(" ", "T");
  const parsed = dayjs.tz(normalized, "Asia/Seoul");
  if (!parsed.isValid()) {
    throw new ToolInputError(`${label} 이 실제 존재하는 일시가 아닙니다. 받은 값: ${localDt}`);
  }
  // 초 표기가 있으면 초까지, 없으면 분까지 되찍어 원문과 맞대본다.
  const fmt = normalized.length > 16 ? "YYYY-MM-DDTHH:mm:ss" : "YYYY-MM-DDTHH:mm";
  if (parsed.format(fmt) !== normalized) {
    throw new ToolInputError(
      `${label} 이 실제 존재하는 일시가 아닙니다(${parsed.format("YYYY-MM-DD HH:mm")} 으로 해석됨). 받은 값: ${localDt}`,
    );
  }
  return parsed.toISOString();
}

/** UTC ISO → 사람이 확인하기 좋은 KST 표기. */
function toKstLabel(iso: string | null): string | null {
  return iso ? dayjs(iso).tz("Asia/Seoul").format("YYYY-MM-DD(ddd) HH:mm") : null;
}

/**
 * `create_gathering` 본체. admin 게이트 → 검증 → (dry_run 이면 여기서 종료) →
 * insert → 작성자 자동 참석 → 팀 알림 → 감사행.
 *
 * @param supabase service-role 클라이언트(라우트에서 주입). RLS 우회 — 스코프는 코드가 강제한다.
 * @param ctx      operator 컨텍스트. `team_id`·`mem_id` 는 여기서만 나온다(도구 인자로 안 받는다).
 * @param input    도구 입력.
 * @param baseUrl  상세 URL 조립용 origin(없으면 상대 경로로 돌려준다).
 * @throws ToolDeniedError 비-admin — 아무것도 만들지 않는다.
 * @throws ToolInputError  검증 실패(형식·필수값·종료<시작).
 */
export async function createGatheringViaMcp(
  supabase: Db,
  ctx: OperatorContext,
  input: CreateGatheringInput,
  baseUrl?: string | null,
): Promise<CreateGatheringResult> {
  // 쓰기 도구는 send_push 와 같은 급으로 본다(#485 §안전장치) — 되돌리기가 어렵고
  // 만드는 순간 팀 전원에게 알림이 나간다. 거부는 검증·insert 이전에.
  if (!ctx.is_admin) {
    throw new ToolDeniedError("모임 개설은 운영진(admin)만 실행할 수 있습니다.");
  }

  // 앱 폼과 **같은 스키마**로 검증한다 — 제목 길이·유형·종목 목록이 갈리면 MCP 로 만든 벙만
  // 화면에서 이상하게 보인다. team_id 는 입력이 아니라 토큰 컨텍스트에서 채운다.
  const parsed = createGthrSchema.safeParse({ ...input, team_id: ctx.team_id });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ToolInputError(
      `${first.path.filter((p) => p !== "team_id").join(".") || "입력"}: ${first.message}`,
    );
  }
  const v = parsed.data;

  const sttIso = toUtcIsoKst("시작 일시(stt_at)", v.stt_at);
  const endIso = v.end_at ? toUtcIsoKst("종료 일시(end_at)", v.end_at) : null;

  // 종료가 시작보다 앞선 모임은 달력 뷰에서 통째로 사라지면서 신청은 계속 받는다(#495).
  // 사람이 폼에서 내는 오타를 AI 는 더 쉽게 낸다("8월 25일 19시~20시"를 년/월 오타로) —
  // 새 입력 창구를 열면서 그 행을 만들 수 있게 두지 않는다.
  if (endIso && endIso <= sttIso) {
    throw new ToolInputError(
      "종료 일시(end_at)가 시작 일시(stt_at)보다 앞서거나 같습니다. 날짜를 다시 확인해 주세요.",
    );
  }

  const sttKst = toKstLabel(sttIso)!;
  const endKst = toKstLabel(endIso);

  // dry_run: 검증만 하고 아무것도 쓰지 않는다. AI 가 자연어에서 뽑아낸 날짜·장소를
  // **저장 전에** 사람이 눈으로 확인하는 자리(#485 §안전장치).
  if (input.dry_run) {
    return {
      dry_run: true,
      gthr_id: null,
      short_id: null,
      gthr_url: null,
      gthr_nm: v.gthr_nm,
      gthr_type_enm: v.gthr_type_enm,
      sprt_cd: v.sprt_cd,
      stt_at_kst: sttKst,
      end_at_kst: endKst,
      loc_txt: v.loc_txt ?? null,
      max_prt_cnt: v.max_prt_cnt ?? null,
      notified_cnt: 0,
      audit_id: null,
    };
  }

  const { data: created, error: insertErr } = await supabase
    .from("gthr_mst")
    .insert({
      team_id: ctx.team_id,
      gthr_nm: v.gthr_nm,
      gthr_type_enm: v.gthr_type_enm,
      sprt_cd: v.sprt_cd,
      stt_at: sttIso,
      end_at: endIso,
      loc_txt: v.loc_txt ?? null,
      desc_txt: v.desc_txt ?? null,
      max_prt_cnt: v.max_prt_cnt ?? null,
      crt_by: ctx.mem_id,
      del_yn: false,
    })
    .select("gthr_id, short_id")
    .single();

  if (insertErr || !created) {
    throw new ToolInputError("모임 개설에 실패했습니다. 입력값을 확인해 주세요.");
  }

  const gthrId = created.gthr_id as string;

  // 작성자 자동 참석 — 앱과 동일. 실패해도 벙은 이미 섰으므로 되돌리지 않고 로깅만 한다.
  const { error: attdErr } = await supabase
    .from("gthr_attd_rel")
    .insert({ gthr_id: gthrId, mem_id: ctx.mem_id });
  if (attdErr) {
    console.error("[mcp] create_gathering 자동 참석 등록 실패", attdErr.message);
  }

  // 팀 전원 알림 — 앱과 동일한 타입·문구. 앱은 `after()` 로 미루지만 여기선 인라인으로
  // 보내 실제 발송 인원을 응답에 싣는다(호출자가 곧 사람이라, 결과를 그 자리에서 알아야 한다).
  let notifiedCnt = 0;
  try {
    const { data: members } = await supabase
      .from("team_mem_rel")
      .select("mem_id")
      .eq("team_id", ctx.team_id)
      .eq("vers", 0)
      .eq("del_yn", false)
      .neq("mem_id", ctx.mem_id);

    if (members?.length) {
      const dateStr = dayjs(sttIso).tz("Asia/Seoul").format("M월 D일");
      const { notifiedMemIds } = await insertNotiMany({
        teamId: ctx.team_id,
        memIds: members.map((m) => m.mem_id as string),
        notiTypeEnm: GTHR_NEW_NOTI_TYPE,
        notiNm: `${dateStr} 새 모임이 등록됐습니다.`,
        notiCont: `[모임] ${v.gthr_nm}`,
        refId: gthrId,
        refTypeEnm: "gathering",
      });
      notifiedCnt = notifiedMemIds.length;
    }
  } catch (e) {
    // 알림 실패로 벙 개설을 되돌리지 않는다 — 벙은 이미 DB 에 있고, 알림은 부수효과다.
    console.error("[mcp] create_gathering 알림 발송 실패", e);
  }

  // 감사행 — send_push 와 같은 규약. 쓰기 도구는 누가 무엇을 만들었는지 남긴다.
  const auditId = crypto.randomUUID();
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "create_gathering",
    params_json: {
      gthr_id: gthrId,
      gthr_nm: v.gthr_nm,
      gthr_type_enm: v.gthr_type_enm,
      sprt_cd: v.sprt_cd,
      stt_at: sttIso,
      end_at: endIso,
      loc_txt: v.loc_txt ?? null,
      max_prt_cnt: v.max_prt_cnt ?? null,
      notified_cnt: notifiedCnt,
    },
    result_summary: `create_gathering ok: gthr_id=${gthrId} notified=${notifiedCnt}`,
  });
  if (auditErr) {
    console.error("[mcp] create_gathering 감사 기록 실패", auditErr.message);
  }

  const path = `/gatherings/${gthrId}`;
  return {
    dry_run: false,
    gthr_id: gthrId,
    short_id: (created.short_id as string | null) ?? null,
    gthr_url: baseUrl ? `${baseUrl}${path}` : path,
    gthr_nm: v.gthr_nm,
    gthr_type_enm: v.gthr_type_enm,
    sprt_cd: v.sprt_cd,
    stt_at_kst: sttKst,
    end_at_kst: endKst,
    loc_txt: v.loc_txt ?? null,
    max_prt_cnt: v.max_prt_cnt ?? null,
    notified_cnt: notifiedCnt,
    audit_id: auditId,
  };
}
