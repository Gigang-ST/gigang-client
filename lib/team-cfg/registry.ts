import { z } from "zod";

import { parseEventTime } from "@/lib/dayjs";

/**
 * 팀 설정 사전 — `team_cfg` 에 들어갈 수 있는 키의 **정본**.
 *
 * DB(`team_cfg`)엔 값만 살고, 키의 형식·기본값·설명은 여기 한 곳에 둔다. 새 설정은 그걸 읽는 코드가
 * 있어야 의미가 있으므로 정의도 코드에 둔다(DB 에 따로 두면 두 군데가 어긋난다).
 *
 * 규칙
 * - **행이 없으면 `default`.** 대부분의 키는 default 가 "지금 기강 동작"이라 기강은 행 0개로 그대로 돈다.
 * - **값이 형식에 안 맞으면 `default` + 경고 로그.** 잘못 넣어도 화면이 깨지지 않는다.
 * - **값은 의미로 저장한다.** 폰트면 `"명조"` 같은 선택지, 기간이면 개월 수 — CSS·구현 세부를 넣지 않는다.
 * - **분기는 기능 입구에서 한 번.** 화면 컴포넌트가 "어느 팀인지"를 몰라도 되게 한다.
 * - `visibility`: `server` 는 서버만 읽는다(브라우저로 내보내지 않는다).
 *
 * 테이블·이력 규칙은 `supabase/migrations/20261109120000_team_cfg.sql`, 읽기는 `./read.ts`.
 */

/**
 * 관리자 「팀 설정」 화면(`/admin/team-settings`)이 묶는 칸. 화면은 이 사전을 보고 그리므로,
 * **키를 사전에 더하면 모든 팀의 설정 화면에 저절로 올라온다**(팀마다 빈 행을 미리 넣을 필요가 없다).
 */
export type CfgGroup = "feature" | "member_info" | "operation" | "brand";

/**
 * 입력칸 모양. `secret` 은 지금 값을 화면에 내보내지 않고(설정됨/안 됨만) 새 값 입력만 받는다.
 * 새 모양이 필요하면 여기와 `app/(info)/admin/team-settings/team-settings-client.tsx` 의 편집기를 같이 늘린다.
 */
export type CfgInput =
  | { kind: "boolean" }
  | { kind: "text"; placeholder?: string }
  | { kind: "secret"; placeholder?: string }
  | { kind: "bank" }
  | { kind: "channels" }
  | { kind: "regular_template" }
  | { kind: "team_links" };

type CfgDef<S extends z.ZodTypeAny> = {
  schema: S;
  default: z.infer<S>;
  /** 사람이 읽는 이름 — 관리자 「팀 설정」 화면이 이걸로 입력칸을 그린다 */
  label: string;
  description: string;
  visibility: "server" | "member" | "public";
  group: CfgGroup;
  input: CfgInput;
  /** 관리자 설정 화면에 올리지 않는다 — 거의 안 바꾸는 값이라 코드·마이그레이션으로 관리한다 */
  hidden?: boolean;
  /**
   * 설정을 **못 읽었을 때**(DB 오류) 쓸 값. 없으면 `default`.
   * 기본값이 '없음'인 키는 그대로 안전하지만, 기본값이 '켬'인 키는 실패 순간 그 기능을 꺼 둔 팀(울산)에서도
   * 켜진다 — 그런 키는 여기에 보수적인 값(끔)을 준다. 기강도 그 순간엔 꺼지지만 잠깐이고 다른 팀으로 새지 않는다.
   */
  onReadError?: z.infer<S>;
  /**
   * **owner 만** 바꾼다 — 돈·공지가 걸린 값(계좌·카톡방). 관리자 누구나 바꾸면 계좌가 바뀌어도 아무도 모른다.
   * 바뀌면 그 팀 owner·관리자에게 알림이 간다(`app/actions/admin/team-settings.ts`). 2026-11-10 유저 결정.
   */
  ownerOnly?: boolean;
};

