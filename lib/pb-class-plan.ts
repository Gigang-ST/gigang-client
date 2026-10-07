// lib/pb-class-plan.ts — PB 클래스 주차별 훈련표 기본값 + 안내 문구용 정적 정보
//
// 정본은 운영 레포 `project/261006_겨울10K-PB클래스/상세계획.md` §4(훈련팀)·§5(12주 훈련표).
// 앱에서는 프로젝트마다 `evt_pb_sess_plan`에 들어가고(관리자가 고칠 수 있다), 아래는 관리자
// 「기본 훈련표 불러오기」가 넣는 값이다. 「목적」은 계획서에 없던 칸이라 코칭 관점으로 채웠다 —
// 회원이 "오늘 이걸 왜 하지?"를 화면에서 바로 알게 하려는 것.

/** 회차 하나의 훈련 — sess_no 1~12는 그 주차 공식훈련, 13은 10K 측정 */
export type PbSessPlan = {
  sessNo: number;
  /** 단계 — 측정 · 기초 · 점검 · 강화 · 특화 · 마무리 */
  phaseNm: string;
  /** 제목 한 줄 */
  ttl: string;
  /** 38~50분 그룹 세션 */
  mainTxt: string;
  /** 첫 10K 그룹 세션 — 같은 세션을 P=6:00으로, 개수만 줄인다. 없으면 다른 그룹과 같음 */
  easyTxt: string | null;
  /** 이 훈련을 하는 이유 */
  purpTxt: string;
  /** 비고(행사·주의사항 등) */
  noteTxt: string | null;
};

export const PB_DEFAULT_SESS_PLANS: PbSessPlan[] = [
  {
    sessNo: 1,
    phaseNm: "측정",
    ttl: "킥오프 + 5K 타임트라이얼",
    mainTxt: "5K 타임트라이얼",
    easyTxt: null,
    purpTxt: "지금 내 실력을 잰다. 이 기록으로 훈련팀과 10K 목표를 정하고, 12주 뒤 얼마나 빨라졌는지 견줄 기준기록이 된다.",
    noteTxt: "기준기록 → 훈련팀·목표",
  },
  {
    sessNo: 2,
    phaseNm: "기초",
    ttl: "400m 반복",
    mainTxt: "8 × 400m @ P-15초 / 200m 조깅",
    easyTxt: "6 × 400m",
    purpTxt: "목표보다 조금 빠른 속도에 다리를 익힌다. 짧게 끊어서 자세가 무너지기 전에 끝내는 스피드 감각 훈련.",
    noteTxt: "게임팀 발표",
  },
  {
    sessNo: 3,
    phaseNm: "기초",
    ttl: "언덕 반복",
    mainTxt: "언덕 반복 8 × 60~90초",
    easyTxt: "6회",
    purpTxt: "오르막이 다리 근력과 팔치기·발 디딤을 저절로 고쳐 준다. 평지 인터벌보다 부상 부담이 적은 '근력 스피드'.",
    noteTxt: "장소 이동",
  },
  {
    sessNo: 4,
    phaseNm: "기초",
    ttl: "템포런",
    mainTxt: "템포 20분 @ P+15초",
    easyTxt: "15분",
    purpTxt: "숨이 차기 직전의 속도(젖산역치)를 오래 버티는 힘을 기른다. 10K 기록을 끌어올리는 엔진.",
    noteTxt: null,
  },
  {
    sessNo: 5,
    phaseNm: "기초",
    ttl: "크루즈 인터벌",
    mainTxt: "크루즈 3 × 1.6km @ P+10초",
    easyTxt: "2 × 1.6km",
    purpTxt: "역치 속도를 조각내 템포런보다 조금 빠르게, 더 많이 쌓는다. 지난주 템포의 다음 계단.",
    noteTxt: null,
  },
  {
    sessNo: 6,
    phaseNm: "점검",
    ttl: "5K 타임트라이얼 (중간점검)",
    mainTxt: "5K 타임트라이얼",
    easyTxt: null,
    purpTxt: "6주 동안 얼마나 빨라졌는지 확인한다. 기준기록 대비 향상 점수가 붙고, 필요하면 훈련팀을 다시 나눈다.",
    noteTxt: "재배정 · 향상 점수",
  },
  {
    sessNo: 7,
    phaseNm: "강화",
    ttl: "800m 반복",
    mainTxt: "6 × 800m @ P-10초 / 400m 조깅",
    easyTxt: "4 × 800m",
    purpTxt: "심폐의 천장(최대산소섭취량)을 올린다. 천장이 높아지면 목표 페이스가 상대적으로 편해진다.",
    noteTxt: null,
  },
  {
    sessNo: 8,
    phaseNm: "강화",
    ttl: "템포 2세트",
    mainTxt: "템포 2 × 12분 @ P+10초",
    easyTxt: "2 × 10분",
    purpTxt: "4주차보다 빠른 역치 속도를 두 번에 나눠 버틴다. 연말이라 부담은 낮추고 감각은 이어 간다.",
    noteTxt: "연말 주간",
  },
  {
    sessNo: 9,
    phaseNm: "강화",
    ttl: "파틀렉",
    mainTxt: "파틀렉 30분 (1분 빠르게 / 1분 편하게)",
    easyTxt: "25분",
    purpTxt: "빠르게·편하게를 번갈아 속도 전환에 몸을 적응시킨다. 레이스 중 치고 나갔다 리듬을 되찾는 연습.",
    noteTxt: "올해 마지막 런",
  },
  {
    sessNo: 10,
    phaseNm: "특화",
    ttl: "2km 레이스 페이스",
    mainTxt: "3 × 2km @ P / 600m 조깅",
    easyTxt: "2 × 2km",
    purpTxt: "목표 페이스로 긴 구간을 버티는 레이스 지구력. 여기부터는 '목표 속도 그 자체'를 몸에 쌓는다.",
    noteTxt: null,
  },
  {
    sessNo: 11,
    phaseNm: "특화",
    ttl: "1km 레이스 페이스",
    mainTxt: "4 × 1km @ P",
    easyTxt: "3 × 1km",
    purpTxt: "시계를 안 봐도 목표 페이스를 맞추는 감각을 새긴다. 레이스 초반 오버페이스를 막는 연습.",
    noteTxt: null,
  },
  {
    sessNo: 12,
    phaseNm: "마무리",
    ttl: "레이스 리허설",
    mainTxt: "레이스 리허설 6km @ P",
    easyTxt: "4km @ P",
    purpTxt: "실전처럼 달려 페이스 배분·복장·보급을 점검한다. 이제부터는 피로를 빼고 측정일에 맞춘다.",
    noteTxt: "마지막 공식훈련",
  },
  {
    sessNo: 13,
    phaseNm: "측정",
    ttl: "10K 타임트라이얼",
    mainTxt: "10K 타임트라이얼",
    easyTxt: null,
    purpTxt: "12주의 결과를 확인하는 날. 최종 기록으로 목표 달성과 향상 점수를 매긴다. 대구를 안 뛰어도 여기서 판정받는다.",
    noteTxt: "13번째 회차 · 보증금 출석 포함",
  },
];

