/**
 * 대회 등록 폼이 처음 켜 두는 종목(`comp_mst.comp_sprt_cd`).
 *
 * 이 정책을 한 곳에 둔 이유는 **등록 폼이 둘이기 때문이다** — 대회 등록 다이얼로그
 * (`components/races/competition-register-dialog.tsx`)와 캘린더 대회 추가
 * (`components/home/competition-picker-dialog.tsx`). 각자 계산하면 한쪽만 고쳐져 갈린다
 * (실제로 갈려 있었다).
 *
 * `lib/queries/cmm-cd-cached.ts`가 아니라 별도 모듈인 건 그쪽이 `lib/env.ts`를 끌어와서다 —
 * t3-env가 import 시점에 검증하므로 순수 함수인데도 테스트에서 못 불러온다.
 */

/** 크루 대회 대부분이 로드 러닝이라 이걸 기본으로 켠다. */
export const PREFERRED_COMP_SPRT_CD = "road_run";

/**
 * 종목 셀렉트의 기본 선택값. `cmmCdRowsForGrp(rows, "COMP_SPRT_CD")` 결과를 그대로 넘긴다.
 *
 * **`sort_ord` 첫 항목을 쓰지 않는다.** 공통코드 정렬은 *표시 순서*를 위한 것이지
 * "가장 흔한 종목" 순이 아니다. 첫 줄이 울트라마라톤이면 등록 폼이 울트라로 열리는데,
 * 이건 에러가 아니라 기본값이 이상한 것뿐이라 **등록해 보기 전엔 아무도 모른다.**
 *
 * 목록이 비었을 때만 빈 문자열로 물러난다: 공통코드를 못 불러온 상황에서 선택지에 없는
 * 값을 켜 두면 화면엔 빈칸인데 폼엔 값이 있는 상태가 된다.
 */
export function defaultCompSprtCd(options: readonly { cd: string }[]): string {
  return options.find((o) => o.cd === PREFERRED_COMP_SPRT_CD)?.cd ?? options[0]?.cd ?? "";
}