function defineCfg<S extends z.ZodTypeAny>(def: CfgDef<S>): CfgDef<S> {
  return def;
}

/**
 * 채널 주소 — http(s) 만. `z.string().url()` 은 `javascript:` 같은 주소도 통과시켜, 관리자가 넣은 값이
 * 회원 화면의 링크(`<a href>`)로 그대로 나가면 누르는 순간 스크립트가 돈다. 길이도 묶는다.
 */
const channelUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "http:// 또는 https:// 로 시작하는 주소만 넣을 수 있어요");

/** 날짜 하나(YYYY-MM-DD). 형식만 보면 `2026-02-30` 같은 없는 날도 통과해 화면에 3월 2일로 찍힌다 — 되읽어 같아야 한다 */
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "2024-04-23 처럼 넣어 주세요")
  .refine((v) => parseEventTime(v).format("YYYY-MM-DD") === v, "없는 날짜예요");

export const TEAM_CFG_REGISTRY = {
  /**
   * 카톡 공지방(노티봇 허브의 방 고정 ID). **기본값이 없다** — 비어 있으면 그 팀은 카톡 공지를 보내지 않는다.
   * 다른 키처럼 "기강 동작"을 기본으로 두면 다른 팀 공지가 기강 단톡방으로 샌다(예전 환경변수 방식의 구멍).
   * API 키는 비밀값이라 여기 두지 않고 환경변수(`KAKAO_SERVICE_API_KEY`)에 남는다 — 방 ID 만으로는 보낼 수 없다.
   */
  "kakao.room_id": defineCfg({
    schema: z.string().trim().min(1).nullable(),
    default: null,
    label: "카톡 공지방 ID",
    description: "노티봇 허브 콘솔의 방 고정 ID. 비우면 이 팀은 단톡방 공지를 보내지 않아요.",
    visibility: "server",
    group: "operation",
    input: { kind: "secret", placeholder: "노티봇 허브의 방 고정 ID" },
    ownerOnly: true,
  }),

  /**
   * 모임 계좌(회비·프로젝트 입금 안내). **기본값이 없다** — 비어 있으면 계좌 안내를 그리지 않는다.
   * 기본값을 기강 계좌로 두면 다른 팀 회원이 기강 계좌로 돈을 보낸다.
   * 번호는 화면에 보이는 형식(하이픈 포함)으로 넣는다 — 복사할 땐 숫자만 뽑는다.
   */
  "bank.team_account": defineCfg({
    schema: z
      .object({
        bank: z.string().trim().min(1),
        number: z.string().trim().min(1),
        holder: z.string().trim().min(1),
      })
      .nullable(),
    default: null,
    label: "모임 계좌",
    description: "회비·프로젝트 입금 안내에 보이는 계좌. 비우면 계좌 안내가 안 보여요.",
    visibility: "member",
    group: "member_info",
    input: { kind: "bank" },
    ownerOnly: true,
  }),

  /**
   * 팀 채널(오픈채팅·인스타·소모임·가민) 주소. **기본값이 없다** — 없는 채널은 칸째 안 그린다.
   * 다른 키처럼 기강 값을 기본으로 두면 다른 팀 화면에 기강 채널이 뜬다.
   */
  "social.channels": defineCfg({
    schema: z.object({
      kakao_open_chat: channelUrl.optional(),
      instagram: channelUrl.optional(),
      somoim: channelUrl.optional(),
      garmin: channelUrl.optional(),
    }),
    default: {},
    label: "팀 채널",
    description: "오픈채팅·인스타·소모임·가민 주소. 비운 채널은 화면에 안 보여요.",
    visibility: "public",
    group: "member_info",
    input: { kind: "channels" },
  }),

  /**
   * 오픈채팅 비밀번호 — 그 팀 회원에게만 보인다(서버가 회원 여부를 다시 판정한다). 비밀값이라 `server`.
   * 기본값 없음. ⚠️ 기강은 이 행을 넣기 전까지 예전 환경변수(`KAKAO_CHAT_PASSWORD`)로 동작한다(전환용 —
   * `lib/team-social.ts`). 행을 넣은 뒤 환경변수와 그 분기를 지운다(runbook).
   */
  "social.kakao_open_chat_password": defineCfg({
    schema: z.string().trim().min(1).nullable(),
    default: null,
    label: "오픈채팅 비밀번호",
    description: "그 팀 회원에게만 보여요. 비우면 비밀번호 안내가 안 보여요.",
    visibility: "server",
    group: "member_info",
    input: { kind: "secret", placeholder: "오픈채팅 비밀번호" },
  }),


  /**
   * 워드마크 — 모임 공유 이미지(OG) 맨 아래에 찍는 팀 글자. **기본값이 없다** — 비어 있으면 글자 줄을 안 그린다.
   * 기본값을 `GIGANG` 으로 두면 울산 모임 공유 카드에 기강 글자가 찍힌다.
   */
  "brand.wordmark": defineCfg({
    schema: z.string().trim().min(1).max(30).nullable(),
    default: null,
    label: "워드마크",
    description: "모임 공유 이미지 아래에 찍히는 팀 글자(예: GIGANG). 비우면 안 보여요.",
    visibility: "public",
    group: "brand",
    input: { kind: "text", placeholder: "예: GIGANG" },
  }),

  /**
   * 슬로건 — 일정 탭 헤더 가운데(큰 글자)와 모임 공유 이미지(OG) 맨 위에 찍는다. **기본값이 없다** — 비어 있으면
   * 그 줄을 안 그린다. 기본값을 기강 문구로 두면 울산 화면·공유 카드에 기강 슬로건이 뜬다.
   * 예전엔 `components/home/header-slogan.tsx`·`lib/gathering-og.ts` 에 기강 문구가 박혀 있었다(2026-11-10 데이터로 옮김).
   * 헤더 가운데 폭(224px)에 13px 굵은 대문자로 들어가야 해서 짧게 묶는다 — 넘치면 화면이 `…` 로 자른다.
   */
  "brand.slogan": defineCfg({
    schema: z.string().trim().min(1).max(24).nullable(),
    default: null,
    label: "슬로건",
    description: "일정 탭 맨 위와 모임 공유 이미지에 대문자로 찍히는 한 줄(24자까지). 비우면 안 보여요.",
    visibility: "public",
    group: "brand",
    input: { kind: "text", placeholder: "예: No time to be weak" },
  }),

  /**
   * 창설일 — 일정 탭 헤더 슬로건 위 작은 글자 「Since 2024.04.23」. **기본값이 없다**(비어 있으면 안 그린다).
   * 아직 안 온 날(울산 2026-11-28)이어도 그대로 찍는다 — 창설 예정일도 그 크루의 시작일이다.
   */
  "brand.founded_dt": defineCfg({
    schema: dateOnly.nullable(),
    default: null,
    label: "창설일",
    description: "일정 탭 맨 위 슬로건 위에 「Since 2024.04.23」로 보여요. 비우면 안 보여요.",
    visibility: "public",
    group: "brand",
    input: { kind: "text", placeholder: "예: 2024-04-23" },
  }),

  /**
   * 정기 모임 템플릿 — 모임 만들기에서 유형을 「정기」로 고르면 비어 있는 제목·비고와 시작 시각을 채운다.
   * **기본값이 없다** — 비어 있으면 자동 채움을 하지 않는다(기강 코스·문구가 다른 팀에 채워지지 않게).
   * 예전엔 `lib/gathering/templates.ts` 에 기강 문구가 상수로 박혀 있었다(2026-11-09 데이터로 옮김).
   */
  "gathering.regular_template": defineCfg({
    schema: z
      .object({
        title: z.string().trim().min(1),
        /** KST "HH:mm" — 날짜는 폼에서 고른 날을 유지하고 시각만 바꾼다 */
        default_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        desc: z.string(),
      })
      .nullable(),
    default: null,
    label: "정기 모임 템플릿",
    description: "모임 만들기에서 「정기」를 고르면 채워지는 제목·시작 시각·비고. 비우면 자동으로 채우지 않아요.",
    visibility: "member",
    group: "operation",
    input: { kind: "regular_template" },
  }),

  /**
   * 가입 폼 첫 화면에 띄우는 「다른 팀 가입이세요? 여기로 →」 안내 — 다른 팀에 가려다 이 주소로 온 사람을 넘겨준다.
   * 주소는 적지 않고 팀 코드만 둔다 — 링크는 접속 환경(운영·dev·로컬)에 맞는 그 팀 주소로 만든다(`teamLinkOrigin`).
   * 기본값 = 빈 목록(안내 없음).
   */
  "signup.other_teams": defineCfg({
    schema: z.array(z.object({ team_cd: z.string().trim().min(1), name: z.string().trim().min(1) })),
    default: [],
    label: "다른 팀 가입 안내",
    description: "가입 폼 첫 화면에 「○○ 가입이세요? 여기로 →」를 띄울 팀. 비우면 안 보여요.",
    visibility: "public",
    group: "operation",
    input: { kind: "team_links" },
    hidden: true,
  }),

  /**
   * 회비 기능 사용 여부. 기본값 = 지금 기강 동작(켬). 끈 팀은 회비가 화면 어디에도 안 나온다 —
   * 더보기 「회비 내역」 줄·미납 점, 회비 내역 화면, 관리자 회비 메뉴·대시보드 카드(울산, 2026-11-09 유저 결정).
   * 끈 팀의 회비 배치(DUES_EXEMPTION_BATCH)도 같이 꺼 둔다(마이그레이션에서 use_yn=false).
   */
  "feature.dues": defineCfg({
    schema: z.boolean(),
    default: true,
    label: "회비 기능",
    description: "회비 내역·미납 표시·관리자 회비 메뉴를 써요. 끄면 화면 어디에도 회비가 안 보여요.",
    visibility: "member",
    group: "feature",
    input: { kind: "boolean" },
    // 못 읽었을 땐 끈다 — 기본값(켬)으로 물러나면 회비를 안 쓰는 팀에 그 순간 회비 메뉴·관리자 회비 화면이 열린다
    onReadError: false,
  }),
} as const;

