import { getAll } from "@vercel/global-config";

import { env } from "@/lib/env";
import { withTimeout, type MaintenanceConfig } from "@/lib/maintenance";

/**
 * 점검 설정 읽기 — **Vercel Global Config**(옛 Edge Config)에서 가져온다.
 *
 * 저장소를 Supabase 가 아니라 Vercel 쪽에 두는 게 핵심이다. 점검 모드가 필요한 상황은
 * 대개 **Supabase 가 죽은 때**라, 스위치를 DB 에 두면 "점검 중인가?"를 묻는 질문 자체가
 * 타임아웃 난다. Global Config 는 Vercel 자체 인프라라 Supabase 와 완전히 독립이고,
 * 값을 바꿔도 **재배포가 필요 없다**(환경변수였다면 빌드를 기다려야 한다).
 *
 * 읽어 오는 키 두 개:
 * - `maintenance`      (boolean, 필수) — 점검 모드 on/off
 * - `maintenanceUntil` (string, 선택) — 종료 예정 시각. **한국시간 그대로** 'YYYY-MM-DD HH:mm'
 *
 * 실패하면 `null` 을 돌려주고, 그걸 `isMaintenanceActive` 가 "정상 서비스"로 읽는다(fail-open).
 */
/**
 * Global Config 읽기 상한(ms). 평소 응답은 한 자릿수 ms 라 넉넉하고, 원격이 멈췄을 때
 * 화면 요청이 무는 지연의 상한이기도 하다. 넘으면 "못 읽음" = 정상 서비스로 떨어진다.
 */
const CONFIG_READ_TIMEOUT_MS = 1000;

export async function readMaintenanceConfig(): Promise<MaintenanceConfig | null> {
  // 로컬·프리뷰에서 Global Config 없이 화면만 확인할 때 쓰는 우회로.
  // 운영에서는 쓰지 않는다 — 환경변수는 바꿀 때마다 재배포가 필요해서 장애 대응에 못 쓴다.
  if (env.MAINTENANCE_MODE === "1" || env.MAINTENANCE_MODE === "true") {
    return { enabled: true, until: env.MAINTENANCE_UNTIL?.trim() || null };
  }

  try {
    // 연결 문자열(GLOBAL_CONFIG/EDGE_CONFIG)이 없으면 여기서 throw 한다 → catch → fail-open.
    // 상한을 거는 이유는 `withTimeout` 주석에 있다 — SDK 에 중단 장치가 없어서, 상한이 없으면
    // 원격이 멈출 때 화면 요청이 통째로 여기 매달린다.
    const all = await withTimeout<Record<string, unknown> | null>(
      getAll<Record<string, unknown>>().then((v) => v ?? null),
      CONFIG_READ_TIMEOUT_MS,
      null,
    );
    if (!all) return null;
    return {
      enabled: all?.maintenance === true,
      until: typeof all?.maintenanceUntil === "string" ? all.maintenanceUntil : null,
    };
  } catch {
    // 로그도 남기지 않는다 — Global Config 미연결이 기본 상태인 로컬에서 매 요청 시끄러워진다.
    return null;
  }
}
