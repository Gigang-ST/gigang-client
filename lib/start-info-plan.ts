import {
  hasStartInfo,
  START_REC_DIST_CODES,
  type StartInfoSrcCode,
  type StartInfoValues,
} from "@/lib/validations/start-info";

/** 지금 DB에 있는 시작 정보 — `hadBefore` 는 "처음 입력한 시각이 있나" */
export type StartInfoExisting = { hadBefore: boolean; values: StartInfoValues };

export type StartInfoPlan =
  | { skip: true }
  | {
      skip: false;
      /** mem_onbd_prf 에 쓸 값. `first` 면 출처·처음 입력 시각도 함께 적는다(이미 있으면 보존) */
      prf: { runCareerCd: StartInfoValues["runCareerCd"]; wklyDistCd: StartInfoValues["wklyDistCd"]; recNone: boolean; first: boolean };
      removed: StartInfoValues["records"][number]["distCd"][];
      inserts: StartInfoValues["records"];
      updates: StartInfoValues["records"];
    };

/**
 * 저장 계획 — DB 접근 없는 순수 함수라 분기를 테스트로 못박는다(`saveStartInfo` 가 실행만 한다).
 *
 * - 입력이 비어 있고 (가입 폼이거나 기존 값이 없다) → 아무것도 안 쓴다.
 *   프로필(`PROFILE`)에서 전부 비운 저장만 "비우기"로 반영한다.
 * - 프로필 저장: 입력이 곧 최종 값(기록은 입력에 없는 거리를 지운다).
 * - **가입 폼(`SIGNUP`)에서 기존 값이 있는 사람**(다른 팀 가입·재가입): 입력한 칸만 병합한다.
 *   안 채운 경력·주간 거리는 유지, 기록은 거리별로 입력한 것만 덮고 기존 기록은 지우지 않는다.
 */
export function planStartInfoSave(
  existing: StartInfoExisting,
  input: StartInfoValues,
  src: StartInfoSrcCode,
): StartInfoPlan {
  if (!hasStartInfo(input) && (src === "SIGNUP" || !existing.hadBefore)) return { skip: true };

  const merge = src === "SIGNUP" && existing.hadBefore;
  const prev = existing.values;

  let finalRecords = input.records;
  let recNone = input.recNone;
  let runCareerCd = input.runCareerCd;
  let wklyDistCd = input.wklyDistCd;
  if (merge) {
    runCareerCd = input.runCareerCd ?? prev.runCareerCd;
    wklyDistCd = input.wklyDistCd ?? prev.wklyDistCd;
    const byDist = new Map(prev.records.map((r) => [r.distCd, r]));
    for (const r of input.records) byDist.set(r.distCd, r);
    finalRecords = START_REC_DIST_CODES.flatMap((d) => (byDist.has(d) ? [byDist.get(d)!] : []));
    // 기록을 적었으면 "완주 못 해봄"은 해제, 새로 "못 해봄"만 골랐고 기존 기록이 없으면 켠다, 그 외엔 기존 유지
    recNone = input.records.length > 0 ? false : input.recNone ? prev.records.length === 0 : prev.recNone;
  }

  const prevByDist = new Map(prev.records.map((r) => [r.distCd, r.recSec]));
  const finalDists = new Set(finalRecords.map((r) => r.distCd));
  const removed = prev.records.map((r) => r.distCd).filter((d) => !finalDists.has(d));
  const inserts = finalRecords.filter((r) => !prevByDist.has(r.distCd));
  const updates = finalRecords.filter((r) => prevByDist.has(r.distCd) && prevByDist.get(r.distCd) !== r.recSec);

  return {
    skip: false,
    prf: { runCareerCd, wklyDistCd, recNone, first: !existing.hadBefore },
    removed,
    inserts,
    updates,
  };
}
