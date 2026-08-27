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
 * pick으로 대표를 뽑는다 — others는 대표가 딴 **같은 칭호**를 최근에 함께 딴 사람들이다
 * (대표 본인만 뺀, `lead.title.grants` 그대로).
 *
 * v2는 이 자리에 "대표를 뺀 pool 전체"(칭호 무관 최근 획득자 전원)를 넣었는데, 그러면
 * 슬롯이 "누가 무슨 칭호를 땄나"가 아니라 "요즘 누가 활발한가"를 말하게 돼 헤드라인
 * (`{대표}, 새 칭호를 획득하다`)과 명단이 서로 다른 이야기를 한다. 명단은 대표의 칭호
 * 이야기를 잇는 사람들이어야 한다 — 그래서 같은 칭호로 좁힌다.
 *
 * 대표를 뽑는 pool은 그대로 칭호 무관 전체다(누가 대표가 될 차례인지는 회전 원칙대로).
 * 바뀌는 건 대표가 정해진 **다음**의 others뿐이다.
 *
 * 회전이지 셔플이 아니다: 한 바퀴 완주마다 호출자가 pick을 +1 하면 전원이 빠짐없이
 * 돌아가며 대표가 된다(리드의 rotate 원칙 — story-lede.tsx의 rotate 주석 참조).
 */
export function pickTitleLead(
  pool: TitleLeadEntry[],
  pick: number,
): { lead: TitleLeadEntry; others: RecentTitleGrantPerson[] } | null {
  if (pool.length === 0) return null;
  const at = ((pick % pool.length) + pool.length) % pool.length;
  const lead = pool[at];
  const others = lead.title.grants.filter(
    (p) => p.mem_id !== lead.person.mem_id,
  );
  return { lead, others };
}

/**
 * 지면에 못 실은 **같은 칭호** 획득자 수 — `외 N명`. `shown`은 **대표 1명까지 포함한**
 * 노출 인원이다.
 *
 * `title.grant_cnt`(그 칭호의 30일 창 전체 수여 건수)로 센다 — `total_mem_cnt`(팀 전체,
 * 모든 칭호 합산 고유인원)를 쓰면 다른 칭호를 딴 사람까지 "외 N명"에 섞인다. others가
 * 같은 칭호로 좁혀진 지금은 남은 인원도 같은 칭호 기준이어야 앞뒤가 맞는다.
 *
 * `grants`가 칭호당 10건에서 잘려도 `grant_cnt`는 잘리지 않은 총원이라 정확하다
 * (§`RecentTitleRow.grant_cnt` 주석과 같은 이유).
 */
export function countTitleMoreMembers(
  title: RecentTitleRow,
  shown: number,
): number {
  return Math.max(0, title.grant_cnt - shown);
}

/** "최근 획득 N건" 팝오버 한 줄 — 칭호 하나(배지로 그릴 재료) + 그 칭호를 딴 이름들 */
export type TitleGrantSummary = {
  ttl_id: string;
  ttl_nm: string;
  /** `TitleBadge`의 `tooltip.desc`·`tooltip.visibility` 재료 — 지면·툴팁이 같은 게이트를
   *  타야 하므로(`resolveDescVisible`) row 원본 그대로 넘긴다. */
  ttl_desc: string | null;
  desc_visibility: RecentTitleRow["desc_visibility"];
  /** 이 칭호를 이 창에서 받은 사람 중 뷰어 본인이 있는가 — `desc_visibility: "held"` 게이트용 */
  isHeld: boolean;
  /** RPC가 실어준 이름(칭호당 최신 10명 상한) */
  names: string[];
  /** 10명 상한에서 잘린 나머지 — `grant_cnt`와 실린 이름 수의 차 */
  moreCount: number;
};

/**
 * "최근 획득 N건" 클릭 팝오버용 — 칭호별로 이름을 그대로 묶는다.
 *
 * 로스터(`pickTitleLead`의 others)와는 다른 용도다: 로스터는 "지금 뜬 대표와 같은 칭호"만
 * 좁혀 보여주지만, 이건 대표와 무관하게 **이 30일 창에 있었던 일 전체**를 조망한다.
 * RPC가 이미 칭호 단위로 묶어 주므로 사람 단위로 다시 풀지 않고 그대로 매핑한다.
 */
export function summarizeRecentTitleGrants(
  rows: RecentTitleRow[],
  myMemId: string | null,
): TitleGrantSummary[] {
  return rows.map((row) => ({
    ttl_id: row.ttl_id,
    ttl_nm: row.ttl_nm,
    ttl_desc: row.ttl_desc,
    desc_visibility: row.desc_visibility,
    isHeld: myMemId != null && row.grants.some((p) => p.mem_id === myMemId),
    names: row.grants.map((p) => p.mem_nm),
    moreCount: Math.max(0, row.grant_cnt - row.grants.length),
  }));
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
