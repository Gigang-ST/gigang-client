import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG, summarizeRefund, type PbClassCfg } from "@/lib/pb-class";
import { PB_DEFAULT_SESS_PLANS, PB_TRN_GROUPS, PB_TRN_KINDS } from "@/lib/pb-class-plan";
import { PB_DEFAULT_RULE } from "@/lib/pb-class-score";
import type { PbEvent, PbParticipant, PbSession } from "@/lib/queries/pb-class";

import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { PB_MONEY_USE_DETAIL_TXT, PB_MONEY_USE_TXT } from "@/components/projects/pb-class/format";
import { PbApplySection } from "@/components/projects/pb-class/pb-apply-section";
import { PbGuide } from "@/components/projects/pb-class/pb-guide";
import { PbHero, pbPhaseOf } from "@/components/projects/pb-class/pb-hero";
import { PbMyStatus } from "@/components/projects/pb-class/pb-my-status";
import { PbPendingCard } from "@/components/projects/pb-class/pb-pending-card";
import { PbSessionStrip } from "@/components/projects/pb-class/pb-session-strip";
import { PbTraining, pbFocusOf } from "@/components/projects/pb-class/pb-training";
import { PbViewTabs, pbGuideTop, resolvePbView } from "@/components/projects/pb-class/pb-view-tabs";
import { ArchivedBanner, ProjectArchive } from "@/components/projects/project-archive";

// 신청 카드가 부르는 라우터·서버 액션은 이 테스트가 보는 대상이 아니다(서버 액션 모듈은 node 에서 로드조차 안 된다)
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/app/actions/pb-class", () => ({ joinPbClass: vi.fn() }));
// 비활성 안내 다이얼로그는 서버 액션(세션 쿠키·env)을 끌고 들어온다 — 열리지 않는 상태라 빈 껍데기로 충분하다
vi.mock("@/components/common/inactive-gate-dialog", () => ({ InactiveGateDialog: () => null }));

/**
 * PB 클래스 회원 화면의 **규칙이 마크업에 실제로 나오는지** 못박는다.
 *
 * 숫자 계산은 `lib/__tests__/pb-class.test.ts`가 지킨다. 여기서 보는 건 그 결과를 화면이
 * 어떻게 말하느냐다 — 정식 참가자의 분모 13, 중간 합류자의 「3주차 합류」 표기, 늦은 합류자에게
 * 환급 칸이 아예 안 서는 것, 합류 전 회차가 흐려지는 것. 전부 틀려도 크래시가 안 나는 종류다.
 */

const CFG = PB_CLASS_DEFAULT_CFG;

/** 1~12주차 공식훈련 + 13주차 측정. 앞 4주만 이미 열렸다 */
function makeSessions(): PbSession[] {
  const w1 = dayjs("2026-11-04T19:30:00+09:00");
  return Array.from({ length: 13 }, (_, i) => {
    const wk = i + 1;
    return {
      gthrId: `g${wk}`,
      wkNo: wk,
      sessType: wk === 13 ? ("MEASURE" as const) : ("TRAINING" as const),
      held: wk <= 4,
      gthrNm: `W${wk} 훈련`,
      sttAt: w1.add(i * 7, "day").toISOString(),
      delYn: false,
      computedWkNo: wk,
      attdCnt: 0,
    };
  });
}

function makeMe(joinWkNo: number, attended: string[], cfg: PbClassCfg = CFG): PbParticipant {
  const sessions = makeSessions();
  const depositAmt = joinWkNo >= cfg.lateJoinWkNo ? 0 : cfg.depositAmt;
  return {
    prtId: "p1",
    memId: "m1",
    memNm: "홍길동",
    avatarUrl: null,
    joinWkNo,
    depositAmt,
    entryFeeAmt: cfg.entryFeeAmt,
    aprvYn: true,
    aprvAt: null,
    summary: summarizeRefund({
      joinWkNo,
      depositAmt,
      links: sessions,
      attendedGthrIds: new Set(attended),
      cfg,
    }),
    attendedGthrIds: attended,
    depositDcAmt: 0,
  };
}

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("PbSessionStrip", () => {
  it("13칸을 그리고 상태를 접근성 라벨로 구분한다", () => {
    const me = makeMe(1, ["g1", "g2", "g4"]);
    const out = html(createElement(PbSessionStrip, { me, sessions: makeSessions(), cfg: CFG }));

    expect(out.match(/<li /g)).toHaveLength(13);
    expect(out).toContain('aria-label="1주차 출석"');
    expect(out).toContain('aria-label="3주차 결석"'); // 열렸는데 안 나온 회차
    expect(out).toContain('aria-label="5주차 예정"'); // 아직 안 열린 회차
    expect(out).toContain('aria-label="측정 예정"');
  });

  it("합류 전 주차는 합류 전으로 흐려지고 날짜를 달지 않는다", () => {
    const me = makeMe(3, ["g3"]);
    const out = html(createElement(PbSessionStrip, { me, sessions: makeSessions(), cfg: CFG }));

    expect(out).toContain('aria-label="1주차 합류 전"');
    expect(out).toContain('aria-label="2주차 합류 전"');
    expect(out).toContain('aria-label="3주차 출석"');
  });

  it("벙이 연결되지 않은 칸은 미정이다", () => {
    const me = makeMe(1, []);
    const sessions = makeSessions().filter((s) => s.wkNo !== 6);
    const out = html(createElement(PbSessionStrip, { me, sessions, cfg: CFG }));

    expect(out).toContain('aria-label="6주차 미정"');
  });
});

