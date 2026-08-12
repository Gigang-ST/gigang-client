/**
 * 칭호획득 리드 슬롯 표시 헬퍼 — **클라이언트가 읽어도 되는 것만** 둔다.
 *
 * 조회 쪽(`lib/queries/story-titles.ts`)은 `createAdminClient`를 타고 `server-only`에
 * 닿는 서버 모듈이라 여기와 분리한다(`lib/story-post.ts`와 같은 이유 — 상수 하나만
 * 가져와도 클라이언트 번들이 서버 모듈을 통째로 끌어와 브라우저에서 터진다).
 *
 * 설계 문서: docs/superpowers/specs/2026-08-12-칭호획득-슬롯-사람대표-design.md
 */

/** `get_team_recent_title_grants` RPC의 획득자 한 명 */
export type RecentTitleGrantPerson = {
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  grnt_at: string;
};

/** `get_team_recent_title_grants` RPC의 칭호 한 줄 — 최근 30일 획득자 묶음(최신순) */
export type RecentTitleRow = {
  ttl_id: string;
  ttl_nm: string;
  ttl_desc: string | null;
  desc_visibility: "always" | "others" | "held" | "never";
  /** 이 칭호의 가장 최근 수여 시각 — RPC 정렬 기준(내림차순) */
  last_grnt_at: string;
  /** 전체 수여 건수(같은 30일 창 기준) — grants는 상위 10건만 실린다(§RPC 주석) */
  grant_cnt: number;
  /**
   * 창 전체의 **고유 획득자 수** — 모든 row에 같은 값이 실려 온다(RPC가 배열이라
   * 스칼라를 얹을 자리가 없어 복사한다. §20260812100000 마이그레이션 주석).
   *
   * `외 N명`은 반드시 이 값으로 센다. `grants`가 칭호당 10건에서 잘리므로 명단을
   * 세면 실제보다 적게 나온다 — prd 실측으로 75명이 41명으로 보였다.
   */
  total_mem_cnt: number;
  grants: RecentTitleGrantPerson[];
};

/**
 * 명단(대표 제외)에 얼굴을 몇 개까지 세울까 — 넘치면 `외 N명`.
 *
 * **한 줄이다.** 두 줄로 늘렸다가 되돌렸다 — 슬롯 264px 예산에서 두 줄(+46px)은
 * 헤드라인이 2줄이 되는 순간 바닥이 잘린다(실제로 잘리는 걸 화면에서 봤다).
 * 예산을 늘리는 건 전 슬롯 공통 상수를 건드리는 일이라 이 존 하나 때문에 못 한다.
 *
 * 6인 근거: 375px에서 슬롯 안쪽 폭이 287px이고 칩은 `flex-nowrap`으로 폭을 나눠 가지므로
 * 하나당 약 41px — 세 글자 이름이 그대로 서는 폭이다. 더 늘리면 이름이 …로 잘리기
 * 시작하고, 줄이면 얼굴이 아까운 여백만 남는다.
 */
export const TITLE_OTHERS_MAX = 6;

/** 칭호획득 슬롯의 대표 후보 한 명 — 사람 + 그 사람의 최신 수여 칭호(원본 row) */
export type TitleLeadEntry = {
  person: RecentTitleGrantPerson;
  /** 이 수여의 칭호 row — 배지·설명·heldByMe 근사(grants 명단)에 쓴다 */
  title: RecentTitleRow;
};

/**
 * 칭호별 묶음(RPC 반환)을 **사람 단위 pool**로 평탄화한다 — 사람별 최신 수여 1건만
 * 남기고(목표 팻말 `dedupePledgesByMember`와 같은 원칙 — 한 사람이 칭호 셋을 동시에
 * 따도 대표 3연속·명단 3중복이 안 되게) 최신순으로 정렬한다.
 *
 * `grnt_at` 비교가 사전순인 이유: RPC(jsonb)가 같은 오프셋(+00:00) ISO 문자열로 주므로
 * 사전순이 곧 시간순이다. dayjs를 안 쓰는 건 이 파일이 클라이언트 번들에 실려서다
 * (파일 머리 주석 — server-only 오염 방지와 같은 결).
 */
export function buildTitleLeadPool(rows: RecentTitleRow[]): TitleLeadEntry[] {
  const byMem = new Map<string, TitleLeadEntry>();
  for (const row of rows) {
    for (const person of row.grants) {
      const prev = byMem.get(person.mem_id);
      if (!prev || person.grnt_at > prev.person.grnt_at) {
        byMem.set(person.mem_id, { person, title: row });
      }
    }
  }
  return [...byMem.values()].sort((a, b) =>
    a.person.grnt_at < b.person.grnt_at
      ? 1
      : a.person.grnt_at > b.person.grnt_at
        ? -1
        : 0,
  );
}

/**
 * pick으로 대표를 뽑는다 — 나머지(others)는 **최신순 그대로**(대표만 뺀 목록).
 *
 * 회전이지 셔플이 아니다: 한 바퀴 완주마다 호출자가 pick을 +1 하면 전원이 빠짐없이
 * 돌아가며 대표가 된다(리드의 rotate 원칙 — story-lede.tsx의 rotate 주석 참조).
 * others를 회전시키지 않는 이유: 매 바퀴 명단까지 뒤섞이면 어지럽다(스펙 §회전 규칙).
 */
export function pickTitleLead(
  pool: TitleLeadEntry[],
  pick: number,
): { lead: TitleLeadEntry; others: TitleLeadEntry[] } | null {
  if (pool.length === 0) return null;
  const at = ((pick % pool.length) + pool.length) % pool.length;
  return { lead: pool[at], others: pool.filter((_, i) => i !== at) };
}

/**
 * 지면에 못 실은 획득자 수 — `외 N명`. `shown`은 **대표 1명까지 포함한** 노출 인원이다.
 *
 * 반드시 RPC의 `total_mem_cnt`로 센다. `buildTitleLeadPool`의 길이로 세면 **적게 나온다** —
 * grants가 칭호당 10건에서 잘리기 때문이고, 하필 그 잘림이 크게 벌어지는 때가
 * sweep(이 슬롯이 존재하는 이유)이다. prd 실측으로 실제 75명이 pool에선 41명이었다.
 *
 * 값이 없거나(배포 스큐로 옛 payload가 캐시에 남은 경우) 노출 인원보다 작으면 0 —
 * "외 -3명" 같은 게 지면에 뜨지 않게.
 */
export function countTitleMoreMembers(
  rows: RecentTitleRow[],
  shown: number,
): number {
  const total = rows[0]?.total_mem_cnt ?? 0;
  return Math.max(0, total - shown);
}

/**
 * 칭호획득 슬롯의 진입 회전 오프셋을 뽑는다(0 ~ count-1). count가 0/1이면 0.
 *
 * 서버 컴포넌트 렌더에서 `Math.random()`을 직접 부르면 렌더 순수성 룰에 걸린다 —
 * `pickRandomPostIndex`(lib/story-post.ts)와 같은 이유로 헬퍼로 빼 둔다.
 */
export function pickTitleLedeStart(count: number): number {
  if (count <= 1) return 0;
  return Math.floor(Math.random() * count);
}
