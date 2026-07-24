import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolInputError } from "@/lib/mcp/queries";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — 유일한 write 도구 `send_push` 의 발송 로직(SG-05, 스펙 §4·§6·§8).
 *
 * 설계 원칙
 * - **service-role 클라이언트 주입식**: 클라이언트를 인자로 받아(=queries.ts 와 동일) 이 모듈은
 *   `admin.ts`(server-only)를 import 하지 않는다. 단, 발송 위임 대상 `insertNotiMany` 는
 *   server-only 체인이므로 이 모듈을 테스트할 때는 `vi.mock("@/lib/notifications/insert-noti")`
 *   가 필수다([[troubleshooting/vitest-server-only-trap]]).
 * - **admin 게이트(G-2)**: `ctx.is_admin` 이 아니면 아무것도 발송하지 않고 즉시 거부한다.
 *   거부는 insertNotiMany 호출 이전에 일어나며 감사행도 남기지 않는다(AC-17).
 * - **팀 스코프 안전장치**: 요청된 member_ids 중 `ctx.team_id` 소속의 정본(vers=0·del_yn=false)
 *   활성(mem_st_cd='active') 멤버만 발송 대상으로 남긴다. 교차 팀·비활성·미존재 id 는 제외한다
 *   (스펙 원칙: 교차 팀 발송 불가). 유효 대상이 0명이면 발송하지 않고 안전 에러를 던진다.
 * - **감사(AC-18)**: 실제 발송(≥1명) 시 `mcp_audit_log` 에 정확히 1행을 남긴다.
 *   params_json 에는 연락처·계좌 등 민감정보를 절대 담지 않는다(제목·본문·수신자 mem_id 만).
 * - **noti_type 재사용**: 관리자 수동 발송용 기존 범용 타입 `adm_cust` 를 그대로 쓴다.
 *   noti_mst CHECK 제약과 NOTI_ICON(notification-item.tsx) 에 이미 등록돼 있어
 *   신규 타입 추가·아이콘 맵 갱신이 필요 없다(Bell 폴백 함정 회피).
 */

type Db = SupabaseClient<Database>;

/** 관리자 수동 발송 알림 타입(기존 범용 타입 재사용 — NOTI_ICON·CHECK 이미 등록). */
const SEND_PUSH_NOTI_TYPE = "adm_cust";

export type SendPushInput = {
  memberIds: string[];
  title: string;
  message: string;
};

export type SendPushResult = {
  sent_cnt: number;
  audit_id: string;
};

/**
 * 비-admin 이 write 도구를 호출했을 때의 거부(스펙 §6 G-2 / §7 403).
 * MCP 는 단일 200 채널이라 HTTP 403 대신 tool error 로 반환하되, 사유는 안전 메시지만 노출한다.
 */
export class SendPushDeniedError extends Error {
  constructor(message = "이 작업은 운영진(admin)만 실행할 수 있습니다.") {
    super(message);
    this.name = "SendPushDeniedError";
  }
}

/**
 * 요청된 member_ids 중 ctx.team_id 소속의 정본·활성 멤버만 골라낸다(팀 스코프 강제).
 * 반환 순서는 입력 순서를 보존하고 중복은 제거한다. 교차 팀·비활성·미존재 id 는 조회 결과에
 * 포함되지 않으므로 자연히 제외된다.
 */
async function resolveTeamActiveTargets(
  supabase: Db,
  teamId: string,
  memberIds: string[],
): Promise<string[]> {
  const uniqueRequested = Array.from(new Set(memberIds));
  if (uniqueRequested.length === 0) return [];

  const { data, error } = await supabase
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active")
    .in("mem_id", uniqueRequested);
  if (error) throw error;

  const valid = new Set((data ?? []).map((r) => r.mem_id as string));
  // 입력 순서 보존 + 유효 대상만.
  return uniqueRequested.filter((id) => valid.has(id));
}

/**
 * `send_push` 발송 로직(스펙 §4). admin 게이트 → 팀 스코프 검증 → 발송 위임 → 감사행 기록.
 *
 * @param supabase service-role 클라이언트(라우트에서 주입). RLS 우회 — 스코프는 코드가 강제한다.
 * @param ctx      operator 컨텍스트(팀 스코프 신원·권한).
 * @param input    검증된 입력(member_ids·title·message).
 * @throws SendPushDeniedError 비-admin(G-2) — 아무것도 발송하지 않음.
 * @throws ToolInputError      유효 발송 대상이 0명(교차 팀/비활성/미존재만 지정한 경우).
 */
export async function sendPush(
  supabase: Db,
  ctx: OperatorContext,
  input: SendPushInput,
): Promise<SendPushResult> {
  // G-2: admin 게이트 — insertNotiMany 호출·감사행 이전에 차단.
  if (!ctx.is_admin) {
    throw new SendPushDeniedError();
  }

  const targets = await resolveTeamActiveTargets(
    supabase,
    ctx.team_id,
    input.memberIds,
  );
  if (targets.length === 0) {
    throw new ToolInputError("발송 대상 멤버가 없습니다. 우리 팀의 활성 멤버 id 인지 확인하세요.");
  }

  // 인앱 noti + 웹푸시 자동. pref 수신거부 필터는 insertNotiMany(관문)가 처리한다.
  // 관리자 수동 발송 = 하나의 배치(발송 이력 화면이 batch_id 로 수신자를 묶는다).
  const batchId = crypto.randomUUID();
  await insertNotiMany({
    teamId: ctx.team_id,
    memIds: targets,
    notiTypeEnm: SEND_PUSH_NOTI_TYPE,
    notiNm: input.title,
    notiCont: input.message,
    batchId,
  });

  const sentCnt = targets.length;

  // AC-18: 발송 성공 시 감사행 1행. params_json 에 민감정보(연락처·계좌) 미포함.
  const auditId = crypto.randomUUID();
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "send_push",
    params_json: {
      title: input.title,
      message: input.message,
      requested_cnt: input.memberIds.length,
      sent_cnt: sentCnt,
      recipient_mem_ids: targets,
      batch_id: batchId,
    },
    result_summary: `send_push ok: sent_cnt=${sentCnt} requested=${input.memberIds.length}`,
  });
  // 감사 기록 실패는 발송을 되돌리지 않는다(이미 발송됨) — 로깅만. 정상 경로에선 성공.
  if (auditErr) {
    console.error("[mcp] send_push 감사 기록 실패", auditErr.message);
  }

  return { sent_cnt: sentCnt, audit_id: auditId };
}
