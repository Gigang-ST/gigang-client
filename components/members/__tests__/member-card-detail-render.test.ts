import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MemberCardDetail } from "@/components/members/member-card-detail";

import type { MemberCardData } from "@/lib/queries/member-card";

/**
 * 두 판(편집판·공개판)이 실제로 무엇을 그리는지 마크업으로 못박는다.
 *
 * 여긴 픽셀을 보는 자리가 아니라 **규칙이 지켜지는지**를 보는 자리다: 섹션 순서,
 * 성격별 빈 상태 3갈래, 포인트가 남의 카드로 새지 않는가. 전부 "틀려도 크래시가 없는"
 * 종류라 눈으로만 지키면 언젠가 어긋난다.
 *
 * `next/dynamic(ssr:false)`인 페이스 차트는 여기서 스켈레톤만 나오므로, 차트 섹션의
 * 등장 여부는 `hasPaceTrend`(lib 테스트)가 맡고 여기선 다루지 않는다.
 */

const BASE: MemberCardData = {
  mem_nm: "홍길동",
  avatar_url: null,
  badge_effect: "none",
  frame_cd: "frame-none",
  intro_txt: null,
  running_profile: null,
  primary_title: null,
  join_dt: "2026-03-14",
  back_no: 12,
  utmb_index: null,
  upcoming_race: null,
  last_actv_dt: null,
  recent_actv: [],
  titles: [],
  best_records: [],
  race_records: [],
  rctn_recv_cnt: 0,
  stats: {
    gthr_attd_cnt: 0,
    comp_reg_cnt: 0,
    activity_score: 1240,
    recent_actv_cnt: 0,
  },
};

const EDIT = {
  onOpenPublicCard: () => {},
  onEditAvatar: () => {},
  onEditIntro: () => {},
  onEditTitles: () => {},
  onOpenTitleHistory: () => {},
  onEditProfile: () => {},
  onManageRecords: () => {},
  onAddRecord: () => {},
  onLinkUtmb: () => {},
  point: 1240,
};

function render(data: Partial<MemberCardData>, edit = false) {
  return renderToStaticMarkup(
    createElement(MemberCardDetail, {
      memId: "11111111-1111-4111-8111-111111111111",
      data: { ...BASE, ...data },
      ...(edit ? { edit: EDIT } : {}),
    }),
  );
}

