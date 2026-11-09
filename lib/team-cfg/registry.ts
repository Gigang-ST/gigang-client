import { z } from "zod";

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

type CfgDef<S extends z.ZodTypeAny> = {
  schema: S;
  default: z.infer<S>;
  /** 사람이 읽는 이름 — 나중에 관리자 설정 화면이 이걸로 입력칸을 그린다 */
  label: string;
  description: string;
  visibility: "server" | "member" | "public";
};

function defineCfg<S extends z.ZodTypeAny>(def: CfgDef<S>): CfgDef<S> {
  return def;
}

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
  }),

  /**
   * 팀 채널(오픈채팅·인스타·소모임·가민) 주소. **기본값이 없다** — 없는 채널은 칸째 안 그린다.
   * 다른 키처럼 기강 값을 기본으로 두면 다른 팀 화면에 기강 채널이 뜬다.
   */
  "social.channels": defineCfg({
    schema: z.object({
      kakao_open_chat: z.string().url().optional(),
      instagram: z.string().url().optional(),
      somoim: z.string().url().optional(),
      garmin: z.string().url().optional(),
    }),
    default: {},
    label: "팀 채널",
    description: "오픈채팅·인스타·소모임·가민 주소. 비운 채널은 화면에 안 보여요.",
    visibility: "public",
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
  }),

  /**
   * 진행 중인 프로젝트가 없을 때 프로젝트 탭에 마일리지런 소개·규칙을 보여 줄지.
   * 기본값 = 지금 기강 동작(보여 준다 — 시즌 사이에 다음 시즌을 기다리게).
   * 마일리지런을 안 하는 팀은 끄면 "진행 중인 프로젝트가 없어요"만 보인다(울산, 2026-11-09 유저 결정).
   */
  "project.show_intro": defineCfg({
    schema: z.boolean(),
    default: true,
    label: "프로젝트 소개 보이기",
    description: "진행 중인 프로젝트가 없을 때 마일리지런 소개를 보여 줘요. 끄면 '진행 중인 프로젝트가 없어요'만 보여요.",
    visibility: "member",
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
export function resolveTeamCfgValue<K extends TeamCfgCd>(cd: K, raw: unknown): TeamCfgValue<K> {
  const def = TEAM_CFG_REGISTRY[cd];
  if (raw === undefined) return def.default as TeamCfgValue<K>;
  const parsed = def.schema.safeParse(raw);
  if (parsed.success) return parsed.data as TeamCfgValue<K>;
  console.warn(`[team-cfg] ${cd} 값이 형식에 맞지 않아 기본값으로 동작합니다`, parsed.error.issues[0]?.message);
  return def.default as TeamCfgValue<K>;
}
