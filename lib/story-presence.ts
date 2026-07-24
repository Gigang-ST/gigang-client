/**
 * 떠다니는 아바타(실시간 접속자)의 **사람별 고정 색**과 **성격**.
 *
 * 색을 클릭할 때마다 랜덤으로 뽑으면 "누가 치고 있나"를 알 수 없다. 링 색과 이름표 색을
 * `mem_id` 해시로 묶어 사람마다 항상 같은 색이 나오게 하면, 몇 번 보다 보면 "저 초록이 준민"이
 * 학습된다 — 남이 내 공을 튕겨도 누가 튕겼는지가 색으로 읽힌다.
 *
 * 성격도 같은 해시에서 뽑는다. 매번 랜덤이면 모두가 평균적인 움직임으로 수렴해 다 똑같아 보인다.
 * 사람마다 걸음 속도·멈춤 성향을 고정해두면 "쟤는 원래 부산스럽다"는 개성이 생긴다.
 */

/**
 * 사람별 색 팔레트 — 전광판 톤(앰버)과 무관한 놀이 색.
 *
 * 라이트/다크 양쪽 배경에서 모두 읽히도록 중간 명도로 골랐다. 인접한 색끼리 최대한
 * 구분되게 색상환을 띄엄띄엄 돈다(빨강→주황→초록→하늘→보라→분홍→청록→라임→남색→코랄).
 */
export const PRESENCE_COLORS = [
  "#ff5d73", // 코랄레드
  "#ffa620", // 앰버
  "#22c55e", // 그린
  "#38bdf8", // 스카이
  "#a855f7", // 바이올렛
  "#f472b6", // 핑크
  "#14b8a6", // 틸
  "#a3c623", // 라임
  "#818cf8", // 인디고
  "#fb7185", // 로즈
] as const;

/** 문자열 → 32bit 해시(FNV-1a). 같은 id는 언제 어디서 계산해도 같은 값 */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 멤버 id → 고정 색 인덱스.
 *
 * 인덱스로 돌려주는 이유: broadcast 페이로드에 색 문자열 대신 인덱스만 실어 보내면 되고,
 * 팔레트를 바꿔도 전송 포맷이 안 바뀐다.
 */
export function getPresenceColorIdx(memId: string): number {
  return hashId(memId) % PRESENCE_COLORS.length;
}

/** 멤버 id → 고정 색(hex) */
export function getPresenceColor(memId: string): string {
  return PRESENCE_COLORS[getPresenceColorIdx(memId)];
}

/**
 * 사람별 고정 성격 — 걸음의 결을 가른다.
 *
 * `pace`: 기본 걸음 속도 배수. 느긋한 사람(0.6)과 부산한 사람(1.5)이 같은 화면에 섞이게.
 * `stillness`: 구간이 끝났을 때 "멈춰 설" 확률. 높을수록 전광판을 오래 구경하는 타입.
 * `restless`: 멈춤 구간의 길이 배수(작을수록 금방 다시 움직인다).
 */
export type PresencePersona = {
  pace: number;
  stillness: number;
  restless: number;
};

export function getPresencePersona(memId: string): PresencePersona {
  const h = hashId(memId);
  // 서로 다른 비트 구간을 써서 세 값이 함께 움직이지 않게 한다
  const a = (h >>> 4) % 100;
  const b = (h >>> 12) % 100;
  const c = (h >>> 20) % 100;
  return {
    pace: 0.6 + (a / 100) * 0.9, // 0.6 ~ 1.5
    stillness: 0.25 + (b / 100) * 0.4, // 0.25 ~ 0.65
    restless: 0.7 + (c / 100) * 1.1, // 0.7 ~ 1.8
  };
}
