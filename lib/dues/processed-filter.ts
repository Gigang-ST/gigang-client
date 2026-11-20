/**
 * 처리됨 목록 필터·페이지 — URL 쿼리(`?pf=&pt=&pm=&pi=&pp=`)와 서버 조회가 같은 규칙을 본다.
 * 순수 함수라 화면·조회·테스트가 공유한다. 잘못된 값은 조용히 버려 기본(전체·1쪽)으로 돌아간다.
 */

/** 한 쪽 건수 — 화면·전송량을 지키되 200건 한계는 쪽 넘김으로 푼다. */
export const PROCESSED_PAGE_SIZE = 50;

export type ProcessedFilter = {
  /** 거래일 시작(YYYY-MM-DD, 포함) */
  from: string | null;
  /** 거래일 끝(YYYY-MM-DD, 포함) */
  to: string | null;
  /** 매칭 회원 */
  memId: string | null;
  /** 분류(FEE_ITEM_CD) */
  itemCd: string | null;
  /** 1부터 */
  page: number;
};

export const PROCESSED_QUERY_KEYS = {
  from: "pf",
  to: "pt",
  memId: "pm",
  itemCd: "pi",
  page: "pp",
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CD_RE = /^[A-Za-z0-9_]{1,40}$/;

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : null;
}

function validDate(s: string | null): string | null {
  if (!s || !DATE_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}

export function parseProcessedFilter(params: RawParams): ProcessedFilter {
  let from = validDate(first(params[PROCESSED_QUERY_KEYS.from]));
  let to = validDate(first(params[PROCESSED_QUERY_KEYS.to]));
  // 거꾸로 넣으면 결과가 비는 대신 뒤집어 준다
  if (from && to && from > to) [from, to] = [to, from];
  const memRaw = first(params[PROCESSED_QUERY_KEYS.memId]);
  const itemRaw = first(params[PROCESSED_QUERY_KEYS.itemCd]);
  const pageNum = Number(first(params[PROCESSED_QUERY_KEYS.page]));
  return {
    from,
    to,
    memId: memRaw && UUID_RE.test(memRaw) ? memRaw : null,
    itemCd: itemRaw && CD_RE.test(itemRaw) ? itemRaw : null,
    page: Number.isInteger(pageNum) && pageNum >= 1 ? pageNum : 1,
  };
}

/** 현재 필터를 쿼리 문자열로 — 기본값(빈 필터·1쪽)은 싣지 않는다. */
export function processedFilterToQuery(f: ProcessedFilter): string {
  const p = new URLSearchParams();
  if (f.from) p.set(PROCESSED_QUERY_KEYS.from, f.from);
  if (f.to) p.set(PROCESSED_QUERY_KEYS.to, f.to);
  if (f.memId) p.set(PROCESSED_QUERY_KEYS.memId, f.memId);
  if (f.itemCd) p.set(PROCESSED_QUERY_KEYS.itemCd, f.itemCd);
  if (f.page > 1) p.set(PROCESSED_QUERY_KEYS.page, String(f.page));
  return p.toString();
}

export function processedPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PROCESSED_PAGE_SIZE));
}

export function isProcessedFilterActive(f: ProcessedFilter): boolean {
  return Boolean(f.from || f.to || f.memId || f.itemCd);
}
