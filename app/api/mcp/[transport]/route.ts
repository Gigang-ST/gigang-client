import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { revalidateTag } from "next/cache";

import { z } from "zod";

import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";

import { resolveOperator, type OperatorContext } from "@/lib/mcp/auth";
import { createGatheringViaMcp } from "@/lib/mcp/create-gathering";
import {
  MAX_BATCH_ACTIVITIES,
  deleteMyActivity,
  getMyMileage,
  listMileageMultipliers,
  listMyActivities,
  logMyActivities,
  updateMyActivity,
  type TitleEvalSeed,
} from "@/lib/mcp/mileage";
import {
  ToolDeniedError,
  ToolInputError,
  getMemberProfile,
  listGatheringNonAttendees,
  listMembersAttendance,
  listPushStatus,
  listRecentMembers,
  listTodayGatherings,
} from "@/lib/mcp/queries";
import { sendPush } from "@/lib/mcp/send-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";
import { GTHR_SPRT_TYPES, GTHR_TYPES } from "@/lib/validations/gathering";

/** MCP 도구 응답 도우미 — 사실 payload를 text JSON 으로 감싼다. */
function textResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

/** 안전 에러 응답 — 스택·시크릿·SQL 비노출(스펙 §7). */
function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/**
 * 응답에 실을 상세 URL 의 origin. `create_gathering` 이 만든 벙을 사람이 바로 열어 확인·정정할
 * 수 있게 하는 용도라, 못 구하면 **상대 경로로 물러난다**(URL 하나 때문에 개설을 실패시키지 않는다).
 */
/**
 * 마일리지런 쓰기 뒤 부수효과. **lib 쪽엔 `next/*` 를 넣지 않는다**(MCP 라우트와 서버 액션이
 * 서로 다른 실행 컨텍스트를 갖는 문제가 도메인 모듈로 새어 들어간다) — 여기서 한다.
 *
 * 칭호 평가는 앱의 `logActivity` 와 같이 **응답 밖에서** 돌린다: 기록은 이미 저장됐고
 * 이 경로는 반환값(획득 칭호)을 쓰지 않는다. 획득 사실은 엔진이 보내는 `ttl_grnt` 알림으로 전해진다.
 */
function afterMileageWrite(seeds: TitleEvalSeed[] = []) {
  revalidatePath("/projects");
  for (const seed of seeds) {
    after(() =>
      evaluateAndGrantTitles({ trigger: "mileage_run", ...seed }).catch((e) =>
        console.error("[title-engine] mileage_run(mcp) 평가 실패", e),
      ),
    );
  }
}

