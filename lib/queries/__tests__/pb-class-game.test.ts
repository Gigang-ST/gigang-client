/**
 * 겨울 10K PB 클래스 2·3단계 조회 코어의 조립 경계 — DB 없이 `assembleGame`·`scoreWindow`만 돌린다.
 * loader(`loadPbGame`)는 얇은 fetch 라 여기서 다루지 않는다(임베디드 조인·1,000행 페이징은 가짜 DB 로
 * 흉내 내면 가짜가 맞는 걸 검증하게 된다 — `lib/queries/__tests__/pb-class.test.ts`와 같은 이유).
 * 점수 산식 자체는 `lib/__tests__/pb-class-score.test.ts`가 맡는다 — 여기선 **행을 점수 입력으로 옮기는 경계**만 본다.
 */
import { describe, expect, it } from "vitest";

import { PB_DEFAULT_RULE } from "@/lib/pb-class-score";
import type { PbAttdRow, PbEvtRow, PbLinkRow } from "@/lib/queries/pb-class";
import {
  assembleGame,
  scoreWindow,
  type PbGamePrtRow,
  type PbGthrRow,
  type PbGrpRow,
  type PbMsnRow,
  type PbRecRow,
} from "@/lib/queries/pb-class-game";

const EVT: PbEvtRow = {
  evt_id: "evt1",
  evt_nm: "겨울 10K PB 클래스",
  stt_dt: "2026-11-04", // W1 = 수요일
  end_dt: "2027-02-10",
  stts_enm: "ACTIVE",
};

/** 11/19 09:00 KST — W1·W2·W3(11/18) 훈련은 열렸고 11/25 벙은 아직 */
const NOW = "2026-11-19T00:00:00Z";

const link = (gthrId: string, wkNo: number, sttAt: string, extra: Partial<PbLinkRow> = {}): PbLinkRow => ({
  gthr_id: gthrId,
  wk_no: wkNo,
  sess_type_cd: "TRAINING",
  gthr_nm: `W${wkNo}`,
  stt_at: sttAt,
  del_yn: false,
  ...extra,
});

const LINKS: PbLinkRow[] = [
  link("t1", 1, "2026-11-04T10:30:00Z"),
  link("t2", 2, "2026-11-11T10:30:00Z"),
  link("t3", 3, "2026-11-18T10:30:00Z"),
  link("m", 14, "2027-02-03T10:30:00Z", { sess_type_cd: "MEASURE", gthr_nm: "10K 측정" }),
];

const prt = (memId: string, memNm: string, extra: Partial<PbGamePrtRow> = {}): PbGamePrtRow => ({
  prt_id: `prt-${memId}`,
  mem_id: memId,
  join_wk_no: 1,
  deposit_amt: 30_000,
  deposit_dc_amt: 0,
  entry_fee_amt: 10_000,
  aprv_yn: true,
  aprv_at: "2026-11-01T00:00:00Z",
  mem_nm: memNm,
  avatar_url: null,
  trn_grp_cd: null,
  grp_id: "g1",
  goal_sec: null,
  ...extra,
});

const gthr = (gthrId: string, sttAt: string, extra: Partial<PbGthrRow> = {}): PbGthrRow => ({
  gthr_id: gthrId,
  stt_at: sttAt,
  del_yn: false,
  crt_by: "a",
  ...extra,
});

const attd = (gthrId: string, ...memIds: string[]): PbAttdRow[] =>
  memIds.map((m) => ({ gthr_id: gthrId, mem_id: m }));

const GRPS: PbGrpRow[] = [
  { grp_id: "g2", grp_nm: "나팀", color_no: 2, sort_ord: 1 },
  { grp_id: "g1", grp_nm: "가팀", color_no: 1, sort_ord: 0 },
];

const MSNS: PbMsnRow[] = [
  { msn_id: "m-none", wk_no: null, msn_nm: "측정 전원 완주", pt: 30, sort_ord: 0 },
  { msn_id: "m-w4", wk_no: 4, msn_nm: "포즈 사진", pt: 10, sort_ord: 1 },
  { msn_id: "m-w2b", wk_no: 2, msn_nm: "팀 결성(뒤)", pt: 10, sort_ord: 5 },
  { msn_id: "m-w2a", wk_no: 2, msn_nm: "팀 결성(앞)", pt: 10, sort_ord: 1 },
];

