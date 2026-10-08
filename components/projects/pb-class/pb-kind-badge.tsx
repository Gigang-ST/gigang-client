import {
  PB_DEFAULT_SESS_PLANS,
  PB_TRN_KIND_CDS,
  PB_TRN_KINDS,
  type PbTrnKindCd,
} from "@/lib/pb-class-plan";
import { cn } from "@/lib/utils";

/**
 * 훈련 종류(trn_kind_cd) → 톤. 예전 「단계」 배지(기초→점검→강화→특화→마무리)를 대신한다 —
 * 단계는 12주 흐름을 말했지만 회차마다 무엇을 하는지는 말하지 못했고, 목적 문장은 다 "10K 단축"으로 읽혔다.
 *
 * - 색은 토큰만 쓰고 **이름을 항상 글자로 같이 적는다**(색만으로 구분하지 않는다 — 8색은 외울 수 없다).
 * - 기록 측정은 훈련이 아니라 **시험 날**이라 유일하게 반전(칠한) 칩이다. 레일 점도 네모로 세운다.
 * - 레이스 페이스는 「정확히 P」라 P를 칠하는 primary 를 쓴다 — 화면에서 primary 숫자는 늘 「내 P」다.
 * - 테이퍼는 양을 빼는 주라 색을 빼서(중립) 말한다.
 * - 파틀렉의 노랑(트레일 토큰)은 밝아서 글자로 칠하면 흰 지면에서 안 읽힌다 — 바탕만 칠하고 글자는 foreground.
 *   남색(사이클)도 써 봤는데 10% 바탕이 회색으로 떠 테이퍼(중립)와 구분이 안 됐다.
 * Tailwind 는 클래스를 문자열 그대로 스캔하므로 조립하지 않고 통째로 적는다.
 */
const KIND_TONE: Record<PbTrnKindCd, { chip: string; bar: string }> = {
  TT: { chip: "bg-foreground text-background", bar: "border-foreground/60" },
  FART: { chip: "bg-sport-trail-run/25 text-foreground", bar: "border-sport-trail-run" },
  HILL: { chip: "bg-success/10 text-success", bar: "border-success/50" },
  SPD: { chip: "bg-warning/15 text-warning", bar: "border-warning/60" },
  THR: { chip: "bg-sport-triathlon/10 text-sport-triathlon", bar: "border-sport-triathlon/50" },
  VO2: { chip: "bg-sport-road-run/15 text-sport-road-run", bar: "border-sport-road-run/50" },
  RACE: { chip: "bg-primary/10 text-primary", bar: "border-primary/50" },
  TAPER: { chip: "bg-secondary text-muted-foreground", bar: "border-muted-foreground/40" },
};

export type PbTrnKind = (typeof PB_TRN_KINDS)[PbTrnKindCd] & { cd: PbTrnKindCd };

/**
 * 코드 → 종류. 모르는 코드면 null — DB 체크 제약이 늘어 화면보다 먼저 새 종류가 들어와도
 * `PB_TRN_KINDS[cd].nm` 에서 터지지 않고 그 칸만 비운다. `in` 은 프로토타입 키(toString 등)에도 참이라 목록으로 본다.
 */
export function pbTrnKindOf(cd: string | null | undefined): PbTrnKind | null {
  if (!cd || !(PB_TRN_KIND_CDS as readonly string[]).includes(cd)) return null;
  const kindCd = cd as PbTrnKindCd;
  return { cd: kindCd, ...PB_TRN_KINDS[kindCd] };
}

/** 종류 설명 칸의 왼쪽 띠 색 — 칩과 같은 톤이라 접힌 줄의 칩과 펼친 칸의 설명이 한 벌로 읽힌다 */
export function pbKindBarClass(cd: PbTrnKindCd): string {
  return KIND_TONE[cd].bar;
}

/**
 * 안내 탭에 늘어놓는 순서 — **기본 훈련표에 처음 나오는 순서**(기록 측정 → 파틀렉 → 업힐 → …).
 * 12주를 따라 읽히게 하려는 것. 기본표에 안 쓰인 종류가 생겨도 빠지지 않게 사전 순서로 뒤에 붙인다.
 */
export const PB_TRN_KIND_ORDER: PbTrnKindCd[] = [
  ...new Set<PbTrnKindCd>([...PB_DEFAULT_SESS_PLANS.map((p) => p.kindCd), ...PB_TRN_KIND_CDS]),
];

export function PbKindBadge({ kindCd, className }: { kindCd: string; className?: string }) {
  const kind = pbTrnKindOf(kindCd);
  if (!kind) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold leading-none",
        KIND_TONE[kind.cd].chip,
        className,
      )}
    >
      {kind.nm}
    </span>
  );
}