describe("PbMyStatus", () => {
  it("정식 참가자는 분모 13과 환급 예상·전액까지를 보여 준다", () => {
    const me = makeMe(1, ["g1", "g2", "g4"]); // 3회 출석 → 환급 10,000원, 전액까지 6회
    const out = html(createElement(PbMyStatus, { me, cfg: CFG }));

    expect(out).toContain("내 출석");
    expect(out).toContain("/ 13");
    expect(out).toContain("10,000원");
    expect(out).toContain("6회");
    expect(out).not.toContain("1주차 합류"); // 정식은 합류 주차를 말하지 않는다
    expect(out).not.toMatch(/W\d/);
  });

  it("전액 기준을 채우면 '전액 확보'가 된다", () => {
    const sessions = makeSessions().map((s) => ({ ...s, held: true }));
    const attended = sessions.slice(0, 9).map((s) => s.gthrId);
    const me = {
      ...makeMe(1, attended),
      summary: summarizeRefund({
        joinWkNo: 1,
        depositAmt: CFG.depositAmt,
        links: sessions,
        attendedGthrIds: new Set(attended),
        cfg: CFG,
      }),
    };
    const out = html(createElement(PbMyStatus, { me, cfg: CFG }));

    expect(out).toContain("전액 확보");
    expect(out).toContain("30,000원");
  });

  it("중간 합류자는 합류 주차와 줄어든 분모를 말한다", () => {
    const me = makeMe(3, ["g3", "g4"]);
    const out = html(createElement(PbMyStatus, { me, cfg: CFG }));

    expect(out).toContain("3주차 합류");
    expect(out).not.toMatch(/W\d/);
    expect(out).toContain("/ 11"); // 13 − (3−1)
  });

  it("늦은 합류자에겐 환급 칸 대신 안내만 선다", () => {
    const me = makeMe(6, ["g6"]);
    const out = html(createElement(PbMyStatus, { me, cfg: CFG }));

    expect(out).toContain("보증금 없이 참가 중이에요");
    expect(out).not.toContain("환급 예상");
    expect(out).not.toContain("전액까지");
  });
});

const EVT: PbEvent = {
  evtId: "e1",
  evtNm: "겨울 10K PB 클래스",
  sttDt: "2026-11-04",
  endDt: "2027-02-09",
  sttsEnm: "ACTIVE",
};

/** n주차 수요일 정오(KST)에서 day일 뒤 */
const nowAtWeek = (wk: number, day = 1) =>
  dayjs("2026-11-04T12:00:00+09:00").add((wk - 1) * 7 + day, "day").toISOString();

