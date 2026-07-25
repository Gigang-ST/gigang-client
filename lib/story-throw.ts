/**
 * 한마디 던지기 — 손가락으로 끌다 **휙 뿌리는** 관성 던지기의 규칙.
 *
 * **던지기는 전송을 막지 않는다.** 한마디는 버튼을 누른 순간 이미 저장되고, 던지기는
 * 그 뒤에 오는 놀이다(거리는 `set_message_fly_dist`로 나중에 채운다). 그래서 던지다
 * 그만두거나 실패해도 잃는 게 없다 — 놀이가 글쓰기의 관문이 되면 한 줄 쓰려던 사람이
 * 게임을 강요당한다.
 *
 * 힘은 **놓는 순간의 속도**(px/ms)다. 당김 거리로 힘을 재던 방식(슬링샷)을 걷어냈다:
 * 그건 "던진다"가 아니라 "조준한다"에 가깝고, 게이지를 읽는 동안 손맛이 사라진다.
 * 속도로 재면 천천히 끌다 마지막에 튕겨도 그 튕김이 그대로 힘이 된다 — 손이 아는 규칙.
 *
 * 물리는 "진짜"일 필요가 없다. 손맛이 목적이라 값은 전부 화면에서 보기 좋은 쪽으로
 * 골랐다. 다만 **같은 손짓이면 항상 같은 거리**여야 한다 — 랜덤을 섞으면 잘 던졌다는
 * 감각이 사라진다.
 */

/**
 * 이 속도(px/ms)면 최대 힘.
 *
 * 실제 손짓 속도를 재서 맞췄다: 보통 스와이프 ≈1.7, 빠른 스와이프 ≈2.9, 손목 스냅 ≈4.3,
 * 전력 플릭 ≈6.9 px/ms. 처음엔 2.6으로 잡았는데 **빠른 스와이프부터 이미 최대**라
 * 대부분의 던지기가 9999m로 붙어 "얼마나 멀리"가 사라졌다. 4.5면 보통 1.4km ·
 * 빠르게 4.1km · 스냅 9km로 벌어져, 천장이 닿긴 하되 제대로 뿌려야 닿는다.
 */
export const FLICK_MAX_SPEED = 4.5;
/** 탭(거의 안 움직임)일 때 쓰는 기본 세기(0~1) — 못/안 던지는 사람도 날릴 수 있게 */
export const TAP_POWER = 0.5;

/** 거리 상한 — DB CHECK(0~9999)와 같은 지붕. 넘겨 보내면 서버가 자른다 */
export const FLY_DIST_MAX = 9999;

/** 연출이 날아가는 기준 거리(px) — 세기 1이면 이만큼 간다(하늘 밖으로 빠져나갈 만큼) */
const FLIGHT_SPAN_PX = 620;

/** 던지기 결과 — 연출과 저장이 같은 값을 쓴다 */
export type ThrowResult = {
  /** 던진 세기 0~1 */
  power: number;
  /** 날아간 거리(m) — 서버에 남기는 값 */
  dist: number;
  /** 비행 시간(ms) — 연출 길이. 세게 던질수록 오래 난다 */
  durationMs: number;
  /** 연출용 이동 벡터(px) — 던진 방향 그대로 난다 */
  vecX: number;
  vecY: number;
};

/**
 * 끌다 놓은 손짓 → 던지기 결과.
 *
 * @param dx 표본 구간의 이동 x(px). 화면 좌표(오른쪽이 양수)
 * @param dy 같음. 화면 좌표(아래가 양수)
 * @param dt 그 구간에 걸린 시간(ms)
 *
 * 방향은 **던진 그대로** 쓴다(슬링샷처럼 뒤집지 않는다) — 손이 간 쪽으로 날아가는 게
 * 뿌리는 손짓의 규칙이다. 위로 뿌리면 위로, 왼쪽으로 뿌리면 왼쪽으로 난다.
 */
