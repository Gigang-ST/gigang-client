import { normalizePayerName, stripPayerSuffix } from "@/lib/dues/normalize-payer-name";

export type MemberRef = { memId: string; name: string };
export type AliasRef = { rawNameNorm: string; memId: string };
export type MatchCandidate = { memId: string; name: string; score: number };
export type MatchStatus = "matched" | "ambiguous" | "unmatched";
export type MatchResult = {
  status: MatchStatus;
  memId: string | null;
  via: "alias" | "exact" | "suffix" | null;
  candidates: MatchCandidate[];
};

const MAX_CANDIDATES = 5;

export function matchPayer(rawName: string, members: MemberRef[], aliases: AliasRef[]): MatchResult {
  const norm = normalizePayerName(rawName);
  if (!norm) return { status: "unmatched", memId: null, via: null, candidates: [] };

  // (1) 별칭 정확일치 — 원문 정규화값 먼저, 그다음 꼬리말 뗀 값(이름 기억은 꼬리말 없는 이름으로 저장돼 있을 수 있다)
  const stripped = stripPayerSuffix(norm);
  for (const key of stripped !== norm ? [norm, stripped] : [norm]) {
    const aliasHits = [...new Set(aliases.filter((a) => a.rawNameNorm === key).map((a) => a.memId))];
    if (aliasHits.length === 1) {
      const m = members.find((x) => x.memId === aliasHits[0]);
      return {
        status: "matched", memId: aliasHits[0], via: "alias",
        candidates: m ? [{ memId: m.memId, name: m.name, score: 1 }] : [],
      };
    }
  }

  // 회원 정규화 캐시
  const normed = members.map((m) => ({ ...m, norm: normalizePayerName(m.name) }));

  // (2) 실명 정확일치
  const exact = normed.filter((m) => m.norm === norm);
  if (exact.length === 1) {
    return {
      status: "matched", memId: exact[0].memId, via: "exact",
      candidates: [{ memId: exact[0].memId, name: exact[0].name, score: 1 }],
    };
  }
  if (exact.length > 1) {
    return {
      status: "ambiguous", memId: null, via: null,
      candidates: exact.map((m) => ({ memId: m.memId, name: m.name, score: 1 })),
    };
  }

  // (2.5) 꼬리말(기강회비·회비 선금 등) 제거 후 실명 정확일치 — 단일일 때만 자동.
  //       동명이인(2명 이상)은 자동 확정하지 않고 후보와 함께 확인필요로 둔다.
  if (stripped !== norm) {
    const sufHits = normed.filter((m) => m.norm === stripped);
    if (sufHits.length === 1) {
      return {
        status: "matched", memId: sufHits[0].memId, via: "suffix",
        candidates: [{ memId: sufHits[0].memId, name: sufHits[0].name, score: 1 }],
      };
    }
    if (sufHits.length > 1) {
      return {
        status: "ambiguous", memId: null, via: null,
        candidates: sufHits.map((m) => ({ memId: m.memId, name: m.name, score: 1 })),
      };
    }
  }

  // (3) 부분 포함(양방향) → 후보 제시(자동 확정 안 함)
  const partial = normed
    .filter((m) => m.norm.length > 0 && (norm.includes(m.norm) || m.norm.includes(norm)))
    .map((m) => {
      const shorter = Math.min(m.norm.length, norm.length);
      const longer = Math.max(m.norm.length, norm.length);
      return { memId: m.memId, name: m.name, score: 0.6 + 0.4 * (shorter / longer) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  return { status: "unmatched", memId: null, via: null, candidates: partial };
}
