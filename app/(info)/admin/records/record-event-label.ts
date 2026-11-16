import { normalizeCompEvtTypeKey } from "@/lib/comp-evt-type";
// 타입만 가져온다 — 그 모듈은 서버 전용(환경변수 검증)이라 값으로 부르면 클라이언트·테스트에서 터진다
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";

/**
 * 관리자 기록 목록의 종목 배지 — **스포츠 이름 · 저장된 종목 코드**(예: `트라이애슬론 · FULL`).
 *
 * 저장된 종목 코드만 찍으면 철인 풀(`FULL`)과 마라톤 풀(`FULL`)이 같은 배지라, 철인 기록이
 * 마라톤 칸에 섞였는지(#581) 관리자가 눈으로 가릴 수 없다. 대회의 스포츠(`comp_mst.comp_sprt_cd`)를
 * 같이 찍으면 같은 코드라도 어느 종목인지 갈린다. 코드는 저장된 값 그대로 둔다 — 고칠 대상을 찾는
 * 화면이라 변환된 이름보다 실제 값을 보여 주는 편이 맞다.
 * 스포츠 이름은 공통코드(`COMP_SPRT_CD`)에서 읽고, 없으면 코드 원문을 쓴다. 스포츠를 모르면 코드만.
 */
export function adminRecordEventLabel(
  cmmCdRows: readonly CachedCmmCdRow[],
  sprtCd: string | null | undefined,
  evtType: string,
): string {
  const code = normalizeCompEvtTypeKey(evtType) || "UNKNOWN";
  if (!sprtCd) return code;
  const sprtNm = cmmCdRows.find((r) => r.cd_grp_cd === "COMP_SPRT_CD" && r.cd === sprtCd)?.cd_nm ?? sprtCd;
  return `${sprtNm} · ${code}`;
}