export function computeFlick(dx: number, dy: number, dt: number): ThrowResult {
  // dt가 0이거나 움직임이 없으면(탭) 기본 세기로 위·왼쪽에 던진다 — 하늘의 비행
  // 방향(오→왼)과 같은 쪽이라 "저 하늘로 갔다"가 읽힌다.
  if (!dt || dt <= 0 || (dx === 0 && dy === 0)) {
    return buildResult(TAP_POWER, -0.72, -0.69);
  }

  const speed = Math.hypot(dx, dy) / dt; // px/ms
  const power = Math.min(1, Math.max(0, speed / FLICK_MAX_SPEED));

  const len = Math.hypot(dx, dy) || 1;
  return buildResult(power, dx / len, dy / len);
}

/**
 * 세기·방향 → 거리와 연출 벡터.
 *
 * 거리는 세기의 제곱으로 늘린다 — 살살 뿌리면 얼마 못 가고 제대로 스냅하면 확 늘어나는
 * 손맛. 선형이면 어떻게 던져도 고만고만해서 "잘 던졌다"가 없다.
 *
 * **위로 던질수록 조금 더 간다**(최대 +15%). 멀리 던지려면 비스듬히 위로 뿌린다는 감각과
 * 맞추기 위해서다. 다만 각도를 힘의 주된 변수로 두진 않는다 — 그러면 다시 조준 게임이
 * 되고, 이 놀이의 요점은 "얼마나 세게 뿌렸나"다.
 */
function buildResult(power: number, ux: number, uy: number): ThrowResult {
  // uy는 화면 좌표라 음수가 위. 위로 향할수록 1에 가까운 보너스를 만든다.
  const upward = Math.max(0, -uy); // 0(수평·아래) ~ 1(수직 위)
  const lift = 1 + upward * 0.15;

  const norm = Math.min(1, power * power * lift);
  const dist = Math.round(norm * FLY_DIST_MAX);

  // 연출 벡터 — 던진 방향으로 세기만큼. 세로는 눌러 준다: 하늘이 h-64여도 256px이라
  // 가로와 같은 배율이면 위로 던졌을 때 한 프레임에 사라져 비행이 안 보인다.
  const reach = FLIGHT_SPAN_PX * (0.35 + power * 0.65);

  return {
    power,
    dist: Math.min(FLY_DIST_MAX, Math.max(0, dist)),
    // 세게 던질수록 오래 난다. 상한을 둔다 — 연출이 1.6초를 넘으면 기다림이 된다.
    durationMs: Math.round(620 + norm * 900),
    vecX: Math.round(ux * reach),
    vecY: Math.round(uy * reach * 0.55),
  };
}

/**
 * 거리 → 하늘에서의 고도(0~1, 1이 가장 높음).
 *
 * 거리가 그냥 숫자로 끝나면 한 번 보고 만다. 하늘의 배너 높이로 바꿔 두면 **별도 UI 없이**
 * 지면만 봐도 누가 잘 던졌는지 읽힌다 — 랭킹표를 세우지 않고도 경쟁이 생긴다.
 *
 * `null`(안 던짐)은 한가운데(0.5)에 둔다. 바닥에 두면 안 던진 사람이 벌을 받는 것처럼
 * 보이고, 꼭대기에 두면 던질 이유가 없어진다.
 *
 * 제곱근을 쓰는 이유: 거리는 세기의 제곱으로 늘어나 위쪽이 성기다. 그대로 고도에 쓰면
 * 대부분의 한마디가 바닥에 깔린다. sqrt로 펴야 하늘이 고르게 찬다.
 */
export function flyAltitude(dist: number | null): number {
  if (dist == null) return 0.5;
  return Math.sqrt(Math.min(FLY_DIST_MAX, Math.max(0, dist)) / FLY_DIST_MAX);
}

/** 거리 표기 — 1000m 넘으면 km로 접는다(네 자리 숫자는 배너에서 길다) */
export function formatFlyDist(dist: number): string {
  if (dist >= 1000) return `${(dist / 1000).toFixed(2)}km`;
  return `${dist}m`;
}
