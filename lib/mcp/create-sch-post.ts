import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperatorContext } from "@/lib/mcp/auth";
import { toKstLabel, toUtcIsoKst } from "@/lib/mcp/kst-datetime";
import { ToolInputError } from "@/lib/mcp/queries";
import { insertSchPost, notifySchPostCreated } from "@/lib/sch-post";
import type { Database } from "@/lib/supabase/database.types";
import { createSchPostSchema, type SchPostType } from "@/lib/validations/schedule";

/**
 * 기강 운영 MCP — write 도구 `create_sch_post`(#630). 일정 소식(대회접수·판매·세션·일반) 등록.
 *
 * ## 왜 서버 액션을 그대로 못 쓰는가
 * `createSchPost()`(app/actions/schedule/manage-sch-post.ts)는 `withActive` → 세션 쿠키에 묶여 있고
 * 팀도 Host 파싱에서 온다. MCP 는 Bearer 토큰뿐이라 신원·팀을 토큰 컨텍스트에서 채운다.
 * **저장·알림 자체는 액션과 같은 코어**(`lib/sch-post.ts`)를 쓴다 — 무엇을 넣고 누구에게 어떤
 * 문구로 알리는지가 갈리지 않게.
 *
 * ## 권한 — 앱과 같은 범위(활성 멤버), admin 게이트 없음
 * 앱에서 소식 작성은 **활성 멤버 누구나**다(`withActive`). 운영 MCP 토큰은 `resolveOperator` 가
 * 활성 멤버만 통과시키므로 여기 도달한 호출자는 이미 앱에서 소식을 쓸 수 있는 사람이다.
 * `create_gathering` 처럼 admin 으로 좁히지 않는 이유: 앱보다 **좁힐** 근거는 없고, 넓어지지 않는
 * 것만 지키면 된다(이슈 §안전장치). 팀은 토큰의 `team_id` 로만 정해져 다른 팀에 쓸 길이 없다.
 *
 * ## 앱과 다른 것
 * ① 일시는 KST `YYYY-MM-DD HH:mm` 만(오프셋·자연어 거부 — `kst-datetime.ts`) ② 종료<시작 거부
 * ③ `dry_run` ④ 감사행(`mcp_audit_log`) ⑤ 알림을 `after()` 로 미루지 않고 인라인으로 보내
 * **실제 발송 인원을 응답에 싣는다**. 단톡방 노티봇 공지는 없다 — 앱의 소식 등록에도 없다.
 *
 * service-role 클라이언트 주입식이라 이 모듈은 `admin.ts`(server-only)를 import 하지 않는다.
 * 단 `insertNotiMany` 가 server-only 체인이라 테스트에선 `vi.mock("@/lib/notifications/insert-noti")` 필수.
 */

type Db = SupabaseClient<Database>;

export type CreateSchPostMcpInput = {
  sch_nm: string;
  post_type: string;
  evt_stt_at: string;
  evt_end_at?: string | null;
  url?: string | null;
  cont_txt?: string | null;
  dry_run?: boolean;
};

export type CreateSchPostMcpResult = {
  dry_run: boolean;
  sch_post_id: string | null;
  short_id: string | null;
  /** 상세 링크(일정 탭이 `?post=` 로 그 소식을 연다). dry_run 이면 null. */
  sch_post_url: string | null;
  sch_nm: string;
  post_type: SchPostType;
  /** 저장된 일시를 KST 로 되읽은 것 — AI 가 날짜를 잘못 파싱했는지 사람이 눈으로 잡는 자리. */
  evt_stt_at_kst: string;
  evt_end_at_kst: string | null;
  url: string | null;
  /** 저장된 시각(KST). dry_run 이면 null. */
  crt_at_kst: string | null;
  /** 실제 인앱 알림이 들어간 인원(수신거부 필터 반영). dry_run 이면 0. */
  notified_cnt: number;
  audit_id: string | null;
};

/**
 * `create_sch_post` 본체. 검증 → (dry_run 이면 여기서 종료) → insert → 팀 알림 → 감사행.
 *
 * @param supabase service-role 클라이언트(라우트에서 주입). RLS 우회 — 스코프는 코드가 강제한다.
 * @param ctx      operator 컨텍스트. `team_id`·`mem_id` 는 여기서만 나온다(도구 인자로 안 받는다).
 * @param input    도구 입력.
 * @param baseUrl  상세 URL 조립용 origin(없으면 상대 경로로 돌려준다).
 * @throws ToolInputError 검증 실패(형식·필수값·종료<시작)·저장 실패.
 */