/** 화면에 뜬 섹션 라벨을 나온 순서대로 — 순서가 곧 이 개편의 결과물이다 */
function sectionOrder(html: string): string[] {
  const labels = ["러닝 프로필", "최근활동", "다음 대회", "개인 최고기록", "칭호"];
  return labels
    .map((label) => ({ label, at: html.indexOf(`>${label}`) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.label);
}

describe("편집판(내 프로필탭)", () => {
  it("섹션 순서: 러닝 프로필 → 최근활동 → 다음 대회 → 개인 최고기록", () => {
    expect(sectionOrder(render({}, true))).toEqual([
      "러닝 프로필",
      "최근활동",
      "다음 대회",
      "개인 최고기록",
    ]);
  });

  it("내가 적는 것(러닝 프로필·다음 대회)은 비어도 자리를 지키며 채우라고 말한다", () => {
    const html = render({}, true);
    expect(html).toContain("다른 사람들에게 내 러닝 프로필을 공유해보세요");
    expect(html).toContain("기강 팀원들과 대회에 참석해보세요");
  });

  it("기록 칸은 비어도 네 줄이 서고 UTMB는 연동 버튼이 된다", () => {
    const html = render({}, true);
    for (const label of ["FULL", "HALF", "10K", "UTMB INDEX"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("--:--");
    expect(html).toContain("연동하기");
  });

  it("포인트는 편집판에만 뜬다", () => {
    expect(render({}, true)).toContain("1,240 P");
  });

  it("받은 응원이 0이어도 숨기지 않는다", () => {
    expect(render({ rctn_recv_cnt: 0 }, true)).toContain("받은 응원 0회");
    expect(render({ rctn_recv_cnt: 1484 }, true)).toContain("1,484");
  });

  // 얼굴 탭은 공개판 팝업을 여는 자리라, 사진 변경 진입점은 별도 배지여야 한다.
  // 배지를 아바타 버튼 **안에** 넣으면 버튼 속 버튼이라 마크업이 깨지고, 사진을 바꾸려던
  // 탭이 팝업까지 연다 — 라벨 존재만 보면 그 회귀를 못 잡으므로 중첩 여부를 직접 못박는다.
  it("얼굴에 사진 변경 배지가 붙고, 카드 보기 버튼 안에 중첩되지 않는다", () => {
    const html = render({}, true);
    expect(html).toContain("프로필 사진 변경");

    const cardBtnAt = html.indexOf("남들에게 보이는 내 카드 보기");
    const cardBtnEnd = html.indexOf("</button>", cardBtnAt);
    const badgeAt = html.indexOf("프로필 사진 변경");

    expect(cardBtnAt).toBeGreaterThan(-1);
    // 배지가 카드 보기 버튼이 닫힌 뒤에 나온다 = 그 안에 들어 있지 않다
    expect(badgeAt).toBeGreaterThan(cardBtnEnd);
  });

  it("대표 칭호가 없으면 점선 껍데기가 자리를 지킨다", () => {
    expect(render({ primary_title: null }, true)).toContain("대표 칭호 고르기");
  });

  // 실제로 한 번 밟은 지뢰다: `.board-rise`는 `opacity: 0`이고 `.board-lit .board-rise`에서만
  // 1이 되므로, "탭에선 점등 연출을 끈다"를 lit=false로 구현하면 이름·칭호·한마디가 통째로
  // 안 보인다. 눈으로만 지키면 다시 밟는다.
  it("스크린 존 내용이 보이는 상태로 나온다 — rise 클래스를 안 쓰거나, 쓰면 반드시 board-lit과 함께", () => {
    const html = render({ intro_txt: "올해는 서브4 간다" }, true);
    expect(html).toContain("홍길동");
    if (html.includes("board-rise")) {
      expect(html).toContain("board-lit");
    }
    // 플리커는 매번 들어오는 자리라 끈다
    expect(html).not.toContain("board-flicker");
  });

  // 획득 이력은 **본인만** 보는 자리다(서버 액션도 세션의 team_mem_id만 읽는다).
  // 칭호가 있어야 섹션 자체가 뜨므로 빈 카드로는 이 회귀를 못 잡는다.
  it("획득 이력 진입점은 편집판에만 뜨고 공개판엔 새지 않는다", () => {
    const titles = [
      { ttl_nm: "뉴비", ttl_desc: null, desc_visibility: "others" as const, rarity_level: 1, ttl_ctgr_cd: "base" },
    ];
    expect(render({ titles }, true)).toContain("획득 이력");
    expect(render({ titles })).not.toContain("획득 이력");
  });

  it("칭호는 0개면 섹션째 빠진다(뉴비가 자동으로 붙어 사실상 0이 없다)", () => {
    expect(sectionOrder(render({}, true))).not.toContain("칭호");
    const withTitle = render(
      {
        titles: [
          { ttl_nm: "뉴비", ttl_desc: null, desc_visibility: "others", rarity_level: 1, ttl_ctgr_cd: "base" },
        ],
      },
      true,
    );
    expect(sectionOrder(withTitle)).toContain("칭호");
  });
});

describe("공개판(남이 보는 카드)", () => {
  it("내가 적는 것은 비면 아예 안 뜬다", () => {
    const html = render({});
    expect(sectionOrder(html)).toEqual(["최근활동", "개인 최고기록"]);
    expect(html).not.toContain("다른 사람들에게 내 러닝 프로필을 공유해보세요");
    expect(html).not.toContain("기강 팀원들과 대회에 참석해보세요");
  });

  it("쌓이는 격자(최근활동·개인 최고기록)는 비어도 자리를 지킨다", () => {
    const html = render({});
    expect(html).toContain("최근활동");
    expect(html).toContain("--:--");
  });

  it("포인트는 절대 새지 않는다", () => {
    const html = render({});
    expect(html).not.toContain("1,240 P");
    expect(html).not.toContain(" P<");
  });

  it("편집 어포던스가 하나도 없다 — 내 카드를 열어도 마찬가지", () => {
    const html = render({ intro_txt: "올해는 서브4 간다" });
    expect(html).not.toContain("연동하기");
    expect(html).not.toContain("대표 칭호 고르기");
    // 고치는 자리는 프로필탭 한 곳이다. 팝업은 결과를 확인하는 자리라 한마디도 못 고친다.
    expect(html).not.toContain("한마디 수정");
    expect(html).not.toContain("한마디 남기기");
    expect(html).not.toContain("프로필 사진 변경");
    expect(html).toContain("올해는 서브4 간다"); // 읽히기는 한다
  });

  it("한마디가 없으면 줄 자체가 안 뜬다(공개판 빈 항목 규칙)", () => {
    expect(render({ intro_txt: null })).not.toContain("한마디를 남겨보세요");
  });

  it("러닝 프로필이 있으면 가입 목적까지 한 섹션에 묶여 나온다", () => {
    const html = render({
      running_profile: {
        avg_pace_cd: "P530",
        avg_run_dist_km: 8,
        near_stn_nm: "합정",
        join_purp_cds: ["RUN_MATE"],
        join_purp_txt: null,
      },
    });
    expect(html).toContain("러닝 프로필");
    expect(html).toContain("가입 목적");
    expect(html).toContain("러닝메이트");
    expect(html).toContain("합정역");
  });
});
