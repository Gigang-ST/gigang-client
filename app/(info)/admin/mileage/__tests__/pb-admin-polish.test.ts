import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PB_CLASS_DEFAULT_CFG } from "@/lib/pb-class";
import { PB_DEFAULT_SESS_PLANS, PB_TRN_GROUPS } from "@/lib/pb-class-plan";
import { formatSec, PB_DEFAULT_RULE, type PbRecValue } from "@/lib/pb-class-score";
import type { PbClassBoard } from "@/lib/queries/pb-class";
import type { PbGame, PbGameParticipant } from "@/lib/queries/pb-class-game";

import { parsePbCfgForm, toPbCfgForm } from "@/app/(info)/admin/mileage/pb-cfg-fields";
import { AutoTrnGroupLabel, TrnGroupLabel } from "@/app/(info)/admin/mileage/pb-game-parts";
import { PbRecordsTab } from "@/app/(info)/admin/mileage/pb-records-tab";
import { PbScoreTab } from "@/app/(info)/admin/mileage/pb-score-tab";
import { PlanBody } from "@/app/(info)/admin/mileage/pb-sess-plan-tab";
import { PbTeamsTab, trnGroupCodes } from "@/app/(info)/admin/mileage/pb-teams-tab";
import { previewPbEndDt } from "@/app/(info)/admin/mileage/project-info-tab";

// 팀·기록·점수 탭은 usePbGame이 서버 액션으로 조회해 온다 — 여기서는 조회가 끝난 상태의 화면만 그린다.
// (SSR에는 effect가 없어 그대로 두면 첫 로딩 스켈레톤만 나온다)
const gameState = vi.hoisted(() => ({ game: null as PbGame | null }));
vi.mock("@/app/(info)/admin/mileage/use-pb-game", () => ({
  usePbGame: () => ({
    game: gameState.game,
    loading: false,
    error: null,
    reload: vi.fn(),
    run: vi.fn(async () => true),
    busyKey: null,
  }),
}));
vi.mock("@/app/actions/admin/manage-pb-class-game", () => ({
  assignPbParticipants: vi.fn(),
  createPbGroup: vi.fn(),
  deletePbGroup: vi.fn(),
  updatePbGroup: vi.fn(),
  setPbGoalByAdmin: vi.fn(),
  upsertPbRecords: vi.fn(),
  savePbRule: vi.fn(),
  getPbGameAdmin: vi.fn(),
}));

// 서버 액션 모듈은 끌어오는 순간 env 검증·supabase 클라이언트까지 줄줄이 로드된다 — 이 테스트는 그릴 뿐 부르지 않는다.
vi.mock("@/app/actions/admin/manage-pb-class", () => ({
  getPbClassAdminBoard: vi.fn(),
  savePbCfg: vi.fn(),
  seedPbSessPlans: vi.fn(),
  upsertPbSessPlan: vi.fn(),
  deletePbSessPlan: vi.fn(),
}));
vi.mock("@/app/actions/admin/manage-mileage", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  setEventStatus: vi.fn(),
  getEventParticipantCount: vi.fn(),
}));

/**
 * 「PB 클래스 다듬기」 관리자 화면의 약속을 못박는다.
 *
 * 크래시 없이 틀리는 종류만 모았다 — 주차 표기(「9주차」, 「W9」 아님), 종료일 자동 계산,
 * 마일리지런 할인 검증, 훈련표 탭의 빈 상태·측정 회차 이름.
 *
 * 2026-10-07 오너 피드백: 훈련팀을 목표 시간 이름으로 부르기, 팀 미션 제거, 기록은 회원이 직접
 * 올리고(확인 단계 없음) 운영진은 잘못 들어간 값만 고친다 — 아래 하단 세 묶음이 그 약속을 지킨다.
 */