describe("PbGuide — 규칙이 곧 안내", () => {
  const props = {
    evt: EVT,
    rule: PB_DEFAULT_RULE,
    mlgAlumni: false,
    me: null,
    trnGrpCd: null,
  };

  it("금액·회차·배점을 설정값에서 뽑아 말한다", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));

    expect(out).toContain("13회");
    expect(out).toContain("9회");
    expect(out).toContain("30,000원"); // 보증금
    expect(out).toContain("마일리지런 참가자 보증금 −5,000원");
    expect(out).toContain("할인돼도 9회 출석하면 낸 보증금 전액을 돌려받아요");
    expect(out).toContain(`+${PB_DEFAULT_RULE.pt.attend}`);
    expect(out).toContain(`+${PB_DEFAULT_RULE.pt.allAttend}점`);
    expect(out).toContain(String(PB_DEFAULT_RULE.tenKFactor));
    // 회원 화면엔 W 표기가 없다(오너 지시) — 「W6부터」가 아니라 「6주차부터」
    expect(out).not.toMatch(/W\d/);
    expect(out).toMatch(/6주차(<!-- -->)?부터/); // SSR 은 이웃한 텍스트 노드 사이에 주석을 끼운다
  });

  it("출석 → 환급 표는 refundAmt 로 계산한다(정식 참가 기준)", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));

    expect(out).toContain("보증금 30,000원 · 1주차 합류 기준");
    expect(out).toMatch(/출석 3회<\/dt><dd[^>]*>10,000원/); // 30,000 × 3/9
    expect(out).toMatch(/출석 9회<\/dt><dd[^>]*>30,000원/);
    expect(out).not.toContain("출석 10회");
  });

  it("중간 합류 표는 주차별 남은 회차·전액 기준을 requiredAttdCnt 로 낸다", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));

    // 2주차: 남은 12회 → floor(12×9/13) = 8회
    expect(out).toMatch(/2주차<\/td><td[^>]*>12회<\/td><td[^>]*>8회/);
    expect(out).toContain("6주차~");
  });

  it("설정이 바뀌면 문장·표도 같이 바뀐다", () => {
    const custom: PbClassCfg = {
      totSessCnt: 10,
      fullRfndAttdCnt: 7,
      lateJoinWkNo: 5,
      depositAmt: 20_000,
      entryFeeAmt: 5_000,
      mlgDcAmt: 3_000,
    };
    const out = html(createElement(PbGuide, { ...props, cfg: custom }));

    expect(out).toContain("10회");
    expect(out).toContain("−3,000원");
    expect(out).toContain("5주차~");
    expect(out).toMatch(/출석 7회<\/dt><dd[^>]*>20,000원/);
    expect(out).not.toContain("13회");
    expect(out).not.toContain("6주차~");
  });

  it("마일리지런 참가자에겐 할인된 보증금으로 환급 표를 그린다", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG, mlgAlumni: true }));

    expect(out).toContain("할인 대상이에요");
    expect(out).toContain("보증금 25,000원 · 1주차 합류 기준");
    expect(out).toMatch(/출석 9회<\/dt><dd[^>]*>25,000원/);
  });

  it("배점(rule)을 못 읽으면 점수·목표 칸을 지어내지 않고 목차에서도 뺀다", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG, rule: null }));

    expect(out).not.toContain('href="#pb-guide-score"');
    expect(out).not.toContain('id="pb-guide-score"');
    expect(out).toContain("점수 규칙을 불러오지 못했어요");
  });

  it("팀 미션은 안내 어디에도 없다 — 칸도 목차 칩도 점수 공식도(오너 지시)", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));

    expect(out).not.toContain("미션");
    expect(out).not.toContain("Team Missions");
    expect(out).not.toContain("pb-guide-missions");
    expect(out).toContain("주마다 팀원 1인당 평균 점수의 합 + 전원 출석 보너스");
  });

  it("훈련팀 표는 목표 시간 이름 + 10K 목표기록 + 대회 페이스만 — 알파벳도 주간 거리도 없다", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));
    const table = out.slice(out.indexOf('id="pb-guide-groups"'), out.indexOf('id="pb-guide-kinds"'));

    for (const th of ["그룹", "10K 목표기록", "대회 페이스"]) expect(table).toContain(`>${th}<`);
    for (const nm of PB_TRN_GROUPS.map((g) => g.nm)) expect(table).toContain(nm);
    expect(table).toContain("38분 이하");
    expect(table).toContain("첫 10K · 60분 이하");
    expect(table).toContain("38분 이내");
    expect(table).toContain("45분 이내");
    expect(table).toContain("60분 이내"); // "1:00:00 이내"가 아니라
    expect(table).toContain("3:48/km");
    expect(table).toContain("6:00/km");
    expect(table).not.toContain("주간 거리");
    expect(table).not.toMatch(/\d+~\d+km/);
    for (const letter of ["A", "B", "C", "D", "E"]) expect(table).not.toContain(`>${letter}<`);
    expect(table.match(/<tr/g)).toHaveLength(PB_TRN_GROUPS.length + 1); // 머리 + 다섯 행
    expect(table).not.toContain("내 팀");
  });

  it("훈련팀은 내 P로 저절로 정해진다고 말한다 — 「1주차 5K 기록으로」라는 옛 규칙은 없다(오너 2026-10-08)", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));
    const groups = out.slice(out.indexOf('id="pb-guide-groups"'), out.indexOf('id="pb-guide-kinds"'));

    expect(groups).toContain("저절로 묶여요");
    expect(groups).toContain("내 P(목표와 최근 5K 기록 중 느린 쪽)가 들어가는 줄로 저절로 정해져요");
    expect(groups).toContain("중간점검 기록을 올리면 바뀔 수 있고");
    expect(groups).not.toContain("1주차 5K 기록으로");
  });

  it("내 훈련팀 행에만 내 팀 표시가 붙는다(쪼갠 반 D1도 D 행에)", () => {
    for (const [cd, nm] of [
      ["C", "45분 이하"],
      ["D1", "50분 이하"],
    ] as const) {
      const out = html(createElement(PbGuide, { ...props, cfg: CFG, trnGrpCd: cd }));
      const table = out.slice(out.indexOf('id="pb-guide-groups"'), out.indexOf('id="pb-guide-kinds"'));

      expect(table.match(/내 팀/g)).toHaveLength(1);
      expect(table.indexOf("내 팀")).toBeGreaterThan(table.indexOf(nm));
      expect(table).toMatch(/<tr class="bg-primary\/5">/);
    }
  });

  it("훈련 종류 사전 — 8가지 칩·속도·기르는 것, 단계·목적이라는 말은 없다", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));
    const kinds = out.slice(out.indexOf('id="pb-guide-kinds"'), out.indexOf('id="pb-guide-score"'));

    expect(out).toContain('href="#pb-guide-kinds"');
    expect(out).toContain(">훈련 종류<");
    const all = Object.values(PB_TRN_KINDS);
    expect(kinds.match(/<li /g)).toHaveLength(all.length);
    for (const k of all) {
      expect(kinds).toContain(`>${k.nm}</span>`);
      expect(kinds).toContain(k.what);
      expect(kinds).toContain(k.pace);
    }
    expect(kinds).toContain(">업힐 훈련</span>");
    expect(kinds).toContain("12주 동안 이 8가지를 주마다 바꿔 가며 해요");
    // 12주에 처음 나오는 순서 — 기록 측정이 맨 앞, 테이퍼가 맨 뒤
    expect(kinds.indexOf(">기록 측정<")).toBeLessThan(kinds.indexOf(">파틀렉<"));
    expect(kinds.indexOf(">레이스 페이스 훈련<")).toBeLessThan(kinds.indexOf(">테이퍼<"));
    expect(out).not.toContain("목적");
    expect(out).not.toContain("단계");
  });

  it("목표·기록·대구는 본인이 직접 올린다 — 운영진이 적는다는 말이 없다", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));

    expect(out).toContain("목표도 기록도 내가 직접 올려요");
    expect(out).toContain("직접 올리면 바로 점수에 반영돼요");
    expect(out).toContain("기록은 「내 현황」에서 직접 올려요");
    expect(out).not.toContain("운영진");
    expect(out).not.toContain("확인하면 확정");
  });

  it("돈의 쓰임새는 회식비와 프로젝트 운영비 — 참가비·정산 칸이 같은 말을 한다", () => {
    const out = html(createElement(PbGuide, { ...props, cfg: CFG }));
    const fees = out.slice(out.indexOf('id="pb-guide-fees"'), out.indexOf('id="pb-guide-refund"'));
    const settle = out.slice(out.indexOf('id="pb-guide-settle"'));

    expect(fees).toContain(PB_MONEY_USE_TXT);
    expect(settle).toContain(PB_MONEY_USE_TXT);
    expect(settle).toContain(PB_MONEY_USE_DETAIL_TXT);
    expect(settle).toContain("동계훈련용품 · 회식비 · 대구마라톤 응원 관련 비용(계획 중)");
    // 옛 문구
    expect(out).not.toContain("회식비와 대회 참가비");
    expect(out).not.toContain("운영(장소·용품 등)");
    expect(out).not.toContain("회식비·대회비");
  });
});

