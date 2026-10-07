import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { dayjs } from "@/lib/dayjs";
import { PB_CLASS_DEFAULT_CFG, summarizeRefund, type PbClassCfg } from "@/lib/pb-class";
import type { PbParticipant, PbSession } from "@/lib/queries/pb-class";

import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { PbMyStatus } from "@/components/projects/pb-class/pb-my-status";
import { PbRulesContent } from "@/components/projects/pb-class/pb-rules-content";
import { PbSessionStrip } from "@/components/projects/pb-class/pb-session-strip";

/**
 * PB 클래스 회원 화면의 **규칙이 마크업에 실제로 나오는지** 못박는다.
 *
 * 숫자 계산은 `lib/__tests__/pb-class.test.ts`가 지킨다. 여기서 보는 건 그 결과를 화면이
 * 어떻게 말하느냐다 — 정식 참가자의 분모 13, 중간 합류자의 「W3 합류」 표기, 늦은 합류자에게
 * 환급 칸이 아예 안 서는 것, 합류 전 회차가 흐려지는 것. 전부 틀려도 크래시가 안 나는 종류다.
 */

const CFG = PB_CLASS_DEFAULT_CFG;

/** W1~W12 공식훈련 + W13 측정. 앞 4주(W1~W4)만 이미 열렸다 */
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
    expect(out).not.toContain("W1 합류"); // 정식은 합류 주차를 말하지 않는다
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

    expect(out).toContain("W3 합류");
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

describe("PbRulesContent", () => {
  it("숫자를 설정값에서 뽑는다 — 설정이 바뀌면 문장도 바뀐다", () => {
    const base = html(createElement(PbRulesContent, { cfg: CFG }));
    expect(base).toContain("4만 원");
    expect(base).toContain("13회 중 9회");
    expect(base).toContain("W6부터");

    const custom: PbClassCfg = {
      totSessCnt: 10,
      fullRfndAttdCnt: 7,
      lateJoinWkNo: 5,
      depositAmt: 20_000,
      entryFeeAmt: 5_000,
    };
    const changed = html(createElement(PbRulesContent, { cfg: custom }));
    expect(changed).toContain("25,000원");
    expect(changed).toContain("10회 중 7회");
    expect(changed).toContain("W5부터");
    expect(changed).not.toContain("13회");
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