describe("PB 설정 폼 — 마일리지런 할인", () => {
  it("설정 ↔ 폼 왕복에 할인 칸이 들어 있다", () => {
    const form = toPbCfgForm(PB_CLASS_DEFAULT_CFG);
    expect(form.mlgDcAmt).toBe("5000");
    const parsed = parsePbCfgForm(form);
    expect("cfg" in parsed && parsed.cfg).toEqual(PB_CLASS_DEFAULT_CFG);
  });

  it("할인 0원은 허용하고, 보증금을 넘는 할인은 저장 전에 막는다", () => {
    expect("cfg" in parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "0" })).toBe(true);
    const over = parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "50000" });
    expect("error" in over && over.error).toContain("보증금");
    // 보증금과 같은 금액까지는 괜찮다(0원 보증금이 되는 것일 뿐)
    expect("cfg" in parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "30000" })).toBe(true);
  });

  it("숫자가 아닌 할인은 거른다", () => {
    expect("error" in parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "" })).toBe(true);
    expect("error" in parsePbCfgForm({ ...toPbCfgForm(PB_CLASS_DEFAULT_CFG), mlgDcAmt: "-1" })).toBe(true);
  });
});

describe("PB 종료일 자동 계산 미리보기", () => {
  it("11/4(수) 시작 + 총 13회차 → 2/9(화) — 측정 주간 끝까지", () => {
    expect(previewPbEndDt("2026-11-04", "13")).toBe("2027-02-09");
  });

  it("총 회차를 바꾸면 종료일도 같이 움직인다", () => {
    expect(previewPbEndDt("2026-11-04", "12")).toBe("2027-02-02");
  });

  it("시작일이 비었거나 총 회차가 저장 불가 값이면 계산하지 않는다", () => {
    expect(previewPbEndDt("", "13")).toBeNull();
    expect(previewPbEndDt("2026-11-04", "")).toBeNull();
    expect(previewPbEndDt("2026-11-04", "1")).toBeNull();
    expect(previewPbEndDt("2026-11-04", "abc")).toBeNull();
  });
});

function makeBoard(over: Partial<PbClassBoard> = {}): PbClassBoard {
  return {
    evt: { evtId: "evt-1", evtNm: "겨울 10K PB 클래스", sttDt: "2026-11-04", endDt: "2027-02-09", sttsEnm: "ACTIVE" },
    cfg: { ...PB_CLASS_DEFAULT_CFG },
    cfgSaved: true,
    sessions: [],
    participants: [],
    totals: { aprvCnt: 0, pendingCnt: 0, depositSum: 0, refundSum: 0, unrefundedSum: 0, entryFeeSum: 0 },
    sessPlans: [],
    ...over,
  };
}

const render = (board: PbClassBoard) =>
  renderToStaticMarkup(
    createElement(PlanBody, {
      board,
      evtId: board.evt.evtId,
      run: async () => true,
      busyKey: null,
    }),
  );