export type TeamCfgCd = keyof typeof TEAM_CFG_REGISTRY;
export type TeamCfgValue<K extends TeamCfgCd> = z.infer<(typeof TEAM_CFG_REGISTRY)[K]["schema"]>;

export function isTeamCfgCd(cd: string): cd is TeamCfgCd {
  return Object.prototype.hasOwnProperty.call(TEAM_CFG_REGISTRY, cd);
}

/**
 * DB 값 → 사전 형식. 행이 없거나(`undefined`) 형식이 틀리면 기본값.
 * 순수 함수 — 회귀 테스트 `lib/team-cfg/__tests__/registry.test.ts`.
 */
/** 설정을 못 읽었을 때 쓸 값 — 키의 `onReadError`, 없으면 기본값 */
export function resolveTeamCfgReadErrorValue<K extends TeamCfgCd>(cd: K): TeamCfgValue<K> {
  const def = TEAM_CFG_REGISTRY[cd] as CfgDef<z.ZodTypeAny>;
  return (def.onReadError !== undefined ? def.onReadError : def.default) as TeamCfgValue<K>;
}

export function resolveTeamCfgValue<K extends TeamCfgCd>(cd: K, raw: unknown): TeamCfgValue<K> {
  const def = TEAM_CFG_REGISTRY[cd];
  if (raw === undefined) return def.default as TeamCfgValue<K>;
  const parsed = def.schema.safeParse(raw);
  if (parsed.success) return parsed.data as TeamCfgValue<K>;
  console.warn(`[team-cfg] ${cd} 값이 형식에 맞지 않아 기본값으로 동작합니다`, parsed.error.issues[0]?.message);
  return def.default as TeamCfgValue<K>;
}