describe("PbTraining — 주차별 훈련 · 훈련 종류 · 내 P", () => {
  const base = {
    plans: PB_DEFAULT_SESS_PLANS,
    evt: EVT,
    cfg: CFG,
    sessions: makeSessions(),
    me: null,
    trnGrpCd: null,
  };
  /** 회차 하나의 마크업 — 13칸이 다 그려지므로(접힌 칸도 본문이 마크업에 있다) 칸 단위로 잘라 본다 */
  const sessOf = (out: string, n: number) =>
    out.slice(out.indexOf(`id="pb-sess-${n}"`), n < 13 ? out.indexOf(`id="pb-sess-${n + 1}"`) : undefined);
  /** 문구 옆에 붙인 내 페이스 괄호 */
  const PACE_SPAN = /text-primary">\(\d+:\d{2}(~\d+:\d{2})?\)<\/span>/;
  /** 목표 45:00 · 1주차 5K 23:00 → 기록 환산(4:48)이 목표(4:30)보다 느려 P = 4:48 */
  const slowRec = { goalSec: 2700, base5kSec: 1380, mid5kSec: null, midWkNo: 6 };

  it("주차 라벨은 「n주차 · M/D(요일)」, 측정은 「측정」이다", () => {
    const out = html(createElement(PbTraining, { ...base, phase: { kind: "week", wkNo: 5 } }));

    expect(out).toContain(">5주차</span>");
    expect(out).toContain("· 12/2(수) 19:30"); // 연결된 벙 시각(KST)
    expect(out).toContain(">측정</span>");
    expect(out).not.toMatch(/W\d/);
  });

  it("단계 대신 훈련 종류 칩 — 단계 이름도 목적 칸도 없다", () => {
    const out = html(createElement(PbTraining, { ...base, phase: { kind: "week", wkNo: 5 } }));

    for (const cd of new Set(PB_DEFAULT_SESS_PLANS.map((p) => p.kindCd))) {
      expect(out).toContain(`>${PB_TRN_KINDS[cd].nm}</span>`);
    }
    expect(out).toContain(">업힐 훈련</span>");
    expect(out).toContain(">VO2max 훈련</span>");
    expect(sessOf(out, 3)).toContain(">업힐 훈련</span>");
    expect(sessOf(out, 13)).toContain(">기록 측정</span>");
    for (const phaseNm of ["기초", "점검", "강화", "특화", "마무리"]) expect(out).not.toContain(`>${phaseNm}<`);
    expect(out).not.toContain("목적");
    expect(out).not.toContain("단계");
  });

  it("펼친 칸은 그 종류의 속도와 기르는 것을 말한다", () => {
    const out = html(createElement(PbTraining, { ...base, phase: { kind: "week", wkNo: 5 } }));
    const wk5 = sessOf(out, 5); // 템포런 — 역치 훈련

    expect(wk5).toContain(PB_TRN_KINDS.THR.what);
    expect(wk5).toContain(PB_TRN_KINDS.THR.pace);
  });

  it("이번 주 칸 하나만 펼치고 짚는다", () => {
    const out = html(createElement(PbTraining, { ...base, phase: { kind: "week", wkNo: 5 } }));

    expect(out.match(/<details[^>]* open=""/g)).toHaveLength(1);
    expect(out).toMatch(/id="pb-sess-5" data-focus="true"/);
    expect(out).toContain("이번 주");
  });

  it("이번 주 공식훈련이 이미 열렸으면 다음 주를 펼친다", () => {
    // 4주차 벙은 held=true — 금요일에 연 사람이 볼 건 다음 수요일
    expect(pbFocusOf({ kind: "week", wkNo: 4 }, makeSessions(), CFG)).toEqual({ sessNo: 5, tag: "다음 훈련" });
  });

  it("시작 전엔 1주차, 종료 뒤엔 펼칠 칸이 없다", () => {
    expect(pbFocusOf({ kind: "before", dDay: 3 }, makeSessions(), CFG)?.sessNo).toBe(1);
    expect(pbFocusOf({ kind: "closed" }, makeSessions(), CFG)).toBeNull();
  });

  it("벙이 안 걸린 주는 그 주 시작일, 측정은 날짜 미정", () => {
    const out = html(createElement(PbTraining, { ...base, sessions: [], phase: { kind: "week", wkNo: 1 } }));

    expect(out).toContain("· 11/4(수)"); // weekStartDt(1주차)
    expect(out).toContain("· 11/11(수)");
    expect(out).toContain("날짜 미정");
  });

  it("첫 10K 그룹 — 세션을 설명하는 38~50분 줄이 위, 내 줄(첫 10K)은 반전 꼬리표로 짚는다", () => {
    // easyTxt 는 줄인 양(「6회」)만 적혀 있어 그것만 위에 세우면 무엇을 6회 하는지 모른다
    const out = html(createElement(PbTraining, { ...base, trnGrpCd: "E", phase: { kind: "week", wkNo: 2 } }));
    const wk4 = sessOf(out, 4); // 400m 반복 — 첫 10K 는 6회

    expect(wk4.indexOf("400m @ P-15초")).toBeLessThan(wk4.indexOf(">6회<"));
    expect(wk4).toMatch(/bg-foreground text-background">첫 10K</);
    expect(wk4).toMatch(/bg-secondary text-muted-foreground">38~50분</);
    expect(out).toContain("내 훈련팀");
    expect(out).toContain(">첫 10K · 60분 이하<");
  });

  it("세션 꼬리표는 알파벳(A~D·E)이 아니라 38~50분 · 첫 10K · 전원이다", () => {
    const out = html(createElement(PbTraining, { ...base, trnGrpCd: "C", phase: { kind: "week", wkNo: 2 } }));
    const wk4 = sessOf(out, 4);

    expect(out).toContain(">38~50분<");
    expect(out).toContain(">첫 10K<");
    expect(out).toContain(">전원<"); // 기록 측정 같은 공통 세션
    expect(out).not.toContain(">A~D<");
    expect(out).not.toContain(">E<");
    // 내 그룹(38~50분) 줄이 주인공이고 첫 10K 줄은 참고
    expect(wk4).toMatch(/bg-foreground text-background">38~50분</);
    expect(wk4).toMatch(/bg-secondary text-muted-foreground">첫 10K</);
  });

  it("내 훈련팀 카드는 목표 시간 이름 + 10K 목표기록 + 대회 페이스만 — 주간 거리는 없다", () => {
    const out = html(createElement(PbTraining, { ...base, trnGrpCd: "C", phase: { kind: "week", wkNo: 2 } }));

    expect(out).toContain("내 훈련팀");
    expect(out).toContain(">45분 이하<");
    expect(out).toContain("10K 목표 45:00 이내 · 대회 페이스 4:30/km");
    expect(out).not.toContain("주간 거리");
    expect(out).not.toMatch(/주 \d+~?\d*km/);
    expect(out).not.toContain(">C<"); // 알파벳 코드를 큰 글씨로 세우지 않는다
  });

  it("쪼갠 반(D1)도 50분 이하 그룹으로 읽히고 알파벳이 새지 않는다", () => {
    const out = html(createElement(PbTraining, { ...base, trnGrpCd: "D1", phase: { kind: "week", wkNo: 2 } }));

    expect(out).toContain(">50분 이하<");
    expect(out).toContain("10K 목표 50:00 이내 · 대회 페이스 5:00/km");
    expect(out).not.toContain("D1");
  });

  it("훈련팀이 아직 없으면 정해지는 방법(내 P)을 말한다", () => {
    const out = html(createElement(PbTraining, { ...base, me: makeMe(1, []), phase: { kind: "week", wkNo: 2 } }));

    expect(out).toContain("훈련팀은 내 P로 정해져요");
    expect(out).not.toContain("1주차 5K 기록으로 정해져요"); // 자동 배정 전의 옛 규칙
    expect(out).not.toContain("내 훈련팀");
  });

  it("훈련팀 카드는 어떻게 정해졌는지 한 줄 — 자동이면 내 P를 따라 바뀔 수 있고, 고정이면 그 말을 하지 않는다", () => {
    const auto = html(createElement(PbTraining, { ...base, me: makeMe(1, []), trnGrpCd: "C", phase: { kind: "week", wkNo: 2 } }));
    expect(auto).toContain("내 P를 따라 정해져요 · 중간점검 기록을 올리면 바뀔 수 있어요");

    const fixed = html(
      createElement(PbTraining, { ...base, me: makeMe(1, []), trnGrpCd: "C", trnGrpFixed: true, phase: { kind: "week", wkNo: 2 } }),
    );
    expect(fixed).toContain("운영진이 정한 팀이에요");
    expect(fixed).not.toContain("내 P를 따라 정해져요");
  });

  it("내 P 카드 — 기록이 목표보다 느리면 기록 기준, 이유와 환산 칸까지", () => {
    const out = html(
      createElement(PbTraining, {
        ...base,
        me: makeMe(1, []),
        trnGrpCd: "C",
        paceInput: slowRec,
        phase: { kind: "week", wkNo: 2 },
      }),
    );

    expect(out).toContain(">내 P<");
    expect(out).toMatch(/>4:48<\/span><span[^>]*>\/km</);
    expect(out).toContain("1주차 5K 기록 기준 — 목표 4:30보다 느려서");
    // 환산 칸 — 훈련 문구와 같은 표기(「P-15초」)
    for (const [label, pace] of [
      ["P-15초", "4:33"],
      ["P-10초", "4:38"],
      ["P", "4:48"],
      ["P+10초", "4:58"],
      ["P+15초", "5:03"],
    ]) {
      expect(out).toMatch(new RegExp(`>${label.replace("+", "\\+")}</dt><dd[^>]*>${pace}</dd>`));
    }
    expect(out).toContain("조깅 · P+1:30~2:00");
    expect(out).toContain(">6:18~6:48<");
  });

  it("내 P 카드 — 5K 기록이 목표보다 빠르면 목표 기준", () => {
    const out = html(
      createElement(PbTraining, {
        ...base,
        me: makeMe(1, []),
        paceInput: { goalSec: 2700, base5kSec: 1200, mid5kSec: null, midWkNo: 6 },
        phase: { kind: "week", wkNo: 2 },
      }),
    );

    expect(out).toMatch(/>4:30<\/span><span[^>]*>\/km</);
    expect(out).toContain("10K 목표 45:00 기준 — 5K 기록이 이미 목표보다 빨라요");
  });

  it("훈련 문구의 P 옆에 내 실제 페이스를 붙인다 — 원문 괄호는 건드리지 않는다", () => {
    const out = html(
      createElement(PbTraining, { ...base, me: makeMe(1, []), paceInput: slowRec, phase: { kind: "week", wkNo: 2 } }),
    );

    // 4주차 400m @ P-15초 → 4:33, 7주차 800m @ P-10~15초 → 4:33~4:38
    expect(sessOf(out, 4)).toContain('400m @ P-15초<span class="font-medium tabular-nums text-primary">(4:33)</span>');
    expect(sessOf(out, 7)).toContain('P-10~15초<span class="font-medium tabular-nums text-primary">(4:33~4:38)</span>');
    // 11주차 — 맨 P 는 붙이고, 「(38분 이하는 3회)」는 원문 괄호라 그대로
    expect(sessOf(out, 11)).toContain(
      '3km @ P<span class="font-medium tabular-nums text-primary">(4:48)</span> → 4분 조깅 · 2회 (38분 이하는 3회)',
    );
    expect(out).not.toMatch(/text-primary">\(38분/);
  });

  it("P를 못 정하면 훈련팀 대회 페이스로 물러나고, 문구 옆 숫자는 세우지 않는다", () => {
    const out = html(
      createElement(PbTraining, {
        ...base,
        me: makeMe(1, []),
        trnGrpCd: "C",
        paceInput: { goalSec: null, base5kSec: null, mid5kSec: null, midWkNo: 6 },
        phase: { kind: "week", wkNo: 2 },
      }),
    );

    expect(out).toContain(">내 P<");
    expect(out).toContain(">4:30/km<");
    expect(out).toContain("훈련팀 대회 페이스");
    expect(out).toContain("목표나 5K 기록을 올리면 내 P가 계산돼요");
    expect(out).not.toMatch(PACE_SPAN);
    expect(out).not.toContain("내 P 환산");
  });

  it("구경꾼에겐 내 P 카드도 문구 옆 숫자도 없다", () => {
    const out = html(createElement(PbTraining, { ...base, phase: { kind: "week", wkNo: 2 } }));

    expect(out).not.toContain(">내 P<");
    expect(out).not.toContain("목표나 5K 기록을 올리면");
    expect(out).not.toMatch(PACE_SPAN);
  });

  it("개인 훈련 — 회차마다 읽기만 하는 안내(체크 칸·버튼 없음)", () => {
    const out = html(createElement(PbTraining, { ...base, me: makeMe(1, []), phase: { kind: "week", wkNo: 4 } }));

    expect(out.match(/>개인 훈련</g)).toHaveLength(PB_DEFAULT_SESS_PLANS.length);
    const wk4 = sessOf(out, 4); // 「이지런 2~3회 · 스트라이드 주 2회 · 장거리 1회 13km / 9km」를 한 줄에 하나씩
    expect(wk4).toContain(">이지런 2~3회<");
    expect(wk4).toContain(">스트라이드 주 2회<");
    expect(wk4).toContain(">장거리 1회 13km / 9km<");
    expect(sessOf(out, 1)).toContain(">장거리 1회 38~45분 12km / 50분·첫 10K 8km<"); // 붙은 가운뎃점은 안 자른다
    expect(out).not.toMatch(/<input|<button|checkbox/);
  });

  it("참가자에겐 회차마다 내 출석 상태를 단다", () => {
    const me = makeMe(1, ["g1", "g2", "g4"]);
    const out = html(createElement(PbTraining, { ...base, me, phase: { kind: "week", wkNo: 5 } }));

    expect(out.match(/>출석<\/span>/g)).toHaveLength(3);
    expect(out).toContain(">결석</span>");
  });

  it("훈련표가 비면 준비 중이라고 말한다", () => {
    const out = html(createElement(PbTraining, { ...base, plans: [], phase: { kind: "week", wkNo: 1 } }));
    expect(out).toContain("운영진이 훈련표를 준비하고 있어요");
  });
});

describe("PbHero", () => {
  it("지금 주차·다음 공식훈련·내 출석 요약을 한 칸에", () => {
    const me = makeMe(1, ["g1", "g2", "g4"]);
    const out = html(
      createElement(PbHero, { evt: EVT, cfg: CFG, sessions: makeSessions(), nowIso: nowAtWeek(5, 0), me }),
    );

    expect(out).toContain("지금 5주차");
    expect(out).toContain('href="/gatherings/g5"');
    expect(out).toContain("다음 5주차 공식훈련");
    expect(out).toContain('aria-label="13회 중 3회 출석"');
    expect(out).toContain("10,000원");
  });

  it("시작 전엔 D-n, 종료면 종료 칩이고 다음 훈련 카드가 없다", () => {
    expect(pbPhaseOf(EVT, CFG, "2026-11-01T03:00:00Z")).toEqual({ kind: "before", dDay: 3 });
    expect(pbPhaseOf({ ...EVT, sttsEnm: "CLOSED" }, CFG, nowAtWeek(5))).toEqual({ kind: "closed" });

    const out = html(
      createElement(PbHero, {
        evt: { ...EVT, sttsEnm: "CLOSED" },
        cfg: CFG,
        sessions: makeSessions(),
        nowIso: nowAtWeek(5),
        me: null,
      }),
    );
    expect(out).toContain("종료");
    expect(out).not.toContain("/gatherings/");
  });
});

describe("탭", () => {
  it("승인된 참가자는 내 현황부터, 그 밖은 안내부터 — 볼 수 없는 탭은 기본으로 떨어진다", () => {
    expect(resolvePbView(undefined, true)).toEqual({
      tabs: ["status", "training", "score", "guide"],
      active: "status",
    });
    expect(resolvePbView(undefined, false).active).toBe("guide");
    expect(resolvePbView("status", false).active).toBe("guide");
    expect(resolvePbView("training", false).active).toBe("training");
    expect(resolvePbView("nope", true).active).toBe("status");
  });

  it("탭은 ?evt=&view= 링크이고 지금 탭만 current 다", () => {
    const out = html(
      createElement(PbViewTabs, { evtId: "e1", tabs: ["status", "training", "score", "guide"], active: "training" }),
    );

    expect(out).toContain('href="/projects?evt=e1&amp;view=guide"');
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="page"[^>]*>훈련/);
    for (const label of ["내 현황", "훈련", "점수판", "안내"]) expect(out).toContain(label);
  });

  it("종료된 프로젝트(보관용)에선 신청도 입금 안내도 세우지 않는다", () => {
    expect(pbGuideTop(false, null)).toBe("apply");
    expect(pbGuideTop(false, { aprvYn: false })).toBe("pending");
    expect(pbGuideTop(false, { aprvYn: true })).toBeNull();
    expect(pbGuideTop(true, null)).toBeNull();
    expect(pbGuideTop(true, { aprvYn: false })).toBeNull();
  });
});

describe("신청·입금 대기 — 마일리지런 할인", () => {
  it("할인 대상이면 원래 금액을 지우고 사유와 깎인 금액을 보여 준다", () => {
    const out = html(createElement(PbApplySection, { evtId: "e1", cfg: CFG, currentWkNo: 1, mlgAlumni: true }));

    expect(out).toContain("마일리지런 참가자 보증금 −5,000원");
    expect(out).toMatch(/line-through[^>]*>30,000원/);
    expect(out).toContain("25,000원");
    expect(out).toContain("35,000원으로 참가 신청");
  });

  it("중간 합류면 주차와 줄어든 기준을 말한다(W 표기 없이)", () => {
    const out = html(createElement(PbApplySection, { evtId: "e1", cfg: CFG, currentWkNo: 3, mlgAlumni: false }));
    expect(out).toContain("3주차 합류 — 7회 나오면 보증금 전액");
    expect(out).not.toMatch(/W\d/);
    expect(out).not.toContain("line-through");
  });

  it("입금 대기 카드는 저장된 할인·금액을 그대로 적는다", () => {
    const out = html(
      createElement(PbPendingCard, { me: { depositAmt: 25_000, entryFeeAmt: 10_000, depositDcAmt: 5_000, joinWkNo: 1 } }),
    );
    expect(out).toContain("35,000");
    expect(out).toContain("마일리지런 참가자 보증금 −5,000원");
  });
});

describe("지난 프로젝트", () => {
  it("종료된 프로젝트를 종류·기간과 함께 ?evt= 링크로 나열한다", () => {
    const out = html(
      createElement(ProjectArchive, {
        events: [
          { evt_id: "c1", evt_nm: "26 마일리지런 시즌3", evt_type_cd: "MILEAGE_RUN", stt_dt: "2026-03-01", end_dt: "2026-05-31" },
        ],
      }),
    );
    expect(out).toContain('href="/projects?evt=c1"');
    expect(out).toContain("마일리지런");
    expect(out).toContain("2026.3.1 – 2026.5.31");
  });

  it("목록이 비면 칸째 안 그리고, 보관 띠는 읽기 전용을 먼저 말한다", () => {
    expect(html(createElement(ProjectArchive, { events: [] }))).toBe("");
    const banner = html(createElement(ArchivedBanner, { hasActive: true }));
    expect(banner).toContain("종료된 프로젝트 · 기록 보관용");
    expect(banner).toContain('href="/projects"');
  });
});

describe("ProjectSwitcher", () => {
  it("선택은 ?evt= 링크로 남고 현재 프로젝트만 current로 표시된다", () => {
    const out = html(
      createElement(ProjectSwitcher, {
        events: [
          { evt_id: "e-pb", evt_nm: "겨울 10K PB 클래스" },
          { evt_id: "e-mlg", evt_nm: "26 마일리지런 시즌4" },
        ],
        selectedId: "e-pb",
      }),
    );

    expect(out).toContain('href="/projects?evt=e-pb"');
    expect(out).toContain('href="/projects?evt=e-mlg"');
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    // 다른 프로젝트의 월·탭 쿼리가 따라오면 안 된다
    expect(out).not.toContain("month=");
  });
});