describe("훈련표 탭", () => {
  it("회차는 「n주차」, 마지막 회차는 「측정」으로 부른다 — W 표기는 어디에도 없다", () => {
    const html = render(makeBoard({ sessPlans: PB_DEFAULT_SESS_PLANS }));
    expect(html).toContain("1주차");
    expect(html).toContain("12주차");
    expect(html).toContain("측정");
    expect(html).not.toMatch(/\bW\d/);
    // 13번째 회차는 「13주차」가 아니다 — 측정은 13·14주차 어느 쪽에도 놓일 수 있다
    expect(html).not.toContain("13주차");
    expect(html).toContain("훈련표 13/13회차");
  });

  it("카드마다 훈련 종류·그룹 세션·개인 훈련을 보여 주고, 비고는 있을 때만 그린다", () => {
    const html = render(makeBoard({ sessPlans: PB_DEFAULT_SESS_PLANS.slice(0, 2) }));
    // 훈련팀을 목표 시간으로 부르므로 세션 칸도 같은 말이다 — A~E 코드는 화면에 안 나온다
    expect(html).toContain("38~50분 그룹");
    expect(html).toContain("첫 10K 그룹");
    expect(html).not.toContain("A~D");
    expect(html).not.toContain("E 첫 10K");
    expect(html).toContain("기록 측정");
    expect(html).toContain("파틀렉");
    expect(html).toContain("개인 훈련");
    expect(html).not.toContain("목적");
    expect(html).toContain("킥오프 + 5K 기록 측정");
    // 1회차는 첫 10K 세션이 없어 「38~50분 그룹과 같아요」, 2회차는 따로 있다
    expect(html).toContain("38~50분 그룹과 같아요");
    expect(html).toContain(PB_DEFAULT_SESS_PLANS[1].easyTxt as string);
    expect(html).toContain("이지런 2회");
    // 1·2회차 모두 비고가 있고, 같은 칸이 빈 회차(예: 4회차)에서는 라벨이 안 선다
    const noNote = render(makeBoard({ sessPlans: [PB_DEFAULT_SESS_PLANS[3]] }));
    expect(noNote).not.toContain("비고");
  });

  it("훈련 회차에는 그 주(수~화) 날짜 범위를 찍고, 측정에는 안 찍는다", () => {
    const html = render(makeBoard({ sessPlans: [PB_DEFAULT_SESS_PLANS[0], PB_DEFAULT_SESS_PLANS[12]] }));
    expect(html).toContain("11/4~11/10");
    expect(html).not.toContain("2/3~2/9");
  });

  it("안내 문구가 회원 「훈련」 탭과 이어지고 P±초 표기를 알려 준다", () => {
    const html = render(makeBoard());
    expect(html).toContain("회원 「훈련」 탭에 그대로 보여요");
    expect(html).toContain("속도는 P±초로");
  });

  it("비어 있으면 「기본 훈련표 불러오기」를 세운다(총 회차 13)", () => {
    const html = render(makeBoard());
    expect(html).toContain("기본 훈련표 불러오기");
    expect(html).toContain("훈련표 0/13회차");
  });

  it("총 회차가 기본(13)과 다르면 서버가 거절하므로 버튼을 미리 막고 이유를 말한다", () => {
    const html = render(makeBoard({ cfg: { ...PB_CLASS_DEFAULT_CFG, totSessCnt: 10 } }));
    expect(html).toContain("불러올 수 없어요");
    // 불러오기 버튼은 disabled
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>기본 훈련표 불러오기/);
  });

  it("모든 회차가 찼으면 「회차 추가」를 막는다", () => {
    const full = render(makeBoard({ sessPlans: PB_DEFAULT_SESS_PLANS }));
    expect(full).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?<\/svg>회차 추가/);
    const some = render(makeBoard({ sessPlans: PB_DEFAULT_SESS_PLANS.slice(0, 3) }));
    expect(some).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?<\/svg>회차 추가/);
  });
});

/* ------------------------------------------------------------------ */
/* 팀·기록·점수 탭 — 오너 피드백(2026-10-07)                             */
/* ------------------------------------------------------------------ */

// cnfm은 core 타입에 아직 남아 있을 수도, 걷혀 있을 수도 있다 — 단언으로 둘 다 받는다.
// 예전엔 cnfm=false가 「확인 대기」 배지·버튼을 띄웠던 값이라 회귀 감시에 쓴다.
const rec = (sec: number) => ({ sec, cnfm: false }) as PbRecValue;

function makeParticipant(over: Partial<PbGameParticipant> & { prtId: string; memNm: string }): PbGameParticipant {
  return {
    memId: `mem-${over.prtId}`,
    joinWkNo: 1,
    late: false,
    grpId: "grp-1",
    goalSec: null,
    recs: {},
    aprvYn: true,
    trnGrpCd: null,
    trnGrpFixedCd: null,
    trnGrpAutoCd: null,
    avatarUrl: null,
    ...over,
  };
}