export async function createSchPostViaMcp(
  supabase: Db,
  ctx: OperatorContext,
  input: CreateSchPostMcpInput,
  baseUrl?: string | null,
): Promise<CreateSchPostMcpResult> {
  // 앱 폼과 **같은 스키마**로 검증한다. team_id 는 입력이 아니라 토큰 컨텍스트에서 채운다
  // (입력에 team_id 가 섞여 와도 뒤에서 덮어쓴다).
  const parsed = createSchPostSchema.safeParse({ ...input, team_id: ctx.team_id });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ToolInputError(
      `${first.path.filter((p) => p !== "team_id").join(".") || "입력"}: ${first.message}`,
    );
  }
  const v = parsed.data;

  const sttIso = toUtcIsoKst("시작 일시(evt_stt_at)", v.evt_stt_at);
  const endIso = v.evt_end_at ? toUtcIsoKst("종료 일시(evt_end_at)", v.evt_end_at) : null;

  // 종료가 시작보다 앞선 소식은 달력에서 기간 바가 뒤집혀 사라진다. 앱 폼은 종료 입력을
  // 시작 이후로 묶어 두지만 MCP 엔 그 손잡이가 없다 — 같은 행을 만들 수 있게 두지 않는다.
  // 같은 시각(시작=종료)은 허용한다: 소식은 "접수 오픈 10:00"처럼 한 시점일 수 있다.
  if (endIso && endIso < sttIso) {
    throw new ToolInputError(
      "종료 일시(evt_end_at)가 시작 일시(evt_stt_at)보다 앞섭니다. 날짜를 다시 확인해 주세요.",
    );
  }

  const sttKst = toKstLabel(sttIso)!;
  const endKst = toKstLabel(endIso);
  const url = v.url || null;

  // dry_run: 검증만 하고 아무것도 쓰지 않는다 — 해석된 일시·유형을 저장 전에 사람이 확인하는 자리.
  if (input.dry_run) {
    return {
      dry_run: true,
      sch_post_id: null,
      short_id: null,
      sch_post_url: null,
      sch_nm: v.sch_nm,
      post_type: v.post_type,
      evt_stt_at_kst: sttKst,
      evt_end_at_kst: endKst,
      url,
      crt_at_kst: null,
      notified_cnt: 0,
      audit_id: null,
    };
  }

  const created = await insertSchPost(supabase, {
    teamId: ctx.team_id,
    memId: ctx.mem_id,
    values: v,
    sttIso,
    endIso,
  });
  if (!created) {
    throw new ToolInputError("일정 소식 등록에 실패했습니다. 입력값을 확인해 주세요.");
  }
  const postId = created.sch_post_id;

  // 팀 전원 알림 — 앱과 같은 코어·문구. 앱은 `after()` 로 미루지만 여기선 인라인으로 보내
  // 실제 발송 인원을 응답에 싣는다. 실패로 등록을 되돌리지 않는다(알림은 부수효과).
  let notifiedCnt = 0;
  try {
    notifiedCnt = await notifySchPostCreated(supabase, {
      teamId: ctx.team_id,
      authorId: ctx.mem_id,
      postId,
      postName: v.sch_nm,
    });
  } catch (e) {
    console.error("[mcp] create_sch_post 알림 발송 실패", e);
  }

  // 감사행 — 쓰기 도구는 누가 무엇을 만들었는지 남긴다(send_push·create_gathering 과 같은 규약).
  const auditId = crypto.randomUUID();
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "create_sch_post",
    params_json: {
      sch_post_id: postId,
      sch_nm: v.sch_nm,
      post_type: v.post_type,
      evt_stt_at: sttIso,
      evt_end_at: endIso,
      url,
      notified_cnt: notifiedCnt,
    },
    result_summary: `create_sch_post ok: sch_post_id=${postId} notified=${notifiedCnt}`,
  });
  if (auditErr) {
    console.error("[mcp] create_sch_post 감사 기록 실패", auditErr.message);
  }

  // 딥링크는 알림과 같은 목적지(`lib/notifications/deep-link.ts` 의 sch_post_new).
  const path = `/schedule?post=${postId}`;
  return {
    dry_run: false,
    sch_post_id: postId,
    short_id: created.short_id,
    sch_post_url: baseUrl ? `${baseUrl}${path}` : path,
    sch_nm: v.sch_nm,
    post_type: v.post_type,
    evt_stt_at_kst: sttKst,
    evt_end_at_kst: endKst,
    url,
    crt_at_kst: toKstLabel(created.crt_at),
    notified_cnt: notifiedCnt,
    audit_id: auditId,
  };
}
