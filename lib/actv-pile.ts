import type { StoryActvRankEntry } from "@/lib/queries/story-feed";

/**
 * 활동량 무더기 — 점수에 비례하는 아바타를 네모 안에 쌓는 배치 계산.
 *
 * 순위 목록(1위 2위 3위…)을 걷어내고 **크기 하나로** 격차를 말한다. 숫자를 읽어야
 * 알던 걸 한눈에 보게 하는 게 목적이라, 등수·점수 텍스트는 그림 위에 얹지 않는다
 * (누르면 프로필 카드가 정확한 수치를 답한다).
 *
 * 계산은 순수 함수로 떼어 둔다 — 브라우저 없이 검증할 수 있어야 "겹치지 않는다·
 * 넘치지 않는다"를 눈이 아니라 수치로 확인할 수 있다.
 */

/** 지름 하한(px) — 이보다 작으면 누구 얼굴인지 분간이 안 된다 */
export const PILE_MIN_D = 16;
/** 지름 상한(px) — 375px 폭에서 한 칸이 화면 1/4을 넘지 않는 선 */
export const PILE_MAX_D = 88;

export type PiledAvatar = {
  entry: StoryActvRankEntry;
  /** 중심 좌표(px) — 컨테이너 좌상단 기준 */
  x: number;
  y: number;
  /** 지름(px) */
  d: number;
};

/**
 * 점수 → 지름. **선형 비례**다(면적이 아니라 지름).
 *
 * 면적 비례(제곱근)가 통계적으로는 더 정직하지만, 여기서는 1등이 확실히 커 보이는 쪽을
 * 택했다 — 이 그림의 목적은 정밀한 비교가 아니라 "누가 이번 달을 끌었나"를 한눈에
 * 보여주는 것이다. 최저점도 `PILE_MIN_D`는 보장해 얼굴이 사라지지 않게 한다.
 */
export function scoreToDiameter(score: number, maxScore: number): number {
  if (maxScore <= 0) return PILE_MIN_D;
  const ratio = Math.max(0, Math.min(1, score / maxScore));
  return PILE_MIN_D + (PILE_MAX_D - PILE_MIN_D) * ratio;
}

/** 결정적 의사난수 — 같은 입력이면 같은 배치. SSR/CSR이 갈리지 않게 Math.random을 쓰지 않는다 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32 — 짧고 분포가 고르다. 암호용이 아니라 배치용
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}

/** 문자열 → 안정적인 정수 시드(멤버 id 기반이라 새로고침해도 배치가 유지된다) */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 중력 낙하 배치 — 큰 것부터 떨어뜨려 바닥·기존 원 위에 얹는다.
 *
 * 물리 시뮬레이션을 돌리지 않는다(66개 × 매 프레임은 모바일에서 비싸고, 결과가 매번
 * 달라져 "내 자리"가 사라진다). 대신 **떨어질 x를 정하고 걸리는 높이를 계산**하는
 * 결정적 패킹이다 — 한 번 계산하면 끝이고, 같은 데이터면 같은 그림이 나온다.
 *
 * 큰 것부터 넣는 이유: 작은 것이 먼저 자리를 잡으면 큰 원이 얹힐 곳을 잃어 위로 치솟는다.
 * 무거운 것이 밑에 깔리는 실제 무더기의 순서와도 같다.
 */
export function pileAvatars(
  entries: StoryActvRankEntry[],
  width: number,
): { items: PiledAvatar[]; height: number } {
  if (entries.length === 0 || width <= 0) return { items: [], height: 0 };

  const maxScore = Math.max(...entries.map((e) => e.actv_score));
  // 큰 것부터 — 원본 배열을 건드리지 않는다(props로 받은 배열이라)
  const sorted = [...entries].sort((a, b) => b.actv_score - a.actv_score);

  const rand = seededRandom(hashSeed(sorted.map((e) => e.mem_id).join("")));
  const placed: PiledAvatar[] = [];

  for (const entry of sorted) {
    // 지름은 컨테이너 폭을 넘지 않게 한 번 더 자른다 — 폭이 아주 좁으면(PILE_MAX_D보다 작으면)
    // 원이 좌우로 삐져나갈 수 있다. 실사용 폭에선 안 걸리지만 경계를 확실히 닫아 둔다.
    const d = Math.min(scoreToDiameter(entry.actv_score, maxScore), width);
    const r = d / 2;

    // 후보 x를 여러 개 뽑아 **가장 낮게 앉는 자리**를 고른다. 한 곳만 시도하면 빈 골짜기를
    // 두고 엉뚱한 데 쌓여 무더기가 위로만 자란다.
    let best: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const x = r + rand() * Math.max(0, width - d);
      // 바닥에서 시작해, 이미 놓인 원들 중 x가 겹치는 것 위로 밀어 올린다
      let y = r;
      for (const p of placed) {
        const dx = Math.abs(p.x - x);
        const minDist = r + p.d / 2;
        if (dx < minDist) {
          // 두 원이 접할 때의 세로 거리 — 피타고라스
          const dy = Math.sqrt(minDist * minDist - dx * dx);
          y = Math.max(y, p.y + dy);
        }
      }
      if (best === null || y < best.y) best = { x, y };
    }

    if (best) placed.push({ entry, x: best.x, y: best.y, d });
  }

  // y는 "바닥에서 얼마나 높은가"로 쌓았다 — 화면 좌표(위가 0)로 뒤집는다.
  const height = Math.max(...placed.map((p) => p.y + p.d / 2));
  return {
    items: placed.map((p) => ({ ...p, y: height - p.y })),
    height,
  };
}