function makeGame(): PbGame {
  return {
    evt: { evtId: "evt-1", evtNm: "겨울 10K PB 클래스", sttDt: "2026-11-04", endDt: "2027-02-09", sttsEnm: "ACTIVE" },
    cfg: { ...PB_CLASS_DEFAULT_CFG },
    rule: PB_DEFAULT_RULE,
    currentWkNo: 3,
    measureWkNo: null,
    groups: [{ grpId: "grp-1", grpNm: "불꽃팀", colorNo: 1 }],
    participants: [
      // 운영진이 A로 고정 — 기록(1주차 5K 21:00 → 10K 43:47)대로면 45분 이하(C)
      makeParticipant({
        prtId: "p1",
        memNm: "홍길동",
        trnGrpCd: "A",
        trnGrpFixedCd: "A",
        trnGrpAutoCd: "C",
        goalSec: 2280,
        recs: { BASE_5K: rec(1260), DAEGU_10K: rec(2400) },
      }),
      // 자동 — 목표 58:20 → 첫 10K
      makeParticipant({ prtId: "p2", memNm: "김러너", trnGrpCd: "E", trnGrpAutoCd: "E", goalSec: 3500, grpId: null }),
    ],
    scoreboard: {
      groups: [
        {
          grpId: "grp-1",
          grpNm: "불꽃팀",
          colorNo: 1,
          memberCnt: 1,
          avgSum: 12.5,
          allAttendWeeks: [1, 2],
          allAttendBonus: 20,
          total: 32.5,
          rank: 1,
        },
      ],
      members: [
        {
          prtId: "p1",
          memId: "mem-p1",
          memNm: "홍길동",
          grpId: "grp-1",
          inGame: true,
          total: 12.5,
          byCd: { ATTEND: 10, JOIN: 2.5, HOST: 0, IMPROVE_MID: 0, IMPROVE_FINAL: 0, GOAL: 0 },
          entries: [],
          goalAchieved: false,
        },
      ],
    },
  };
}

const renderTab = (tab: typeof PbTeamsTab) => {
  gameState.game = makeGame();
  return renderToStaticMarkup(createElement(tab, { evtId: "evt-1" }));
};

describe("훈련팀 — 목표 시간으로 부른다", () => {
  it("이름 곁에 내부 코드를 작게 붙인다: 「38분 이하 · A」", () => {
    for (const g of PB_TRN_GROUPS) {
      const html = renderToStaticMarkup(createElement(TrnGroupLabel, { cd: g.cd }));
      expect(html).toContain(g.nm);
      expect(html).toContain(`· ${g.cd}`);
    }
    expect(renderToStaticMarkup(createElement(TrnGroupLabel, { cd: "A" }))).toContain("38분 이하");
    expect(renderToStaticMarkup(createElement(TrnGroupLabel, { cd: "E" }))).toContain("첫 10K · 60분 이하");
  });

  it("목록에 없는 코드(D1)는 코드 그대로 — 같은 말을 두 번 찍지 않는다", () => {
    const html = renderToStaticMarkup(createElement(TrnGroupLabel, { cd: "D1" }));
    expect(html.match(/D1/g)).toHaveLength(1);
    expect(html).not.toContain("· D1");
  });

  it("선택지는 표준 A~E + 이미 배정돼 있는 비표준 코드(중복 없이 정렬)", () => {
    expect(trnGroupCodes([])).toEqual(["A", "B", "C", "D", "E"]);
    expect(trnGroupCodes(["A", null, "D2", "D1", "D2", "E"])).toEqual(["A", "B", "C", "D", "E", "D1", "D2"]);
  });

  it("「자동」 선택지는 지금 계산된 팀을 같이 말한다 — 목표·기록이 없으면 「기록 전」", () => {
    const auto = renderToStaticMarkup(createElement(AutoTrnGroupLabel, { cd: "C" }));
    expect(auto).toContain("자동 · 45분 이하");
    expect(auto).toContain("· C");
    expect(renderToStaticMarkup(createElement(AutoTrnGroupLabel, { cd: null }))).toContain("자동 · 기록 전");
  });

  it("고정한 사람에게만 「고정 · 자동이면 …」을 단다 — 자동인 사람은 저장해도 고정으로 굳지 않는다", () => {
    const html = renderTab(PbTeamsTab);
    // 홍길동(A 고정)만 — 자동인 김러너 줄엔 없다
    expect(html.match(/고정 · 자동이면/g)).toHaveLength(1);
    expect(html).toContain("고정 · 자동이면 45분 이하");
    // 실제 팀(trnGrpCd)이 아니라 원값(trnGrpFixedCd)과 비교한다 — 그렇지 않으면 자동인 김러너가 「바뀐 행」으로 잡혀
    // 아무것도 안 고쳤는데 저장 버튼이 켜지고, 누르는 순간 첫 10K로 고정된다
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>배정 저장<\/button>/);
  });

  it("배정 행마다 훈련팀·게임팀 선택이 있고 미션 문구는 남지 않는다", () => {
    const html = renderTab(PbTeamsTab);
    expect(html).toContain('aria-label="홍길동 훈련팀"');
    expect(html).toContain('aria-label="홍길동 게임팀"');
    expect(html).not.toContain("미션");
  });
});