/** 훈련표 머리말 — 모든 세션에 공통으로 붙는 것 */
export const PB_PLAN_NOTES = [
  "P = 내 목표 10K 페이스. 첫 10K 그룹은 6:00/km.",
  "모든 세션은 워밍업 2~3km + 드릴 + 쿨다운 1~2km를 앞뒤로 붙인다.",
  "개인 이지런·롱런은 각자 — 권장하지만 출석으로 인정하지 않는다.",
];

/**
 * 훈련팀 — **목표 시간으로 부른다**(오너 지시 2026-10-07: "트레이닝그룹 ABCD는 목표 시간으로 불러라").
 * A~E는 DB(`evt_pb_prt_rel.trn_grp_cd`)에 남는 내부 코드일 뿐, 화면엔 `nm`이 나간다.
 * 안내엔 10K 목표기록과 대회 페이스만 적는다(주간거리는 걷었다).
 */
export type PbTrnGroup = {
  /** 내부 코드 — trn_grp_cd */
  cd: string;
  /** 화면 이름 */
  nm: string;
  /** 10K 목표기록 상한(초) */
  goalSec: number;
  /** 대회 페이스(목표기록 ÷ 10) */
  paceTxt: string;
};

export const PB_TRN_GROUPS: PbTrnGroup[] = [
  { cd: "A", nm: "38분 이하", goalSec: 38 * 60, paceTxt: "3:48/km" },
  { cd: "B", nm: "40분 이하", goalSec: 40 * 60, paceTxt: "4:00/km" },
  { cd: "C", nm: "45분 이하", goalSec: 45 * 60, paceTxt: "4:30/km" },
  { cd: "D", nm: "50분 이하", goalSec: 50 * 60, paceTxt: "5:00/km" },
  { cd: "E", nm: "첫 10K · 60분 이하", goalSec: 60 * 60, paceTxt: "6:00/km" },
];

/** 훈련팀 코드 → 화면 이름. 목록에 없는 코드(운영진이 D1·D2처럼 쪼갠 경우)는 코드 그대로 */
export function trnGroupNm(cd: string | null | undefined): string | null {
  if (!cd) return null;
  return PB_TRN_GROUPS.find((g) => g.cd === cd)?.nm ?? cd;
}

/** 첫 10K 그룹인가 — 훈련표에서 E 세션을 먼저 보여 줄지 */
export const PB_FIRST_10K_GROUP_CD = "E";
