/**
 * 겨울 10K PB 클래스 조회 코어의 조립 경계 — DB 없이 `assemble*`만 돌린다.
 * loader(`loadPbClassBoard`·`loadMyPbClass`)는 얇은 fetch 라 여기서 다루지 않는다:
 * 금전·출석 판정은 전부 조립 쪽에 있고, 임베디드 조인·1,000행 페이징은 가짜 DB 로 흉내 내면
 * 오히려 가짜가 맞는 걸 검증하게 된다(fetchAllRows 자체는 lib/supabase/__tests__/fetch-all.test.ts).
 */
import { describe, expect, it } from "vitest";

import { PB_CLASS_DEFAULT_CFG } from "@/lib/pb-class";
import {
  assembleBoard,
  assembleMyPbClass,
  cfgFromRow,
  isMileageAlumni,
  mileageAlumniSet,
  type PbAttdRow,
  type PbEvtRow,
  type PbLinkRow,
  type PbPrtRow,
  type PbSessPlanRow,
  toSessPlans,
} from "@/lib/queries/pb-class";

const EVT: PbEvtRow = {
  evt_id: "evt1",
  evt_nm: "겨울 10K PB 클래스",
  stt_dt: "2026-11-04", // W1 = 수요일
  end_dt: "2027-02-10",
  stts_enm: "ACTIVE",
};

/** 11/12 09:00 KST — W1(11/4)·W2(11/11)는 열렸고 W3(11/18)는 아직 */
const NOW = "2026-11-12T00:00:00Z";

