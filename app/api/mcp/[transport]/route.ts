import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { revalidateTag } from "next/cache";

import { z } from "zod";

import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";
import { KAKAO_MESSAGE_MAX_LENGTH, KAKAO_REQUEST_ID_MAX_LENGTH } from "@/lib/kakao/notify";

import { resolveOperator, type OperatorContext } from "@/lib/mcp/auth";
import { HYROX_RECORD_DIVISIONS } from "@/lib/hyrox";
import {
  REGISTER_ROLES,
  createCompetitionViaMcp,
  listCompetitions,
  registerCompetitionViaMcp,
} from "@/lib/mcp/competition";
import { createGatheringViaMcp } from "@/lib/mcp/create-gathering";
import { updateGatheringViaMcp } from "@/lib/mcp/update-gathering";
import {
  BALANCES_DEFAULT_LIMIT,
  INBOX_DEFAULT_LIMIT,
  INBOX_MAX_LIMIT,
  MAX_CONFIRM_ITEMS,
  MAX_UPLOAD_ROWS,
  MAX_XLSX_BASE64_LENGTH,
  cancelDuesTxn,
  confirmDuesTxns,
  getDuesBalances,
  listDuesInbox,
  reclassifyDuesTxn,
  uploadDuesXlsx,
} from "@/lib/mcp/dues";
import { createSchPostViaMcp } from "@/lib/mcp/create-sch-post";
import { listHyroxCompetitions, listHyroxRankings, logHyroxRecord } from "@/lib/mcp/hyrox";
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
import {
  KAKAO_NOTICE_MAX_MENTIONS,
  sendKakaoNotice,
} from "@/lib/mcp/send-kakao-notice";
import { sendPush } from "@/lib/mcp/send-push";
import { getCachedCmmCdRows } from "@/lib/queries/cmm-cd-cached";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAndGrantTitles } from "@/lib/titles/engine";
import { syncPersonRecordToOtherTeams } from "@/lib/records-revalidate";
import { GTHR_SPRT_TYPES, GTHR_TYPES } from "@/lib/validations/gathering";
import { SCH_POST_TYPES } from "@/lib/validations/schedule";
import { teamCacheTag } from "@/lib/team-cache-tag";
import { TEAM_ID_BY_CD } from "@/lib/constants/gigang-team";
import { teamLinkOrigin } from "@/lib/team-host";
import { getTeamCfg } from "@/lib/team-cfg/read";

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

/**
 * 링크 origin 은 **토큰 팀의 주소**로 만든다. 토큰은 발급한 팀에 묶여 있어, 울산 토큰으로 `gigang.team/api/mcp`
 * 에 붙어도 만든 모임은 울산 것이고 울산 주소에서만 열린다 — 예전처럼 요청 주소로 만들면 링크가 "없는 모임"으로 떨어졌다.
 * 요청 주소가 그 팀 주소면 그대로 쓰고, 아니면 같은 환경의 그 팀 정식 주소(`lib/team-host.ts`).
 */