async function resolveBaseUrl(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto =
      h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

/**
 * 도구 공통 실행 래퍼(읽기·쓰기 공용). operator ctx(팀 스코프 신원)를 꺼내 service-role
 * 클라이언트를 만들고 본체를 실행한다. team_id 는 ctx 에서만 주입되며 도구 입력으로 받지 않는다.
 * 알려진 입력·미존재 오류(ToolInputError)와 권한 거부(ToolDeniedError)만 메시지를 노출하고,
 * 그 외는 일반 메시지로 마스킹한다.
 *
 * 쓰기 도구도 같은 래퍼를 쓴다 — 예전엔 `send_push` 가 같은 코드를 자기 핸들러에 복제하고
 * 있었고, #496 에서 거부 타입을 바꿀 때 그 복제본을 따로 고쳐야 했다.
 */
async function runTool<T>(
  extra: { authInfo?: { extra?: unknown } },
  fn: (ctx: OperatorContext, supabase: ReturnType<typeof createAdminClient>) => Promise<T>,
) {
  const ctx = (extra.authInfo?.extra as OperatorContext | undefined) ?? null;
  if (!ctx) {
    // withMcpAuth(required)가 미인증을 401로 이미 차단하므로 도달하지 않는 방어선.
    return errorResult("인증 정보를 확인할 수 없습니다.");
  }
  try {
    const supabase = createAdminClient();
    const data = await fn(ctx, supabase);
    return textResult(data);
  } catch (err) {
    // 거부(권한)는 입력 오류보다 먼저 — SendPushDeniedError 도 ToolDeniedError 하위다.
    if (err instanceof ToolDeniedError) return errorResult(err.message);
    if (err instanceof ToolInputError) return errorResult(err.message);
    return errorResult("요청을 처리하지 못했습니다.");
  }
}

/**
 * 기강 운영 MCP — Streamable HTTP 엔드포인트.
 *
 * 라우트 위치가 `app/api/mcp/[transport]/route.ts` 이므로 basePath 는 `/api/mcp`,
 * 클라이언트 접속 URL 은 `/api/mcp/mcp` 이다(mcp-handler 규약: endpoint = basePath + "/mcp").
 *
 * 인증: `withMcpAuth`(required) 가 앞단에서 `Authorization: Bearer <PAT>` 를 검사한다.
 *   토큰 없음/무효/폐기/만료/비활성 멤버 → 401(스펙 §7). 성공 시 operator 컨텍스트를
 *   `AuthInfo.extra` 로 각 도구에 주입한다. 서버 전용 service-role 클라이언트만 사용하며
 *   토큰 해시·시크릿은 어떤 응답에도 노출하지 않는다.
 *
 * 권한: 도구 대부분은 인증된 팀 멤버면 호출할 수 있고, **앱이 관리자에게만 보여주는 것**만
 *   admin 으로 좁힌다(#496) — `send_push`·`list_members_attendance`·`create_gathering` 은
 *   도구째, `get_member_profile` 의 생년월일·성별과 `list_gathering_non_attendees` 의 참석
 *   통계는 필드 단위로. 판정은 전부 `ctx.is_admin` 이며, 게이트는 도구 핸들러가 아니라
 *   **쿼리·발송 함수 안**에 있다(호출부가 늘어도 새지 않게).
 *
 * 도구는 두 갈래다:
 *   - **팀을 들여다보는 것**(운영진 용도) — 조회 6종 + 쓰기 2종(`send_push`·`create_gathering`).
 *   - **내 것**(마일리지런 개인 도구 7종, #497) — 대상 멤버를 인자로 받지 않고 `ctx.mem_id` 로만
 *     스코프한다. admin 이어도 남의 기록에는 손대지 못한다.
 */

/**
 * 활동 기록 도구 3종이 공유하는 배율 인자.
 *
 * **자동으로 붙지 않는다.** 배율마다 성립 조건이 다른데(모임 참석·벙주/참석자·LSD 인원수·
 * 주당 횟수) `evt_mlg_mult_cfg` 에는 그 조건을 적을 칼럼이 없어 서버가 판정할 수 없다.
 * 한때 "그날 걸린 것 전부"를 자동 적용해 혼자 1km 뛴 기록이 최대 90% 부풀려졌다(#504).
 * 앱 폼의 체크박스와 같은 자기신고로 되돌렸다 — 고른 것만 붙는다.
 */
const MULTIPLIERS_ARG = z
  .array(z.string())
  .optional()
  .describe(
    "적용할 배율 이름 배열(list_mileage_multipliers 의 mult_nm). 해당되는 것만 고르세요 — 안 적으면 배율 없이 계산됩니다.",
  );

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "whoami",
      {
        title: "내 신원 확인",
        description:
          "인증된 운영자의 팀 스코프 신원(mem_id, team_id, is_admin, 이름)을 반환하는 health 도구입니다.",
        inputSchema: {},
      },
      async (_args, extra) => {
        const ctx = extra.authInfo?.extra as OperatorContext | undefined;
        if (!ctx) {
          // withMcpAuth(required)가 미인증을 401로 이미 차단하므로 도달하지 않는 방어선.
          return {
            content: [{ type: "text", text: "인증 정보를 확인할 수 없습니다." }],
            isError: true,
          };
        }
        const identity = {
          mem_id: ctx.mem_id,
          team_id: ctx.team_id,
          is_admin: ctx.is_admin,
          mem_nm: ctx.mem_nm,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(identity) }],
        };
      },
    );

    // ── 읽기 도구 6개(SG-04). 모두 인증된 팀 멤버 허용, ctx.team_id 로 자동 스코프. ──

    server.registerTool(
      "list_today_gatherings",
      {
        title: "오늘의 모임",
        description:
          "오늘(또는 지정한 날짜, KST 기준) 우리 팀 모임 목록과 각 모임의 설명(본문)·참석자 수를 반환합니다. 날짜는 YYYY-MM-DD.",
        inputSchema: {
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다.")
            .optional(),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) =>
          listTodayGatherings(supabase, ctx.team_id, args.date),
        ),
    );

    server.registerTool(
      "list_recent_members",
      {
        title: "최근 가입 멤버",
        description:
          "우리 팀에 최근 가입한 멤버 목록을 가입일 최신순으로 반환합니다. 가까운 역·평균 러닝 거리·평균 페이스·가입 목적(가입 온보딩 러닝 프로필) 포함. limit 기본 10.",
        inputSchema: {
          limit: z.number().int().min(1).max(100).optional(),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) =>
          listRecentMembers(supabase, ctx.team_id, args.limit ?? 10),
        ),
    );

    server.registerTool(
      "list_members_attendance",
      {
        title: "멤버 참석 현황",
        description:
          "우리 팀 활성 멤버별 과거 모임 참석 횟수와 마지막 참석시각을 '오래/전혀 안 나온 순'으로 반환합니다. 운영진(admin) 전용입니다. 호출 대상 판단은 사용자가 합니다.",
        inputSchema: {
          limit: z.number().int().min(1).max(500).optional(),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) =>
          listMembersAttendance(supabase, ctx.team_id, ctx.is_admin, args.limit),
        ),
    );

    server.registerTool(
      "get_member_profile",
      {
        title: "멤버 프로필",
        description:
          "우리 팀 멤버 프로필(이름·가입일·역할·상태·소개·아바타, 가까운 역·평균 러닝 거리·평균 페이스·가입 목적)을 조회합니다. member_id(uuid) 또는 name 중 하나로 조회. 생년월일·성별은 운영진(admin)에게만 포함됩니다. 연락처·계좌 정보는 반환하지 않습니다.",
        inputSchema: {
          member_id: z.string().uuid("member_id 는 uuid 여야 합니다.").optional(),
          name: z.string().min(1).optional(),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) =>
          getMemberProfile(supabase, ctx.team_id, ctx.is_admin, {
            memberId: args.member_id,
            name: args.name,
          }),
        ),
    );

    server.registerTool(
      "list_gathering_non_attendees",
      {
        title: "모임 미참석자",
        description:
          "특정 모임에 참석하지 않은 우리 팀 활성 멤버 목록을 반환합니다. gathering_id(uuid) 필요. 각자의 누적 참석 횟수·마지막 참석시각은 운영진(admin)에게만 포함됩니다.",
        inputSchema: {
          gathering_id: z.string().uuid("gathering_id 는 uuid 여야 합니다."),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) =>
          listGatheringNonAttendees(
            supabase,
            ctx.team_id,
            ctx.is_admin,
            args.gathering_id,
          ),
        ),
    );

    server.registerTool(
      "list_push_status",
      {
        title: "푸시 구독 현황",
        description:
          "우리 팀 활성 멤버별 웹푸시 구독 여부를 반환합니다. 미구독 멤버가 먼저 정렬됩니다.",
        inputSchema: {},
      },
      async (_args, extra) =>
        runTool(extra, (ctx, supabase) => listPushStatus(supabase, ctx.team_id)),
    );

    // ── write 도구 2개. 모두 admin 전용 · ctx.team_id 스코프 · 감사 로그 필수. ──

    server.registerTool(
      "send_push",
      {
        title: "멤버에게 알림 발송",
        description:
          "지정한 우리 팀 멤버들에게 인앱 알림과 웹푸시를 발송합니다. 운영진(admin) 전용이며, 교차 팀 발송은 불가합니다. member_ids 는 우리 팀 활성 멤버의 uuid 목록입니다.",
        inputSchema: {
          member_ids: z
            .array(z.string().uuid("member_ids 는 uuid 목록이어야 합니다."))
            .min(1, "최소 1명 이상의 수신자가 필요합니다.")
            .max(500),
          title: z.string().min(1, "제목을 입력하세요.").max(100),
          message: z.string().min(1, "내용을 입력하세요.").max(1000),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) =>
          sendPush(supabase, ctx, {
            memberIds: args.member_ids,
            title: args.title,
            message: args.message,
          }),
        ),
    );

    server.registerTool(
      "create_gathering",
      {
        title: "모임 개설",
        description:
          "우리 팀에 새 모임(벙)을 만듭니다. 운영진(admin) 전용입니다. " +
          "일시는 **한국시간(KST) 기준 'YYYY-MM-DD HH:mm'** 으로 주세요(시간대 표기 없이 — 'Z'나 '+09:00'을 붙이면 거부됩니다). " +
          "만들면 앱에서 만든 것과 똑같이 작성자가 자동 참석되고 팀 전원에게 새 모임 알림이 나갑니다 — 되돌리기 어려우니, " +
          "자연어에서 날짜·장소를 뽑아낸 경우엔 먼저 dry_run=true 로 호출해 해석된 값을 사용자에게 확인받은 뒤 저장하세요. " +
          "team_id 와 작성자는 토큰에서 채워집니다.",
        inputSchema: {
          gthr_nm: z.string().min(1, "제목을 입력하세요.").max(100),
          gthr_type_enm: z.enum(GTHR_TYPES),
          sprt_cd: z.enum(GTHR_SPRT_TYPES),
          stt_at: z.string().min(1, "시작 일시를 입력하세요."),
          end_at: z.string().nullable().optional(),
          loc_txt: z.string().max(200).nullable().optional(),
          desc_txt: z.string().max(2000).nullable().optional(),
          max_prt_cnt: z.number().int().min(1).nullable().optional(),
          dry_run: z
            .boolean()
            .optional()
            .describe("true 면 검증만 하고 저장하지 않습니다(해석된 일시를 확인하는 용도)."),
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const result = await createGatheringViaMcp(supabase, ctx, args, await resolveBaseUrl());
          // 홈 캘린더 캐시(1시간)를 턴다 — 안 하면 MCP 로 만든 모임이 일정탭 새로고침에서
          // 최대 1시간 안 보인다(앱 생성 경로와 같은 함정, KNOWLEDGE.md).
          // 무효화는 **경로 계층인 여기** 몫이다: lib/mcp 의 도메인 코어는 next/* 를 모른다.
          // 라우트 핸들러라 `updateTag`(서버 액션 전용)는 throw 하므로 revalidateTag 를 쓴다.
          if (!args.dry_run) revalidateTag(HOME_CALENDAR_CACHE_TAG, "max");
          return result;
        }),
    );

    // ── 마일리지런 개인 도구 7개(#497). 전부 **본인 스코프** — 대상 멤버를 인자로 받지 않고
    //    ctx.mem_id 로만 스코프한다. admin 이어도 남의 기록에는 손대지 못한다. ──

    server.registerTool(
      "list_my_activities",
      {
        title: "내 마일리지런 기록",
        description:
          "내 마일리지런 활동 로그를 반환합니다(날짜·종목·거리·고도·적용 배율·최종 마일리지·후기). " +
          "date 로 하루, from·to 로 구간을 지정하고, 아무것도 안 주면 이번 달입니다. 남의 기록은 볼 수 없습니다.",
        inputSchema: {
          date: z.string().optional().describe("YYYY-MM-DD (하루만)"),
          from: z.string().optional().describe("YYYY-MM-DD"),
          to: z.string().optional().describe("YYYY-MM-DD"),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) => listMyActivities(supabase, ctx, args)),
    );

    server.registerTool(
      "get_my_mileage",
      {
        title: "내 마일리지 현황",
        description:
          "내 그 달 목표·달성 마일리지·달성 여부·남은 양을 반환합니다. month 는 YYYY-MM, 미지정이면 당월(KST).",
        inputSchema: {
          month: z.string().optional().describe("YYYY-MM (미지정이면 당월)"),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) => getMyMileage(supabase, ctx, args)),
    );

    server.registerTool(
      "list_mileage_multipliers",
      {
        title: "마일리지 배율 목록",
        description:
          "내가 참가 중인 마일리지런의 배율 이벤트 목록을 반환합니다. " +
          "활동 기록을 넣기 전에 이걸로 고를 수 있는 배율 이름을 확인하고, 실제로 해당되는 것만 log_my_activity 의 multipliers 에 적으세요. " +
          "active_only=true 면 오늘 걸려 있는 것만.",
        inputSchema: {
          active_only: z.boolean().optional(),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) => listMileageMultipliers(supabase, ctx, args)),
    );

    server.registerTool(
      "log_my_activity",
      {
        title: "내 활동 기록 등록",
        description:
          "내 마일리지런 활동을 1건 등록합니다. 마일리지는 서버가 계산합니다. " +
          "배율은 조건(모임 참석·벙주 여부·인원수 등)을 서버가 알 수 없어 자동으로 붙지 않습니다 — 해당되는 것만 multipliers 에 이름으로 적어 주세요(앱 폼의 체크박스와 같습니다). " +
          "⚠️ MCP로 넣은 기록은 사진을 붙일 수 없어 기강이야기(깅스타그램)에는 뜨지 않습니다 — 수치·후기는 정상 저장됩니다. 사진까지 올리려면 앱을 쓰세요.",
        inputSchema: {
          act_dt: z.string().describe("YYYY-MM-DD (KST)"),
          sport: z.enum(["RUNNING", "TRAIL", "CYCLING", "SWIMMING"]),
          distance_km: z.number().positive(),
          elevation_m: z.number().min(0).nullable().optional(),
          review: z.string().max(200).nullable().optional(),
          multipliers: MULTIPLIERS_ARG,
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const result = await logMyActivities(supabase, ctx, [args]);
          afterMileageWrite(result.title_eval_seeds);
          return result;
        }),
    );

    server.registerTool(
      "log_my_activities",
      {
        title: "내 활동 기록 몰아서 등록",
        description:
          `내 마일리지런 활동을 한 번에 여러 건 등록합니다(최대 ${MAX_BATCH_ACTIVITIES}건). ` +
          "한 건이라도 검증에 걸리면 아무것도 저장하지 않습니다. 배율은 기록마다 따로 고릅니다(안 적으면 미적용). " +
          "⚠️ 사진은 붙일 수 없어 기강이야기(깅스타그램)에는 뜨지 않습니다.",
        inputSchema: {
          activities: z
            .array(
              z.object({
                act_dt: z.string().describe("YYYY-MM-DD (KST)"),
                sport: z.enum(["RUNNING", "TRAIL", "CYCLING", "SWIMMING"]),
                distance_km: z.number().positive(),
                elevation_m: z.number().min(0).nullable().optional(),
                review: z.string().max(200).nullable().optional(),
                multipliers: MULTIPLIERS_ARG,
              }),
            )
            .min(1)
            .max(MAX_BATCH_ACTIVITIES),
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const result = await logMyActivities(supabase, ctx, args.activities);
          afterMileageWrite(result.title_eval_seeds);
          return result;
        }),
    );

    server.registerTool(
      "update_my_activity",
      {
        title: "내 활동 기록 수정",
        description:
          "내 마일리지런 기록 1건을 고칩니다(오타 정정). act_id 는 list_my_activities 로 얻습니다. " +
          "본인 기록만 수정할 수 있습니다. 마일리지는 수정된 날짜 기준으로 다시 계산됩니다. " +
          "⚠️ act_id 말고는 전부 선택입니다 — **고치려는 것만 보내세요.** 안 준 항목은 기존 값이 그대로 유지됩니다. " +
          "지우려면 명시해야 합니다: review=null(후기 삭제), elevation_m=0(고도 없음), multipliers=[](배율 전부 해제).",
        inputSchema: {
          act_id: z.string().uuid("act_id 는 uuid 여야 합니다."),
          act_dt: z.string().optional().describe("YYYY-MM-DD (KST) — 생략하면 기존 날짜"),
          sport: z.enum(["RUNNING", "TRAIL", "CYCLING", "SWIMMING"]).optional(),
          distance_km: z.number().positive().optional(),
          elevation_m: z.number().min(0).nullable().optional(),
          review: z.string().max(200).nullable().optional(),
          multipliers: MULTIPLIERS_ARG,
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const { act_id, ...rest } = args;
          const result = await updateMyActivity(supabase, ctx, act_id, rest);
          afterMileageWrite();
          return result;
        }),
    );

    server.registerTool(
      "delete_my_activity",
      {
        title: "내 활동 기록 삭제",
        description:
          "내 마일리지런 기록 1건을 지웁니다. 본인 기록만 지울 수 있고, 사진이 붙은 기록은 앱에서 지워야 합니다(사진 파일까지 정리해야 하므로).",
        inputSchema: {
          act_id: z.string().uuid("act_id 는 uuid 여야 합니다."),
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const result = await deleteMyActivity(supabase, ctx, args.act_id);
          afterMileageWrite();
          return result;
        }),
    );
  },
  {
    serverInfo: { name: "gigang-ops-mcp", version: "0.1.0" },
  },
  {
    basePath: "/api/mcp",
    disableSse: true,
    verboseLogs: false,
  },
);

/**
 * Bearer 토큰을 검증해 operator 컨텍스트를 `AuthInfo.extra` 로 실어 반환한다.
 * 검증 실패(토큰 없음 포함)는 `undefined` → withMcpAuth(required)가 401 처리.
 * service-role 클라이언트는 여기(서버)에서만 생성·사용한다.
 */
const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const supabase = createAdminClient();
    const ctx = await resolveOperator(bearerToken, supabase);
    if (!ctx) return undefined;
    return {
      token: bearerToken,
      clientId: ctx.mem_id,
      scopes: ctx.is_admin ? ["operator", "admin"] : ["operator"],
      extra: ctx as unknown as Record<string, unknown>,
    };
  },
  { required: true },
);

export { authHandler as GET, authHandler as POST };
