import { dayjs } from "@/lib/dayjs";

/**
 * 점검 모드 판정 — **순수 로직만** 둔다.
 *
 * Edge Config 읽기(`lib/maintenance-config.ts`)와 떼어 둔 이유는 `public-paths.ts`와 같다:
 * 이 판정은 문자열·불리언 비교뿐이라 `@vercel/edge-config` 없이 테스트되어야 한다.
 *
 * 이 코드는 **장애가 났을 때만** 실행된다 — 평소엔 아무도 밟지 않으므로, 정작 필요한
 * 순간에 처음 돌아보게 된다. 그래서 경계를 `lib/__tests__/maintenance.test.ts`가 굳힌다.
 */

const KST = "Asia/Seoul";

/** 점검 화면이 사는 경로. proxy 가 여기로 rewrite 한다. */
export const MAINTENANCE_PATH = "/maintenance";

/** 우회 쿠키 이름 — 운영자 브라우저만 원래 앱을 본다. */
export const BYPASS_COOKIE = "gigang-maintenance-bypass";

/** 우회를 켜는 쿼리 파라미터. `?bypass=<MAINTENANCE_BYPASS_SECRET>` */
export const BYPASS_PARAM = "bypass";

/** Edge Config 에서 읽어 온 점검 설정. `until` 은 KST 로 적은 'YYYY-MM-DD HH:mm'. */
export type MaintenanceConfig = {
  enabled: boolean;
  until: string | null;
};

/**
 * Edge Config 를 읽기 **전에** 내리는 1차 판정.
 *
 * `"pass"` 로 끝나는 경로는 Edge Config 왕복조차 하지 않는다 — API 요청마다 원격 읽기를
 * 한 번씩 더 하는 건 점검 모드가 꺼져 있는 평소에도 내는 비용이다.
 *
 * - `/api/*` 는 **점검 중에도 통과**시킨다. Vercel cron 2개와 `/api/revalidate` 웹훅(DB 트리거가
 *   호출)은 막아 봐야 얻는 게 없고, 복구 직후 캐시 무효화가 바로 도는 편이 낫다.
 * - 비밀값이 비어 있으면 어떤 bypass 도 통하지 않는다. `undefined === undefined` 같은
 *   빈 값끼리의 일치로 문이 열리는 걸 막는다.
 */
export function preCheckMaintenance(input: {
  pathname: string;
  bypassParam: string | null;
  bypassCookie: string | null;
  bypassSecret: string | undefined;
}): "pass" | "grant-bypass" | "check-config" {
  const { pathname, bypassParam, bypassCookie, bypassSecret } = input;

  if (pathname === MAINTENANCE_PATH || pathname.startsWith("/api/")) return "pass";

  const secret = bypassSecret?.trim();
  if (secret) {
    if (bypassParam === secret) return "grant-bypass";
    if (bypassCookie === secret) return "pass";
  }

  return "check-config";
}

/**
 * 점검 모드가 실제로 켜져 있는가.
 *
 * **`null`(= Edge Config 를 못 읽음)은 "정상 서비스"다.** 설정 저장소가 흔들렸다고 멀쩡한
 * 앱을 내리면 점검 모드 자체가 장애의 원인이 된다. 점검은 **명시적으로 `true`** 일 때만 켜진다.
 */
export function isMaintenanceActive(config: MaintenanceConfig | null): boolean {
  return config?.enabled === true;
}

/**
 * 점검 종료 예정 시각을 화면 문구로. 보여줄 게 없으면 `null`(→ "곧 돌아올게요").
 *
 * **입력은 한국시간 그대로** 적는다(`2026-09-23 22:00`). 오프셋 없이 그냥 파싱하면
 * 실행 환경 타임존(Vercel = UTC)으로 읽혀 9시간 밀리므로 `dayjs.tz(..., KST)` 로 못박는다
 * — CLAUDE.md 가 경고하는 바로 그 함정이다.
 *
 * **이미 지난 시각은 숨긴다.** 점검이 길어질 때 "10시까지"를 11시에도 계속 보여주는 건
 * 아무 말도 안 하는 것보다 나쁘다.
 */
export function formatMaintenanceUntil(
  until: string | null | undefined,
  now: dayjs.Dayjs,
): string | null {
  const raw = until?.trim();
  if (!raw) return null;

  // 'T' 구분자도 받되 한 형태로 좁힌다. 모양이 안 맞으면 파싱조차 하지 않는다.
  const normalized = raw.replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) return null;

  let target: dayjs.Dayjs;
  try {
    target = dayjs.tz(normalized, KST);
  } catch {
    return null;
  }
  if (!target.isValid()) return null;
  // **왕복 검증.** dayjs 는 `2026-13-45 99:99` 를 거부하지 않고 다음 해 2월로 굴린다 —
  // 오타가 "형식 오류"가 아니라 **조용한 엉뚱한 날짜**가 되는 게 더 나쁘다.
  if (target.format("YYYY-MM-DD HH:mm") !== normalized) return null;
  if (!target.isAfter(now)) return null;

  const time = target.minute() === 0 ? target.format("A h시") : target.format("A h시 m분");
  const sameDay = target.format("YYYY-MM-DD") === now.tz(KST).format("YYYY-MM-DD");
  return sameDay ? time : `${target.format("M월 D일")} ${time}`;
}