describe("기록 탭 — 회원이 직접 올린 값을 고치는 화면", () => {
  it("안내 문구", () => {
    expect(renderTab(PbRecordsTab)).toContain("회원이 직접 올려요. 잘못 들어간 값만 고치세요.");
  });

  it("확인 대기·확인됨·확인 버튼이 없다 — 올리는 즉시 점수에 들어가므로 확인 단계가 없다", () => {
    const html = renderTab(PbRecordsTab);
    expect(html).not.toContain("확인 대기");
    expect(html).not.toContain("확인됨");
    expect(html).not.toContain("확인했어요");
    // 버튼 글자 어디에도 「확인」이 없다(저장 버튼은 「기록 저장」)
    const buttonTexts = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    expect(buttonTexts.some((t) => t.includes("확인"))).toBe(false);
  });

  it("대구 10K도 입력 칸이다 — 회원이 틀리게 올린 값을 고칠 길이가 있어야 한다", () => {
    const html = renderTab(PbRecordsTab);
    expect(html).toContain("대구 10K");
    // 회원이 올린 40:00이 입력 칸 값으로 들어 있다
    const daegu = html.match(/<input[^>]*aria-label="홍길동 대구 10K"[^>]*>/);
    expect(daegu?.[0]).toContain(`value="${formatSec(2400)}"`);
    // 값이 없는 사람은 빈 칸
    const empty = html.match(/<input[^>]*aria-label="김러너 대구 10K"[^>]*>/);
    expect(empty?.[0]).toContain('value=""');
  });

  it("목표 + 기록 넷 = 입력 다섯 칸이 사람마다 선다", () => {
    const html = renderTab(PbRecordsTab);
    const mine = html.match(/<input[^>]*aria-label="홍길동 [^"]*"[^>]*>/g) ?? [];
    expect(mine).toHaveLength(5);
  });
});

describe("점수 탭 — 팀 미션을 걷어냈다", () => {
  it("세그먼트는 점수판·배점 설정 둘뿐이다", () => {
    const html = renderTab(PbScoreTab);
    expect(html).toContain("점수판");
    expect(html).toContain("배점 설정");
    expect(html).not.toContain("팀 미션");
  });

  it("팀 순위 카드는 팀원 평균 합·전원 출석만 보이고 미션 칸이 없다", () => {
    const html = renderTab(PbScoreTab);
    expect(html).toContain("팀원 평균 합");
    expect(html).toContain("전원 출석");
    expect(html).not.toContain("미션");
  });

  it("점수 산식 안내에서 미션이 빠졌다", () => {
    expect(renderTab(PbScoreTab)).toContain("팀 점수 = 주차별 팀원 평균 점수의 합 + 전원 출석 보너스.");
  });
});