const link = (gthrId: string, wkNo: number, sttAt: string, extra: Partial<PbLinkRow> = {}): PbLinkRow => ({
  gthr_id: gthrId,
  wk_no: wkNo,
  sess_type_cd: "TRAINING",
  gthr_nm: `W${wkNo} 공식훈련`,
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

const prt = (memId: string, memNm: string, extra: Partial<PbPrtRow> = {}): PbPrtRow => ({
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
  ...extra,
});

const plan = (sessNo: number, extra: Partial<PbSessPlanRow> = {}): PbSessPlanRow => ({
  sess_no: sessNo,
  phase_nm: "기초",
  ttl: `${sessNo}회차 훈련`,
  main_txt: "본 훈련",
  easy_txt: null,
  purp_txt: "목적",
  note_txt: null,
  ...extra,
});

const attd = (memId: string, ...gthrIds: string[]): PbAttdRow[] =>
  gthrIds.map((g) => ({ gthr_id: g, mem_id: memId }));

describe("cfgFromRow", () => {
  it("행이 없으면 기본값(복사본)", () => {
    const cfg = cfgFromRow(null);
    expect(cfg).toEqual(PB_CLASS_DEFAULT_CFG);
    expect(cfg).not.toBe(PB_CLASS_DEFAULT_CFG); // 호출부가 고쳐도 기본값 상수가 오염되지 않게
  });

  it("DB 컬럼을 camelCase 설정으로 옮긴다", () => {
    expect(
      cfgFromRow({
        evt_id: "evt1",
        tot_sess_cnt: 10,
        full_rfnd_attd_cnt: 7,
        late_join_wk_no: 5,
        deposit_amt: 20_000,
        entry_fee_amt: 5_000,
        mlg_dc_amt: 3_000,
        rule_json: {},
        created_at: "",
        updated_at: "",
      }),
    ).toEqual({
      totSessCnt: 10,
      fullRfndAttdCnt: 7,
      lateJoinWkNo: 5,
      depositAmt: 20_000,
      entryFeeAmt: 5_000,
      mlgDcAmt: 3_000,
    });
  });

  it("행이 없을 때의 기본 마일리지런 할인은 5,000원", () => {
    expect(cfgFromRow(null).mlgDcAmt).toBe(5_000);
  });
});

/**
 * 마일리지런 이력 조회의 **조회 조건**을 못박는 가짜 DB.
 * 임베디드 조인 결과까지 흉내 내지는 않는다(가짜가 맞는 걸 검증하게 되므로) — 어떤 필터를 걸어 부르는지,
 * 청크·중복 제거·에러 전파가 맞는지만 본다. 실제 조인은 dev 에서 확인한다.
 */
type FakeCall = { table: string; ops: Array<[string, ...unknown[]]> };

function fakeDb(respond: (call: FakeCall) => { data: unknown[] | null; error: { message: string } | null }) {
  const calls: FakeCall[] = [];
  const db = {
    from(table: string) {
      const call: FakeCall = { table, ops: [] };
      calls.push(call);
      const q = {
        select: (...a: unknown[]) => (call.ops.push(["select", ...a]), q),
        eq: (...a: unknown[]) => (call.ops.push(["eq", ...a]), q),
        in: (...a: unknown[]) => (call.ops.push(["in", ...a]), q),
        order: (...a: unknown[]) => (call.ops.push(["order", ...a]), q),
        limit: (...a: unknown[]) => (call.ops.push(["limit", ...a]), q),
        // fetchAllRows 경로(.range) 와 limit(1) 직접 await 경로 둘 다 같은 응답을 준다
        range: () => Promise.resolve(respond(call)),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(respond(call)).then(res, rej),
      };
      return q;
    },
  };
  return { db: db as unknown as Parameters<typeof isMileageAlumni>[0], calls };
}

const hasOp = (call: FakeCall, ...op: unknown[]) =>
  call.ops.some((o) => o.length === op.length && o.every((v, i) => v === op[i]));

describe("isMileageAlumni", () => {
  it("같은 팀 MILEAGE_RUN 의 승인 행만 조건으로 건다 — 대기·다른 팀·다른 종류는 자격이 아니다", async () => {
    const { db, calls } = fakeDb(() => ({ data: [{ prt_id: "p1" }], error: null }));
    await expect(isMileageAlumni(db, "team-1", "mem-1")).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("evt_team_prt_rel");
    expect(hasOp(calls[0], "eq", "mem_id", "mem-1")).toBe(true);
    expect(hasOp(calls[0], "eq", "aprv_yn", true)).toBe(true);
    expect(hasOp(calls[0], "eq", "evt_team_mst.team_id", "team-1")).toBe(true);
    expect(hasOp(calls[0], "eq", "evt_team_mst.evt_type_cd", "MILEAGE_RUN")).toBe(true);
  });

  it("행이 없으면 false", async () => {
    const { db } = fakeDb(() => ({ data: [], error: null }));
    await expect(isMileageAlumni(db, "team-1", "mem-1")).resolves.toBe(false);
  });

  it("조회가 실패하면 false 로 눙치지 않고 던진다 — 신청 금액이 이 값으로 정해진다", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { message: "boom" } }));
    await expect(isMileageAlumni(db, "team-1", "mem-1")).rejects.toThrow("isMileageAlumni 조회 실패");
  });
});