const base = () => ({
  evt: EVT,
  cfgRow: null,
  links: LINKS,
  prts: [
    prt("a", "가나"),
    prt("b", "나다", { join_wk_no: 2 }),
    // 입금 대기 — 같은 팀(g1)에 있지만 점수판·팀 분모에 끼면 안 된다
    prt("c", "다라", { aprv_yn: false, aprv_at: null }),
    // W6 합류 = 늦은 합류(팀전 제외)
    prt("d", "라마", { join_wk_no: 6, deposit_amt: 0 }),
  ],
  recs: [] as PbRecRow[],
  grps: GRPS,
  msns: MSNS,
  msnRslts: [{ msn_id: "m-w2a", grp_id: "g1" }],
  gthrs: [
    gthr("t1", "2026-11-04T10:30:00Z"),
    gthr("t2", "2026-11-11T10:30:00Z"),
    gthr("t3", "2026-11-18T10:30:00Z"),
    // 연결 안 된 벙(W1) — a 가 열고 3명 참석 → 일정 참여·개설 점수
    gthr("u1", "2026-11-10T10:30:00Z", { crt_by: "a" }),
    // 프로젝트 시작 전 / 아직 안 열림 / 삭제 — 셋 다 점수에 안 들어간다
    gthr("pre", "2026-11-02T10:30:00Z"),
    gthr("future", "2026-11-25T10:30:00Z"),
    gthr("gone", "2026-11-12T10:30:00Z", { del_yn: true }),
  ],
  attds: [
    ...attd("t1", "a", "c"),
    ...attd("t2", "a", "b"),
    ...attd("t3", "a", "b"),
    ...attd("u1", "a", "b", "c"),
    ...attd("pre", "a"),
    ...attd("future", "a"),
    ...attd("gone", "a"),
  ],
  nowIso: NOW,
});

describe("assembleGame — 참가자·점수판 경계", () => {
  const game = assembleGame(base());

  it("참가자는 승인 대기자까지 전원, 이름순(한글)이다", () => {
    expect(game.participants.map((p) => p.memNm)).toEqual(["가나", "나다", "다라", "라마"]);
    expect(game.participants.find((p) => p.memId === "c")?.aprvYn).toBe(false);
  });

  it("늦은 합류(W6+)만 late 이고 값은 cfg 의 늦은 합류 주차를 따른다", () => {
    const late = Object.fromEntries(game.participants.map((p) => [p.memId, p.late]));
    expect(late).toEqual({ a: false, b: false, c: false, d: true });
  });

  it("점수판엔 승인된 참가자만 들어간다(대기자 제외)", () => {
    expect(game.scoreboard.members.map((m) => m.memId).sort()).toEqual(["a", "b", "d"]);
  });

  it("대기자가 팀 분모·전원 출석 판정에 끼지 않는다", () => {
    const g1 = game.scoreboard.groups.find((g) => g.grpId === "g1")!;
    // 대기자 c(W1 합류, 출석 t1 만)가 팀원으로 잡혔다면 W2·W3 전원 출석이 깨지고 memberCnt 가 3 이다
    expect(g1.memberCnt).toBe(2);
    expect(g1.allAttendWeeks).toEqual([1, 2, 3]);
  });

  it("점수: 열린 벙·합류 후·삭제 안 된 것만 센다", () => {
    const a = game.scoreboard.members.find((m) => m.memId === "a")!;
    // 훈련 3회 30 + 일정 참여 3 + 개설 5(본인 포함 3명). 시작 전·미개최·삭제 벙은 0
    expect(a.byCd).toMatchObject({ ATTEND: 30, JOIN: 3, HOST: 5 });
    expect(a.total).toBe(38);
    const b = game.scoreboard.members.find((m) => m.memId === "b")!;
    expect(b.total).toBe(20); // W1 벙(u1)은 합류(W2) 전이라 안 센다
    const d = game.scoreboard.members.find((m) => m.memId === "d")!;
    expect(d).toMatchObject({ inGame: false, total: 0 });
  });

  it("팀 점수 = 주차별 평균 합 + 전원 출석 보너스 + 미션, 팀·미션은 정렬돼 나온다", () => {
    const g1 = game.scoreboard.groups.find((g) => g.grpId === "g1")!;
    // W1 18(a 만 등록) + W2 10 + W3 10 = 38, 전원 출석 3주 × 20 = 60, 미션 m-w2a 10
    expect(g1).toMatchObject({ avgSum: 38, allAttendBonus: 60, missionBonus: 10, total: 108, rank: 1 });
    expect(game.groups.map((g) => g.grpNm)).toEqual(["가팀", "나팀"]); // sort_ord 순
    // 주차 오름차순(없는 주차는 맨 뒤), 같은 주차는 sort_ord
    expect(game.missions.map((m) => m.msnId)).toEqual(["m-w2a", "m-w2b", "m-w4", "m-none"]);
    expect(game.missions[0].succGrpIds).toEqual(["g1"]);
    expect(game.missions[1].succGrpIds).toEqual([]);
  });

  it("이름·주차·현재 주차를 채운다", () => {
    expect(game.evt).toMatchObject({ evtId: "evt1", sttDt: "2026-11-04" });
    expect(game.currentWkNo).toBe(3); // 11/19 KST = W3
    expect(game.rule).toEqual(PB_DEFAULT_RULE);
  });
});