async function resolveBaseUrl(teamId: string): Promise<string | null> {
  try {
    const teamCd = Object.entries(TEAM_ID_BY_CD).find(([, id]) => id === teamId)?.[0];
    if (!teamCd) return null;
    const h = await headers();
    return teamLinkOrigin(teamCd, h.get("x-forwarded-host") ?? h.get("host"));
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
 * 회비 도구 실행 래퍼 — `runTool` + **회비 기능이 켜진 팀만**(앱의 `withDuesAdmin` 과 같은 경계).
 * 회비를 안 쓰는 팀(울산)의 admin 토큰으로도 회비 데이터를 읽거나 쓰지 못하게 한다.
 * 팀 설정 조회가 실패하면 앱처럼 끈 것으로 본다(`getTeamCfg` 의 실패 시 값).
 */
async function runDuesTool<T>(
  extra: { authInfo?: { extra?: unknown } },
  fn: (ctx: OperatorContext, supabase: ReturnType<typeof createAdminClient>) => Promise<T>,
) {
  return runTool(extra, async (ctx, supabase) => {
    if (!(await getTeamCfg(ctx.team_id, "feature.dues"))) {
      throw new ToolInputError("이 팀은 회비 기능을 쓰지 않아요.");
    }
    return fn(ctx, supabase);
  });
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
 *   admin 으로 좁힌다(#496) — `send_push`·`send_kakao_notice`·`list_members_attendance`·
 *   `create_gathering` 은 도구째, `get_member_profile` 의 생년월일·성별과 `list_gathering_non_attendees` 의 참석
 *   통계는 필드 단위로. 판정은 전부 `ctx.is_admin` 이며, 게이트는 도구 핸들러가 아니라
 *   **쿼리·발송 함수 안**에 있다(호출부가 늘어도 새지 않게).
 *
 * 도구는 두 갈래다:
 *   - **팀을 들여다보는 것**(운영진 용도) — 조회 6종 + 쓰기 4종(`send_push`·`send_kakao_notice`
 *     ·`create_gathering`·`create_sch_post`). `create_sch_post` 만 admin 이 아니다 — 앱에서 소식은 활성 멤버 누구나
 *     올리므로(#630) 그 범위를 그대로 따른다.
 *   - **회비 도구 6종**(#702 — `upload_dues_xlsx`·`list_dues_inbox`·`confirm_dues_txns`·`cancel_dues_txn`·
 *     `reclassify_dues_txn`·`get_dues_balances`) — 전부 admin 전용 + 회비 기능이 켜진 팀만(`runDuesTool`).
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

    // ── write 도구 5개. 모두 ctx.team_id 스코프 · 감사 로그 필수.
    //    send_push·send_kakao_notice·create_gathering 은 admin 전용, update_gathering 은 작성자 또는 admin(#644), create_sch_post 는 앱과 같게 활성 멤버(#630). ──

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
      "send_kakao_notice",
      {
        title: "단톡방 공지",
        description:
          "크루 카카오톡 단톡방에 노티봇으로 공지를 보냅니다. 운영진(admin) 전용입니다. " +
          "방은 고를 수 없고 서버 설정의 크루 단톡방으로만 갑니다. 보내면 되돌릴 수 없고 크루 전원에게 보이니, " +
          "**먼저 dry_run=true 로 불러** 보낼 방·본문을 사용자에게 보여 주고 확인받은 뒤, 응답의 request_id 를 그대로 넣어 실제로 보내세요. " +
          "응답 status 는 sent(허브 접수) / duplicate(같은 request_id 가 이미 접수돼 새로 보내지 않음 — 실패 아님, 다시 보내지 마세요) / " +
          "skipped(이 환경엔 노티봇 미설정) / failed(failure 에 분류) 입니다. " +
          "서버는 재시도하지 않습니다 — failed 를 다시 보낼 땐 반드시 같은 request_id 로 보내야 중복 발송이 안 납니다. " +
          "보낸 공지는 어드민 '카카오 발송 이력'에 'MCP 공지'로 남습니다.",
        inputSchema: {
          message: z
            .string()
            .min(1, "보낼 내용을 입력하세요.")
            .max(KAKAO_MESSAGE_MAX_LENGTH)
            .describe(`보낼 본문(최대 ${KAKAO_MESSAGE_MAX_LENGTH}자). 태그 자리는 '@이름'으로 쓰세요.`),
          mentions: z
            .array(z.string().min(1))
            .max(KAKAO_NOTICE_MAX_MENTIONS)
            .optional()
            .describe(
              "카톡 태그로 부를 사람 이름 목록. 본문의 '@이름' 자리가 태그가 되고, 없으면 맨 앞에 붙습니다. " +
                "단톡방 참여자 한 명으로 정해지지 않는 이름이면 보내지 않고 failed 로 돌아옵니다.",
            ),
          request_id: z
            .string()
            .max(KAKAO_REQUEST_ID_MAX_LENGTH)
            .optional()
            .describe("멱등 키. 같은 값이면 허브가 두 번 보내지 않습니다. 생략하면 서버가 만들어 응답에 싣습니다."),
          dry_run: z
            .boolean()
            .optional()
            .describe("true 면 보내지 않고 보낼 방·본문 미리보기만 돌려줍니다."),
        },
      },
      async (args, extra) =>
        runTool(extra, (ctx, supabase) => sendKakaoNotice(supabase, ctx, args)),
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
          const result = await createGatheringViaMcp(supabase, ctx, args, await resolveBaseUrl(ctx.team_id));
          // 홈 캘린더 캐시(1시간)를 턴다 — 안 하면 MCP 로 만든 모임이 일정탭 새로고침에서
          // 최대 1시간 안 보인다(앱 생성 경로와 같은 함정, KNOWLEDGE.md).
          // 무효화는 **경로 계층인 여기** 몫이다: lib/mcp 의 도메인 코어는 next/* 를 모른다.
          // 라우트 핸들러라 `updateTag`(서버 액션 전용)는 throw 하므로 revalidateTag 를 쓴다.
          if (!args.dry_run) revalidateTag(teamCacheTag(HOME_CALENDAR_CACHE_TAG, ctx.team_id), "max");
          return result;
        }),
    );

    server.registerTool(
      "update_gathering",
      {
        title: "모임 수정",
        description:
          "기존 모임의 이름·일시·장소·정원·본문을 고칩니다. 모임 작성자 또는 운영진(admin)만 실행할 수 있고 우리 팀 모임만 고칠 수 있습니다(지난 모임은 운영진만). " +
          "gathering_id(uuid, list_today_gatherings 로 확인)와 **바꿀 필드만** 주세요 — 안 준 필드는 그대로입니다. " +
          "일시는 **한국시간(KST) 기준 'YYYY-MM-DD HH:mm'** 으로 주세요(시간대 표기 없이). " +
          "dry_run=true 면 저장하지 않고 필드별 전/후(changes)만 돌려주니, 먼저 호출해 사용자에게 확인받은 뒤 저장하세요. " +
          "알림은 기본으로 보내지 않습니다 — notify=true 일 때만 참석자에게 변경 알림(일시·장소가 바뀌면 단톡방 공지 포함)이 나갑니다. " +
          "응답은 바뀐 필드 목록(changed_fields)과 전/후(changes)입니다.",
        inputSchema: {
          gathering_id: z.string().uuid("gathering_id 는 uuid 여야 합니다."),
          gthr_nm: z.string().min(1, "제목을 입력하세요.").max(100).optional(),
          stt_at: z.string().min(1, "시작 일시를 입력하세요.").optional(),
          end_at: z.string().nullable().optional().describe("null 이면 종료 일시를 지웁니다."),
          loc_txt: z.string().max(200).optional(),
          max_prt_cnt: z.number().int().min(1).nullable().optional().describe("null 이면 정원 제한을 없앱니다."),
          desc_txt: z.string().max(2000).nullable().optional().describe("모임 본문(설명). null 이면 비웁니다."),
          dry_run: z.boolean().optional().describe("true 면 저장하지 않고 전/후 비교만 돌려줍니다."),
          notify: z
            .boolean()
            .optional()
            .describe("true 일 때만 참석자 변경 알림을 보냅니다. 기본 false."),
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const result = await updateGatheringViaMcp(supabase, ctx, args, await resolveBaseUrl(ctx.team_id));
          // 홈 캘린더 캐시와 모임 상세를 턴다(create_gathering 과 같은 이유). 바뀐 게 없으면 안 턴다.
          if (!args.dry_run && result.changed_fields.length > 0) {
            revalidateTag(teamCacheTag(HOME_CALENDAR_CACHE_TAG, ctx.team_id), "max");
            revalidatePath(`/gatherings/${args.gathering_id}`);
          }
          return result;
        }),
    );

    server.registerTool(
      "create_sch_post",
      {
        title: "일정 소식 등록",
        description:
          "우리 팀 일정 탭에 소식(대회 접수 정보·판매·세션·일반)을 올립니다. 앱과 같이 활성 멤버면 누구나 쓸 수 있습니다. " +
          "일시는 **한국시간(KST) 기준 'YYYY-MM-DD HH:mm'** 으로 주세요(시간대 표기 없이 — 'Z'나 '+09:00'을 붙이면 거부됩니다). " +
          "올리면 앱에서 올린 것과 똑같이 팀 전원에게 새 정보 알림이 나갑니다 — 되돌리기 어려우니, " +
          "자연어에서 날짜를 뽑아낸 경우엔 먼저 dry_run=true 로 호출해 해석된 일시·유형을 사용자에게 확인받은 뒤 저장하세요. " +
          "team_id 와 작성자는 토큰에서 채워집니다.",
        inputSchema: {
          sch_nm: z.string().min(1, "제목을 입력하세요.").max(100),
          post_type: z
            .enum(SCH_POST_TYPES)
            .describe("race_entry(대회 접수) | sale(판매) | session(세션) | general(일반)"),
          evt_stt_at: z.string().min(1, "시작 일시를 입력하세요."),
          evt_end_at: z.string().nullable().optional(),
          url: z.string().nullable().optional(),
          cont_txt: z.string().max(1000).nullable().optional(),
          dry_run: z
            .boolean()
            .optional()
            .describe("true 면 검증만 하고 저장하지 않습니다(해석된 일시를 확인하는 용도)."),
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const result = await createSchPostViaMcp(supabase, ctx, args, await resolveBaseUrl(ctx.team_id));
          // 홈 캘린더 캐시를 턴다(create_gathering 과 같은 이유) — DB 웹훅(`/api/revalidate`)도
          // sch_post_mst 를 보지만, 도구 응답을 받고 바로 일정 탭을 여는 사람에게 늦지 않게.
          if (!args.dry_run) revalidateTag(teamCacheTag(HOME_CALENDAR_CACHE_TAG, ctx.team_id), "max");
          return result;
        }),
    );

    // ── 대회 도구 3개(#700). 조회·신청은 멤버(신청은 본인 것만), 대회 추가는 admin 전용.
    //    팀 알림·단톡 공지는 보내지 않는다(웹과 같다). ──

    server.registerTool(
      "list_competitions",
      {
        title: "대회 찾기",
        description:
          "대회를 이름 일부·시작일 기간·종목(sport)으로 찾습니다(시작일 최신순 최대 50건). " +
          "comp_id·종목(event_types)·내 신청 상태(my_registration)가 실립니다 — create_competition 전에 같은 대회가 이미 있는지, " +
          "register_competition 에 넣을 comp_id 를 고르는 용도입니다.",
        inputSchema: {
          query: z.string().max(50).optional().describe("대회명 일부"),
          from: z.string().optional().describe("이 날짜(YYYY-MM-DD) 이후 시작"),
          to: z.string().optional().describe("이 날짜(YYYY-MM-DD)까지 시작"),
          sport: z.string().max(30).optional().describe("종목 코드(COMP_SPRT_CD, 예: road_run·triathlon·hyrox)"),
        },
      },
      async (args, extra) => runTool(extra, (ctx, supabase) => listCompetitions(supabase, ctx, args)),
    );

    server.registerTool(
      "create_competition",
      {
        title: "대회 추가",
        description:
          "대회를 새로 등록합니다(관리자 대회 등록 폼과 같은 필드·검증). 운영진(admin) 전용입니다. " +
          "같은 이름·시작일 대회가 이미 있으면 만들지 않고 기존 것을 돌려줍니다(status=exists). " +
          "날짜는 YYYY-MM-DD, 지난 대회는 거부됩니다(기록 입력에서 추가). sport 는 종목 공통코드, event_types 는 코스(영문·숫자, 1개 이상). " +
          "먼저 dry_run=true 로 불러 해석된 값을 사용자에게 확인받은 뒤 저장하세요. 팀 알림·단톡 공지는 보내지 않습니다. " +
          "수정·삭제 도구는 없습니다 — 잘못 만들었으면 comp_url 로 들어가 웹에서 고치세요.",
        inputSchema: {
          title: z.string().min(1, "대회명을 입력하세요.").max(200),
          sport: z.string().min(1, "종목을 입력하세요.").max(30).describe("COMP_SPRT_CD 코드값"),
          start_date: z.string().min(1).describe("시작일 YYYY-MM-DD"),
          end_date: z.string().nullable().optional().describe("종료일 YYYY-MM-DD(하루짜리면 생략)"),
          location: z.string().min(1, "장소를 입력하세요.").max(200),
          event_types: z.array(z.string().min(1)).min(1, "코스를 1개 이상 입력하세요.").max(20),
          source_url: z.string().min(1, "공식 URL 을 입력하세요.").max(500),
          dry_run: z.boolean().optional().describe("true 면 검증·중복 확인만 하고 저장하지 않습니다."),
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const cmmRows = await getCachedCmmCdRows();
          const result = await createCompetitionViaMcp(supabase, ctx, args, cmmRows, await resolveBaseUrl(ctx.team_id));
          // 웹 `createCompetition` 과 같은 무효화 — 대회 원본 캐시
          if (result.status === "created") revalidateTag("competitions", "max");
          return result;
        }),
    );

    server.registerTool(
      "register_competition",
      {
        title: "대회 참가 신청",
        description:
          "대회 참가 신청을 합니다 — 기본은 **내** 신청이고, 운영진(admin)만 member_id 또는 member_name 으로 다른 회원을 대신 신청할 수 있습니다" +
          "(이름이 여럿에 맞으면 등록하지 않고 candidates 만 돌려줍니다 — member_id 로 다시 부르세요. 대상은 우리 팀 활동 회원, 알림은 가지 않습니다). role 은 participant(참가, 기본)·cheering(응원)·volunteer(봉사). " +
          "participant 는 event_type(코스, 예: FULL·HALF·10K)이 필수이고 대회에 없는 코스면 웹처럼 대회에 붙습니다. " +
          "이미 신청돼 있으면 바꾸지 않고 현재 상태를 돌려줍니다(status=already_registered). " +
          "comp_id 는 list_competitions 로 확인하세요. 먼저 dry_run=true 로 불러 확인받은 뒤 신청하세요. 팀 알림·단톡 공지는 보내지 않습니다.",
        inputSchema: {
          comp_id: z.string().uuid("comp_id 는 uuid 여야 합니다."),
          role: z.enum(REGISTER_ROLES).optional().describe("participant(기본) | cheering | volunteer"),
          event_type: z.string().max(50).nullable().optional().describe("참가 코스(participant 일 때 필수)"),
          member_id: z.string().uuid().optional().describe("대신 신청할 회원 uuid(admin). 안 주면 내 신청"),
          member_name: z.string().max(50).optional().describe("대신 신청할 회원 이름(admin, 완전일치). 동명이인이면 등록 안 하고 후보만 반환"),
          dry_run: z.boolean().optional().describe("true 면 신청하지 않고 결과만 미리 봅니다."),
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const result = await registerCompetitionViaMcp(supabase, ctx, args);
          if (result.status === "registered") {
            // 웹 신청 뒤 `revalidateTeamCompetitionPlans` 와 같다 — 이 팀의 일정·피드 캐시만
            revalidateTag(teamCacheTag(HOME_CALENDAR_CACHE_TAG, ctx.team_id), "max");
            revalidateTag(teamCacheTag("story-feed", ctx.team_id), "max");
          }
          return result;
        }),
    );

    // ── 하이록스 도구 3개(#349). 조회는 멤버 누구나(전당·대회 목록은 앱에서도 공개),
    //    등록은 본인 기록 — member_id 로 남의 기록을 넣는 건 admin 만(앱의 「대신 등록」과 같은 범위). ──

    server.registerTool(
      "list_hyrox_rankings",
      {
        title: "하이록스 랭킹",
        description:
          "전당(랭킹 탭) 하이록스 순위를 돌려줍니다 — 부문(OPEN 오픈·DOUBLES 더블스)마다 사람당 가장 빠른 대회 기록 하나. " +
          "오픈은 남자(men)/여자(women)로 나뉘고 더블스는 한 줄(entries)입니다. 릴레이는 순위가 없고, 프로 부문은 받지 않습니다(싱글은 전부 오픈). " +
          "각 줄에 입력된 스테이션 기록(splits, 'M:SS')이 실립니다.",
        inputSchema: {
          division: z.enum(["OPEN", "DOUBLES"]).optional().describe("한 부문만 볼 때"),
          gender: z.enum(["male", "female"]).optional().describe("오픈에서 한쪽 성별만 볼 때"),
        },
      },
      async (args, extra) => runTool(extra, (ctx, supabase) => listHyroxRankings(supabase, ctx, args)),
    );

    server.registerTool(
      "list_hyrox_competitions",
      {
        title: "하이록스 대회 목록",
        description:
          "하이록스 대회를 최근 시작일부터 돌려줍니다(최대 50건) — log_hyrox_record 에 넣을 comp_id 를 고르는 용도입니다. " +
          "찾는 대회가 없으면 앱(일정·대회)에서 대회를 먼저 등록해야 합니다(MCP 로는 대회를 만들지 않습니다).",
        inputSchema: {
          query: z.string().max(50).optional().describe("대회명 일부"),
          from: z.string().optional().describe("이 날짜(YYYY-MM-DD) 이후 시작"),
          to: z.string().optional().describe("이 날짜(YYYY-MM-DD)까지 시작"),
        },
      },
      async (args, extra) => runTool(extra, (_ctx, supabase) => listHyroxCompetitions(supabase, args)),
    );

    server.registerTool(
      "log_hyrox_record",
      {
        title: "하이록스 기록 등록",
        description:
          "하이록스 대회 기록 1건을 등록합니다. 기본은 **내 기록**이고, member_id 로 다른 회원의 기록을 넣는 건 운영진(admin)만 됩니다. " +
          "comp_id 는 list_hyrox_competitions 로 확인하세요. total_time 은 'H:MM:SS'(예: 1:12:34), " +
          "splits 는 스테이션별 'M:SS'(선택 — SKIERG·SLED_PUSH·SLED_PULL·BURPEE·ROW·FARMERS_CARRY·LUNGE·WALL_BALL). " +
          "기록증·메시지에서 숫자를 뽑아낸 경우엔 먼저 dry_run=true 로 불러 해석된 값을 사용자에게 확인받은 뒤 저장하세요. " +
          "수정·삭제 도구는 없습니다 — 잘못 넣었으면 앱 프로필탭에서 고치세요.",
        inputSchema: {
          comp_id: z.string().uuid("comp_id 는 uuid 여야 합니다."),
          division: z.enum(HYROX_RECORD_DIVISIONS).describe("OPEN | DOUBLES | RELAY(릴레이는 저장만, 순위 없음). 프로 부문은 없다 — 싱글은 OPEN"),
          total_time: z.string().min(1, "total_time 을 입력하세요."),
          splits: z
            .record(z.string(), z.string().nullable())
            .optional()
            .describe("스테이션 코드 → 'M:SS'. 모르는 칸은 빼세요."),
          race_dt: z.string().optional().describe("여러 날짜 대회에서 뛴 날(YYYY-MM-DD). 기본은 대회 시작일"),
          member_id: z.string().uuid().optional().describe("다른 회원 기록을 넣을 때만(admin)"),
          dry_run: z.boolean().optional().describe("true 면 검증만 하고 저장하지 않습니다."),
        },
      },
      async (args, extra) =>
        runTool(extra, async (ctx, supabase) => {
          const { team_mem_id: teamMemId, should_invalidate: shouldInvalidate, ...result } =
            await logHyroxRecord(supabase, ctx, args);
          if (result.saved) {
            if (shouldInvalidate) revalidateTag(`records:${ctx.team_id}`, "max");
            // 칭호 평가는 앱의 기록 저장과 같은 트리거 — 응답 밖에서 돌린다(획득은 ttl_grnt 알림으로 전해진다)
            after(() =>
              evaluateAndGrantTitles({ trigger: "race_record", teamId: ctx.team_id, teamMemId }).catch((e) =>
                console.error("[title-engine] race_record(mcp) 평가 실패", e),
              ),
            );
            // 기록은 사람 것 — 그 사람이 속한 다른 팀 전당·칭호에도 반영
            after(() =>
              syncPersonRecordToOtherTeams(result.member.mem_id, ctx.team_id, { evaluateTitles: true }),
            );
          }
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
          "⚠️ MCP로 넣은 기록은 사진을 붙일 수 없어 홈 사진 지면(기강은 깅스타그램)에는 뜨지 않습니다 — 수치·후기는 정상 저장됩니다. 사진까지 올리려면 앱을 쓰세요.",
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
          "⚠️ 사진은 붙일 수 없어 홈 사진 지면(기강은 깅스타그램)에는 뜨지 않습니다.",
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
          // 수정으로 목표를 넘기는 경우가 있다(오늘 입력한 값을 고쳐 달성) — 등록과 같이 평가한다
          afterMileageWrite(result.title_eval_seeds);
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
    // ── 회비 도구 6개(#702). 전부 admin 전용 · 회비 기능이 켜진 팀만 · 쓰기는 dry_run 지원 · 감사행 필수.
    //    도메인 규칙은 앱 서버 액션과 같은 코어(`lib/dues/*-core.ts`)를 부른다. 입금자명·금액은 로그에 남기지 않는다. ──

    server.registerTool(
      "upload_dues_xlsx",
      {
        title: "회비 거래내역 업로드",
        description:
          "카카오뱅크 거래내역을 **미확정 거래로 적재**합니다(확정은 하지 않습니다). 운영진(admin) 전용. " +
          "입력은 xlsx_base64(복호화된 엑셀 파일 base64)와 rows(거래 행 JSON) 중 **정확히 하나**입니다. " +
          "같은 파일·같은 행 묶음을 두 번 올려도, 이미 적재된 거래가 섞여 있어도 중복 적재되지 않고 요약의 skipped 로 셉니다. " +
          "이미 마감된 회원의 과거 거래는 skippedByCutoff 로 건너뜁니다. " +
          "응답 summary: total(읽은 행) · autoDone(자동 확정 후보) · needsReview(확인필요) · excluded(제외·지출) · skipped(중복) · skippedByCutoff. " +
          "**먼저 dry_run=true 로 불러** 무엇이 새로 들어가는지 확인한 뒤 실제로 올리세요. 다음 단계는 list_dues_inbox.",
        inputSchema: {
          file_name: z.string().min(1).max(200).describe("업로드 이력에 남길 파일 이름(예: 2026-11.xlsx)"),
          xlsx_base64: z.string().min(1).max(MAX_XLSX_BASE64_LENGTH).optional().describe("거래내역 엑셀 파일을 base64 로 인코딩한 값"),
          rows: z
            .array(
              z.object({
                txn_dt: z.string().describe("거래일 YYYY-MM-DD"),
                txn_tm: z.string().describe("거래 시각 HH:mm:ss(KST) — 필수(중복 방지 키)"),
                amount: z.number().int().positive().describe("금액(원, 양수)"),
                io: z.enum(["deposit", "withdrawal"]).describe("deposit=입금, withdrawal=출금"),
                name: z.string().min(1).describe("거래 내용(입금자명)"),
                memo: z.string().nullable().optional(),
                txn_tp: z.string().nullable().optional().describe("거래구분(예: 예금이자). 이자·타행자동이체는 기타로 분류됩니다."),
              }),
            )
            .max(MAX_UPLOAD_ROWS)
            .optional()
            .describe("엑셀 대신 거래 행을 직접 넘길 때"),
          dry_run: z.boolean().optional().describe("true 면 적재하지 않고 요약만 계산합니다."),
        },
      },
      async (args, extra) =>
        runDuesTool(extra, (ctx, supabase) =>
          uploadDuesXlsx(supabase, ctx, {
            fileName: args.file_name,
            xlsxBase64: args.xlsx_base64,
            rows: args.rows,
            dryRun: args.dry_run,
          }),
        ),
    );

    server.registerTool(
      "list_dues_inbox",
      {
        title: "회비 처리 대기 목록",
        description:
          "미확정(처리 대기) 회비 거래 목록입니다. 운영진(admin) 전용. 앱 「회비 > 처리」와 같은 3버킷으로 나눕니다: " +
          "autoDone(이름이 한 회원에게 정확히 맞는 회비 입금) · needsReview(미매칭·동명이인·프로젝트 후보 — 사람이 분류를 정해야 함) · excluded(출금·기타). " +
          "auto_eligible=true 인 건만 confirm_dues_txns 의 auto 로 일괄 확정됩니다(금액이 월회비 배수가 아니면 자동에서 빠집니다). " +
          "확인필요 건에는 후보 회원(candidates)이 붙고, 응답 머리에 확정에 쓸 분류 코드(fee_items)와 모금 중 프로젝트(projects)가 실립니다. " +
          "입금자명·금액이 들어 있으니 필요한 만큼만 사용자에게 보여 주세요.",
        inputSchema: {
          bucket: z.enum(["autoDone", "needsReview", "excluded"]).optional().describe("한 버킷만 보고 싶을 때"),
          limit: z.number().int().min(1).max(INBOX_MAX_LIMIT).optional().describe(`기본 ${INBOX_DEFAULT_LIMIT}`),
        },
      },
      async (args, extra) =>
        runDuesTool(extra, (ctx, supabase) => listDuesInbox(supabase, ctx, { bucket: args.bucket, limit: args.limit })),
    );

    server.registerTool(
      "confirm_dues_txns",
      {
        title: "회비 거래 확정",
        description:
          "처리 대기 거래를 확정합니다. 운영진(admin) 전용. 회비(due)+회원이면 납부원장이 만들어지고 그 회원 잔액이 다시 계산됩니다. " +
          "**확인필요 건은 items 에 txn_id 와 fee_item_cd 를 명시해야만 확정됩니다.** auto=true 는 자동 후보(list_dues_inbox 의 auto_eligible)만 더합니다. " +
          "분류: 회비 due(mem_id 필수) · 프로젝트 event_fee(project_id 필수) · 지출 expense(출금) · 제외 other. 출금을 회비·프로젝트로, 입금을 지출로 확정할 수는 없습니다. " +
          "mem_id 는 이 팀 회원 uuid 입니다(후보는 candidates, 그 밖은 get_member_profile 로 찾으세요). remember_alias=true 면 입금자명을 그 회원의 별칭으로 기억해 다음 업로드부터 자동 매칭합니다. " +
          "검증을 못 넘은 건은 skipped 에 사유와 함께 남고 나머지는 진행됩니다. **먼저 dry_run=true 로 불러** 확정될 건과 skipped 사유를 확인하세요.",
        inputSchema: {
          items: z
            .array(
              z.object({
                txn_id: z.string().uuid(),
                fee_item_cd: z.string().min(1).optional().describe("분류 코드(due·event_fee·expense·other·…). 확인필요 건은 필수"),
                mem_id: z.string().uuid().optional().describe("납부·관련 회원. 안 주면 저장된 매칭 유지(매칭을 지우는 기능은 없습니다)"),
                project_id: z.string().uuid().optional().describe("event_fee 일 때 귀속 프로젝트(list_dues_inbox.projects)"),
                remember_alias: z.boolean().optional(),
              }),
            )
            .max(MAX_CONFIRM_ITEMS)
            .optional(),
          auto: z.boolean().optional().describe("true 면 자동 확정 후보를 전부 더합니다."),
          dry_run: z.boolean().optional().describe("true 면 확정하지 않고 결과만 미리 봅니다."),
        },
      },
      async (args, extra) =>
        runDuesTool(extra, (ctx, supabase) =>
          confirmDuesTxns(supabase, ctx, { items: args.items, auto: args.auto, dryRun: args.dry_run }),
        ),
    );

    server.registerTool(
      "cancel_dues_txn",
      {
        title: "회비 거래 확정 취소",
        description:
          "확정된 거래 1건을 처리 대기로 되돌립니다(납부원장 취소 + 그 회원 잔액 재계산). 운영진(admin) 전용. " +
          "원장 전환 이전 개시잔액에 포함된 거래는 취소할 수 없습니다(거부 사유가 응답에 담깁니다). 먼저 dry_run=true 로 가능 여부를 확인하세요.",
        inputSchema: {
          txn_id: z.string().uuid(),
          dry_run: z.boolean().optional(),
        },
      },
      async (args, extra) =>
        runDuesTool(extra, (ctx, supabase) => cancelDuesTxn(supabase, ctx, { txnId: args.txn_id, dryRun: args.dry_run })),
    );

    server.registerTool(
      "reclassify_dues_txn",
      {
        title: "회비 거래 재분류",
        description:
          "이미 확정된 거래의 분류·회원·프로젝트를 바꿉니다(확정 취소 → 새 값으로 재확정, 영향받은 회원 잔액 재계산). 운영진(admin) 전용. " +
          "취소 가능 여부와 새 값을 먼저 둘 다 검증하고, 재확정이 실패하면 원래 값으로 되돌려 둡니다. 같은 값으로는 바꿀 수 없습니다. " +
          "분류 규칙은 confirm_dues_txns 와 같습니다(회비=mem_id 필수, 프로젝트=project_id 필수). 먼저 dry_run=true 로 from→to 를 확인하세요.",
        inputSchema: {
          txn_id: z.string().uuid(),
          fee_item_cd: z.string().min(1),
          mem_id: z.string().uuid().optional(),
          project_id: z.string().uuid().optional(),
          remember_alias: z.boolean().optional(),
          dry_run: z.boolean().optional(),
        },
      },
      async (args, extra) =>
        runDuesTool(extra, (ctx, supabase) =>
          reclassifyDuesTxn(supabase, ctx, {
            txnId: args.txn_id,
            feeItemCd: args.fee_item_cd,
            memId: args.mem_id,
            projectId: args.project_id,
            rememberAlias: args.remember_alias,
            dryRun: args.dry_run,
          }),
        ),
    );

    server.registerTool(
      "get_dues_balances",
      {
        title: "회원 회비 예치·미납 현황",
        description:
          "활성 회원의 회비 잔액 현황입니다. 운영진(admin) 전용. balance 음수=미납, 양수=예치이고 months 는 월회비 단위 환산(내림)입니다. " +
          "미납이 큰 순으로 정렬되며 summary 에 인원·합계가 담깁니다. 잔액은 앱 회비 원장(스냅샷)과 같은 값입니다 — 통장 잔액과의 대조는 별도입니다.",
        inputSchema: {
          status: z.enum(["미납", "정상", "예치"]).optional(),
          limit: z.number().int().min(1).max(500).optional().describe(`기본 ${BALANCES_DEFAULT_LIMIT}`),
        },
      },
      async (args, extra) =>
        runDuesTool(extra, (ctx, supabase) => getDuesBalances(supabase, ctx, { status: args.status, limit: args.limit })),
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