describe("mileageAlumniSet", () => {
  it("멤버가 없으면 DB 를 부르지 않는다", async () => {
    const { db, calls } = fakeDb(() => ({ data: [], error: null }));
    await expect(mileageAlumniSet(db, "team-1", [])).resolves.toEqual(new Set());
    expect(calls).toHaveLength(0);
  });

  it("중복 id 는 접고, 200명씩 청크로 나눠 읽어 합친다", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `m${i}`);
    const { db, calls } = fakeDb((call) => {
      const inOp = call.ops.find((o) => o[0] === "in");
      const chunk = (inOp?.[2] ?? []) as string[];
      // 청크마다 맨 앞 한 명만 이력이 있다고 응답한다
      return { data: [{ mem_id: chunk[0] }], error: null };
    });
    const set = await mileageAlumniSet(db, "team-1", [...ids, ...ids.slice(0, 10)]);
    expect(calls).toHaveLength(3); // 450 → 200 + 200 + 50 (앞 10명 중복은 접힌다)
    expect([...set].sort()).toEqual(["m0", "m200", "m400"]);
    for (const c of calls) {
      expect(hasOp(c, "eq", "aprv_yn", true)).toBe(true);
      expect(hasOp(c, "eq", "evt_team_mst.team_id", "team-1")).toBe(true);
      expect(hasOp(c, "eq", "evt_team_mst.evt_type_cd", "MILEAGE_RUN")).toBe(true);
    }
  });

  it("한 사람이 여러 시즌에 참가해 행이 여럿이어도 집합엔 한 번", async () => {
    const { db } = fakeDb(() => ({ data: [{ mem_id: "a" }, { mem_id: "a" }, { mem_id: "b" }], error: null }));
    const set = await mileageAlumniSet(db, "team-1", ["a", "b", "c"]);
    expect([...set].sort()).toEqual(["a", "b"]);
  });

  it("조회가 실패하면 던진다", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { message: "boom" } }));
    await expect(mileageAlumniSet(db, "team-1", ["a"])).rejects.toThrow("조회 실패");
  });
});