describe("assembleGame — 측정 주차·기록", () => {
  it("측정 벙이 연결되면 그 wk_no, 없으면 null", () => {
    expect(assembleGame(base()).measureWkNo).toBe(14);
    expect(assembleGame({ ...base(), links: LINKS.filter((l) => l.sess_type_cd !== "MEASURE") }).measureWkNo).toBeNull();
  });

  const recs: PbRecRow[] = [
    { prt_id: "prt-a", rec_type_cd: "BASE_5K", rec_sec: 1500, cnfm_yn: true },
    { prt_id: "prt-a", rec_type_cd: "FINAL_10K", rec_sec: 3000, cnfm_yn: true },
    // 확인 전 기록 — 점수·달성에 안 쓰인다
    { prt_id: "prt-b", rec_type_cd: "FINAL_10K", rec_sec: 2000, cnfm_yn: false },
    // 모르는 종류는 조용히 버린다(DB CHECK 가 막지만 타입은 string)
    { prt_id: "prt-a", rec_type_cd: "WEIRD", rec_sec: 1, cnfm_yn: true },
  ];

  it("기록을 참가자별로 묶어 점수에 넘기고 미확인 기록은 점수에서 뺀다", () => {
    const game = assembleGame({
      ...base(),
      recs,
      prts: [prt("a", "가나", { goal_sec: 3100 }), prt("b", "나다", { goal_sec: 2500 })],
    });
    const a = game.participants.find((p) => p.memId === "a")!;
    expect(a.recs).toEqual({ BASE_5K: { sec: 1500, cnfm: true }, FINAL_10K: { sec: 3000, cnfm: true } });
    const sa = game.scoreboard.members.find((m) => m.memId === "a")!;
    // 1500×2.085=3127.5 → 3000 은 4.08% 단축 → 4×3=12, 목표(3100) 이내 → 20
    expect(sa.byCd).toMatchObject({ IMPROVE_FINAL: 12, GOAL: 20 });
    expect(sa.goalAchieved).toBe(true);
    const sb = game.scoreboard.members.find((m) => m.memId === "b")!;
    expect(sb.byCd.GOAL).toBe(0);
    expect(sb.goalAchieved).toBe(false);
  });

  it("측정이 연결되기 전엔 최종 기록 점수가 붙지 않는다", () => {
    const game = assembleGame({
      ...base(),
      recs,
      links: LINKS.filter((l) => l.sess_type_cd !== "MEASURE"),
      prts: [prt("a", "가나", { goal_sec: 3100 })],
    });
    const sa = game.scoreboard.members.find((m) => m.memId === "a")!;
    expect(sa.byCd).toMatchObject({ IMPROVE_FINAL: 0, GOAL: 0 });
  });

  it("규칙(rule_json)은 기본값에 덮어 읽는다", () => {
    const cfgRow = {
      evt_id: "evt1",
      tot_sess_cnt: 13,
      full_rfnd_attd_cnt: 9,
      late_join_wk_no: 6,
      deposit_amt: 30_000,
      entry_fee_amt: 10_000,
      mlg_dc_amt: 5_000,
      rule_json: { pt: { attend: 7 }, goalMaxSec: 3300 },
      created_at: "",
      updated_at: "",
    };
    const game = assembleGame({ ...base(), cfgRow });
    expect(game.rule.pt.attend).toBe(7);
    expect(game.rule.pt.join).toBe(PB_DEFAULT_RULE.pt.join); // 빠진 키는 기본값
    expect(game.rule.goalMaxSec).toBe(3300);
  });
});

describe("scoreWindow — 점수 대상 벙의 시간 창", () => {
  it("측정 벙이 있으면 그 벙이 열린 KST 날의 끝까지", () => {
    expect(scoreWindow(EVT, LINKS)).toEqual({
      startIso: "2026-11-03T15:00:00.000Z", // 11/4 00:00 KST
      endExclIso: "2027-02-03T15:00:00.000Z", // 2/4 00:00 KST (측정 2/3 19:30 KST 의 다음 자정)
    });
  });

  it("측정이 없으면 프로젝트 종료일 끝까지", () => {
    expect(scoreWindow(EVT, LINKS.filter((l) => l.sess_type_cd !== "MEASURE")).endExclIso).toBe(
      "2027-02-10T15:00:00.000Z",
    );
  });

  it("측정 벙이 취소(삭제)됐으면 종료일로 물러난다", () => {
    const canceled = LINKS.map((l) => (l.sess_type_cd === "MEASURE" ? { ...l, del_yn: true } : l));
    expect(scoreWindow(EVT, canceled).endExclIso).toBe("2027-02-10T15:00:00.000Z");
  });

  it("KST 자정을 넘기는 UTC 시각도 KST 날짜로 끊는다", () => {
    // 2/3 16:00 UTC = 2/4 01:00 KST → 그 날은 2/4 라 끝은 2/5 00:00 KST
    const links = [link("m", 14, "2027-02-03T16:00:00Z", { sess_type_cd: "MEASURE" })];
    expect(scoreWindow(EVT, links).endExclIso).toBe("2027-02-04T15:00:00.000Z");
  });
});
