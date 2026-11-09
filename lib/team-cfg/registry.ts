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