describe("toSessPlans", () => {
  it("DB 컬럼을 camelCase 로 옮기고 회차 순으로 줄 세운다(입력 순서에 기대지 않는다)", () => {
    const out = toSessPlans([
      plan(3, { easy_txt: "6회", note_txt: "장소 이동" }),
      plan(1, { phase_nm: "측정" }),
      plan(2),
    ]);
    expect(out.map((p) => p.sessNo)).toEqual([1, 2, 3]);
    expect(out[0]).toEqual({
      sessNo: 1,
      phaseNm: "측정",
      ttl: "1회차 훈련",
      mainTxt: "본 훈련",
      easyTxt: null,
      purpTxt: "목적",
      noteTxt: null,
    });
    expect(out[2]).toMatchObject({ easyTxt: "6회", noteTxt: "장소 이동" });
  });

  it("빈 입력이면 빈 배열", () => {
    expect(toSessPlans([])).toEqual([]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const rows = [plan(2), plan(1)];
    toSessPlans(rows);
    expect(rows.map((r) => r.sess_no)).toEqual([2, 1]);
  });
});

describe("assembleBoard", () => {
  const prts = [
    prt("a", "가나"),
    prt("b", "나다", { join_wk_no: 2 }),
    prt("c", "라마", { aprv_yn: false, aprv_at: null }),
    prt("d", "다라", { join_wk_no: 6, deposit_amt: 0 }),
  ];
  const attds = [
    ...attd("a", "t1", "t2", "t3"), // t3 는 아직 안 열린 벙의 참석 예약
    ...attd("b", "t1", "t2"), // t1 은 합류(W2) 전 주차
    ...attd("c", "t1"),
  ];
  const board = assembleBoard({ evt: EVT, cfgRow: null, links: LINKS, prts, attds, nowIso: NOW });

  it("입금 대기자가 먼저, 그 안에서 이름순(한글)", () => {
    expect(board.participants.map((p) => p.memNm)).toEqual(["라마", "가나", "나다", "다라"]);
  });

  it("출석은 열린 회차 + 합류 주차 이후만 센다(예약·합류 전은 제외)", () => {
    const byNm = Object.fromEntries(board.participants.map((p) => [p.memNm, p]));
    expect(byNm["가나"].summary).toMatchObject({ attdCnt: 2, required: 9, refund: 6_666, unrefunded: 23_334 });
    expect(byNm["나다"].summary).toMatchObject({ attdCnt: 1, required: 8, refund: 3_750, unrefunded: 26_250 });
    expect(byNm["다라"].summary).toMatchObject({ late: true, required: null, refund: 0, unrefunded: 0 });
  });

  it("참가자가 참석한 연결 벙 id를 회차 순으로 싣는다(합류 전 참석도 원본 그대로 — 판정은 summary 몫)", () => {
    const byNm = Object.fromEntries(board.participants.map((p) => [p.memNm, p]));
    expect(byNm["가나"].attendedGthrIds).toEqual(["t1", "t2", "t3"]);
    expect(byNm["나다"].attendedGthrIds).toEqual(["t1", "t2"]);
  });

  it("합계는 승인된 참가자만 — 대기자의 보증금·참가비는 받은 돈이 아니다", () => {
    expect(board.totals).toEqual({
      aprvCnt: 3,
      pendingCnt: 1,
      depositSum: 60_000,
      refundSum: 6_666 + 3_750,
      unrefundedSum: 23_334 + 26_250,
      entryFeeSum: 30_000,
    });
  });

  it("벙별 참석 인원은 승인자 중 그 회차 이전 합류자만(대기자·합류 전 제외, 미개최 예약은 포함)", () => {
    const att = Object.fromEntries(board.sessions.map((s) => [s.gthrId, s.attdCnt]));
    expect(att).toEqual({ t1: 1, t2: 2, t3: 1, m: 0 });
  });

  it("회차는 주차 순이고 held 는 시작 시각이 지난 것만", () => {
    expect(board.sessions.map((s) => [s.gthrId, s.wkNo, s.sessType, s.held])).toEqual([
      ["t1", 1, "TRAINING", true],
      ["t2", 2, "TRAINING", true],
      ["t3", 3, "TRAINING", false],
      ["m", 14, "MEASURE", false],
    ]);
  });

  it("설정 행이 없으면 cfgSaved=false 로 기본값이 돈다", () => {
    expect(board.cfgSaved).toBe(false);
    expect(board.cfg).toEqual(PB_CLASS_DEFAULT_CFG);
  });

  it("삭제된 벙(한파 취소)은 열리지 않은 회차 — 출석에서 빠지고 분모는 그대로", () => {
    const canceled = assembleBoard({
      evt: EVT,
      cfgRow: null,
      links: LINKS.map((l) => (l.gthr_id === "t2" ? { ...l, del_yn: true } : l)),
      prts: [prt("a", "가나")],
      attds: attd("a", "t1", "t2"),
      nowIso: NOW,
    });
    expect(canceled.sessions.find((s) => s.gthrId === "t2")).toMatchObject({ held: false, delYn: true });
    expect(canceled.participants[0].summary).toMatchObject({ attdCnt: 1, required: 9 });
  });

  it("저장된 주차와 벙 날짜에서 계산한 주차가 갈리면 computedWkNo 로 드러난다", () => {
    // wk_no=5 로 연결했는데 벙 날짜(11/18)는 W3 — 연결 뒤에 벙 날짜가 바뀐 경우
    const drift = assembleBoard({
      evt: EVT,
      cfgRow: null,
      links: [link("x", 5, "2026-11-18T10:30:00Z")],
      prts: [],
      attds: [],
      nowIso: NOW,
    });
    expect(drift.sessions[0]).toMatchObject({ wkNo: 5, computedWkNo: 3 });
  });

  it("신청 때 적용된 할인(depositDcAmt)을 그대로 싣고, 합계·환급 계산엔 섞지 않는다", () => {
    // 마일리지런 참가자: 정가 30,000 에서 5,000 을 깎아 실제 낸 25,000 이 deposit_amt 다
    const dc = assembleBoard({
      evt: EVT,
      cfgRow: null,
      links: LINKS,
      prts: [prt("a", "가나", { deposit_amt: 25_000, deposit_dc_amt: 5_000 }), prt("b", "나다")],
      attds: attd("a", "t1", "t2"),
      nowIso: NOW,
    });
    const byNm = Object.fromEntries(dc.participants.map((p) => [p.memNm, p]));
    expect(byNm["가나"].depositDcAmt).toBe(5_000);
    expect(byNm["나다"].depositDcAmt).toBe(0);
    // 환급은 실제 낸 보증금(25,000) 기준 — floor(25000 × 2 / 9) = 5,555. 할인액이 더해져 계산되지 않는다
    expect(byNm["가나"].summary).toMatchObject({ refund: 5_555, unrefunded: 19_445 });
    expect(dc.totals.depositSum).toBe(55_000);
  });

  it("훈련표 행을 회차 순 sessPlans 로 싣는다 — 안 넘기면 빈 배열", () => {
    const withPlans = assembleBoard({
      evt: EVT,
      cfgRow: null,
      links: [],
      prts: [],
      attds: [],
      planRows: [plan(2), plan(1)],
      nowIso: NOW,
    });
    expect(withPlans.sessPlans.map((p) => p.sessNo)).toEqual([1, 2]);

    const without = assembleBoard({ evt: EVT, cfgRow: null, links: [], prts: [], attds: [], nowIso: NOW });
    expect(without.sessPlans).toEqual([]);
  });

  it("참가자도 연결도 없으면 합계 0", () => {
    const empty = assembleBoard({ evt: EVT, cfgRow: null, links: [], prts: [], attds: [], nowIso: NOW });
    expect(empty.totals).toEqual({
      aprvCnt: 0,
      pendingCnt: 0,
      depositSum: 0,
      refundSum: 0,
      unrefundedSum: 0,
      entryFeeSum: 0,
    });
  });
});

describe("assembleMyPbClass", () => {
  it("신청 전이면 me=null, 현재 주차는 오늘 기준", () => {
    const my = assembleMyPbClass({ evt: EVT, cfgRow: null, links: LINKS, myPrt: null, myAttds: [], nowIso: NOW });
    expect(my.me).toBeNull();
    expect(my.currentWkNo).toBe(2);
    expect(my.sessions.every((s) => s.attdCnt === 0)).toBe(true);
  });

  it("프로젝트 시작 전이면 현재 주차는 1로 올린다", () => {
    const my = assembleMyPbClass({
      evt: EVT,
      cfgRow: null,
      links: LINKS,
      myPrt: null,
      myAttds: [],
      nowIso: "2026-10-20T00:00:00Z",
    });
    expect(my.currentWkNo).toBe(1);
  });

  it("입금 대기 신청도 me 로 돌려주고 같은 요약 함수로 계산한다", () => {
    const my = assembleMyPbClass({
      evt: EVT,
      cfgRow: null,
      links: LINKS,
      myPrt: prt("a", "가나", { aprv_yn: false, aprv_at: null }),
      myAttds: attd("a", "t1", "t2"),
      nowIso: NOW,
    });
    expect(my.me).toMatchObject({ aprvYn: false, attendedGthrIds: ["t1", "t2"] });
    expect(my.me?.summary).toMatchObject({ attdCnt: 2, required: 9, toFull: 7, refund: 6_666 });
  });

  it("마일리지런 할인 자격(mlgAlumni)·훈련표(sessPlans)·내 할인액을 싣는다", () => {
    const my = assembleMyPbClass({
      evt: EVT,
      cfgRow: null,
      links: LINKS,
      myPrt: prt("a", "가나", { deposit_amt: 25_000, deposit_dc_amt: 5_000 }),
      myAttds: [],
      planRows: [plan(2), plan(1)],
      mlgAlumni: true,
      nowIso: NOW,
    });
    expect(my.mlgAlumni).toBe(true);
    expect(my.sessPlans.map((p) => p.sessNo)).toEqual([1, 2]);
    expect(my.me).toMatchObject({ depositAmt: 25_000, depositDcAmt: 5_000 });
  });

  it("넘기지 않으면 mlgAlumni=false·sessPlans=[]", () => {
    const my = assembleMyPbClass({ evt: EVT, cfgRow: null, links: LINKS, myPrt: null, myAttds: [], nowIso: NOW });
    expect(my.mlgAlumni).toBe(false);
    expect(my.sessPlans).toEqual([]);
  });
});
