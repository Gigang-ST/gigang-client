import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  RecordsClient,
  TrailContent,
  TriathlonContent,
  type BoardContext,
} from "@/app/(main)/records/records-client";

/**
 * 전당이 실제로 무엇을 그리는지 마크업으로 못박는다.
 *
 * 픽셀을 보는 자리가 아니라 **규칙이 지켜지는지**를 보는 자리다: 1위가 띠로 올라가고 목록은
 * 2위부터인가, 판독선이 격차를 다는가, 철인엔 순위 배지가 안 붙는가. 전부 "틀려도 크래시가
 * 없는" 종류라 눈으로만 지키면 언젠가 어긋난다.
 *
 * 카테고리 전환은 클라이언트 상태라 SSR HTML로는 마라톤 판만 보인다 —
 * 트레일·철인은 판 컴포넌트를 직접 그려 확인한다.
 */

const ME = "me-0000";

/** 마크업에서 태그만 걷고 엔티티를 되돌린다 */
function text(html: string) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

const TITLES = {
  m1: {
    ttl_nm: "기강킹",
    ttl_desc: "가장 빠른 사람",
    desc_visibility: "others" as const,
    badge_effect: "gold",
    frame_cd: "frame-gold",
  },
};

const META = {
  m1: { avatar_url: null, intro_txt: "오늘도 한 발 더" },
  f1: { avatar_url: null, intro_txt: null },
};

const DATA = {
  marathon: {
    events: [
      {
        eventType: "FULL",
        label: "풀마라톤",
        male: [
          { rank: 1, memId: "m1", name: "송창준", record: "2:48:30", recordSec: 10110, raceName: "2026 동아마라톤" },
          { rank: 2, memId: "m2", name: "김준민", record: "2:50:00", recordSec: 10200, raceName: "춘천마라톤" },
          { rank: 3, memId: ME, name: "나", record: "3:02:33", recordSec: 10953, raceName: "서울마라톤" },
        ],
        female: [
          { rank: 1, memId: "f1", name: "윤정선", record: "3:35:04", recordSec: 12904, raceName: "나고야 우먼스" },
          { rank: 2, memId: "f2", name: "양아인", record: "3:35:30", recordSec: 12930, raceName: "동아마라톤" },
        ],
      },
    ],
  },
  trail: { entries: [] },
  triathlon: { events: [] },
  memberTitles: TITLES,
  memberMeta: META,
};

function render(overrides: Partial<Parameters<typeof RecordsClient>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(RecordsClient, {
      data: DATA,
      myTitleNames: [],
      myMemId: ME,
      teamId: "team-1",
      ...overrides,
    }),
  );
}

const ctx: BoardContext = {
  memberTitles: Object.fromEntries(
    Object.entries(TITLES).map(([k, v]) => [k, { ...v, isHeld: false }]),
  ),
  memberMeta: META,
  myMemId: ME,
  onSelectMember: () => {},
};

/* ------------------------------------------------------------------ */

describe("마라톤 판", () => {
  const html = render();

  it("1위는 board 띠로 올라간다", () => {
    expect(html).toContain("bg-board");
    // "Champion"이 아니다 — 경기에서 이긴 게 아니라 크루 기록을 갖고 있는 사람이다
    expect(html).toContain("Record Holder");
    expect(html).not.toContain("Champion");
    expect(text(html)).toContain("송창준");
    expect(text(html)).toContain("윤정선");
  });

  it("한마디가 있으면 띠에 함께 세우고, 없으면 줄째 안 그린다", () => {
    expect(text(html)).toContain("오늘도 한 발 더");
    // 여자 챔피언은 한마디가 없다 → 빈 인용부호가 남지 않는다(여는 따옴표는 하나뿐)
    expect(html.split("“").length - 1).toBe(1);
  });

  it("목록은 2위부터다 — 챔피언이 아래에 한 번 더 나오지 않는다", () => {
    const listOnly = html.slice(html.lastIndexOf("남자"));
    expect(listOnly).not.toContain("송창준");
    expect(listOnly).toContain("김준민");
  });

  it("어느 대회 기록인지는 띠에도 목록에도 남는다", () => {
    expect(text(html)).toContain("2026 동아마라톤"); // 챔피언 띠
    expect(text(html)).toContain("춘천마라톤"); // 2위 카드
  });

  it("칭호·한마디가 없어도 자리를 비워 둔다 — 남/여 두 칸이 어긋나지 않게", () => {
    // 칭호 줄과 한마디 두 줄은 값이 없어도 높이를 예약한다
    expect((html.match(/min-h-\[18px\]/g) ?? []).length).toBe(2); // 칭호 자리 — 남·여
    expect((html.match(/min-h-\[30px\]/g) ?? []).length).toBe(2); // 한마디 2줄 자리 — 남·여
  });

  it("한마디는 두 줄에서 자른다", () => {
    expect(html).toContain("line-clamp-2");
  });

  it("2·3위는 어두운 메달 칩 위 메탈릭 숫자 — 4위 이하는 맨숫자", () => {
    expect(html).toContain("title-effect-silver");
    expect(html).toContain("title-effect-bronze");
  });

  it("카드 이펙트는 아바타가 아니라 챔피언 블록에 두른다", () => {
    // 아바타에 붙이면 overflow-hidden에 pseudo-element가 잘려 프레임 4종이 안 켜진다
    expect(html).toContain("board-frame-host");
    expect(html).toMatch(/board-frame-host[^"]*card-frame-gold/);
  });

  it("챔피언 기록은 계기 숫자라 앰버로 찍는다", () => {
    expect(html).toContain("text-board-amber");
  });

  it("판독선이 내 기록·순위·1위와의 격차를 단다", () => {
    const t = text(html);
    expect(t).toContain("내 기록");
    expect(t).toContain("3:02:33");
    expect(t).toContain("1위까지");
    expect(t).toContain("+14:03");
  });

  it("내가 1위면 격차를 달지 않는다", () => {
    expect(text(render({ myMemId: "m1" }))).not.toContain("1위까지");
  });

  it("로그인했는데 그 종목 기록이 없으면 등록으로 보낸다", () => {
    expect(text(render({ myMemId: "nobody" }))).toContain("기록 등록");
  });

  it("비로그인이면 판독선도 등록 유도도 세우지 않는다", () => {
    const t = text(render({ myMemId: null }));
    expect(t).not.toContain("내 기록");
    expect(t).not.toContain("기록 등록");
  });

  it("챔피언뿐이면 남자/여자 머리글만 덩그러니 남기지 않는다", () => {
    const onlyChampions = {
      ...DATA,
      marathon: {
        events: [
          {
            ...DATA.marathon.events[0],
            male: DATA.marathon.events[0].male.slice(0, 1),
            female: DATA.marathon.events[0].female.slice(0, 1),
          },
        ],
      },
    };
    const t = text(render({ data: onlyChampions, myMemId: null }));
    expect(t).toContain("송창준"); // 띠는 선다
    expect(t).not.toContain("남자");
  });

  it("등수는 숫자가 진다 — 스크린리더에도 순위가 남는다", () => {
    expect(html).toContain('aria-label="2위"');
    expect(html).toContain('aria-label="3위"');
  });
});

/* ------------------------------------------------------------------ */

describe("트레일 판 — 성별을 나누지 않아 띠 구성이 다르다", () => {
  const entries = [
    { rank: 1, memId: "m1", name: "서준혁", utmbIndex: 618, recentRaceName: "UTMB CCC", recentRaceRecord: "14:22:05", utmbProfileUrl: "https://utmb.world/x" },
    { rank: 2, memId: ME, name: "나", utmbIndex: 512, recentRaceName: "코리아 50K", recentRaceRecord: "7:22:09", utmbProfileUrl: null },
  ];
  const html = renderToStaticMarkup(createElement(TrailContent, { entries, ctx }));

  it("좌우 2열(MEN/WOMEN)을 세우지 않는다", () => {
    expect(html).not.toContain("WOMEN");
    expect(text(html)).toContain("UTMB INDEX");
    expect(text(html)).toContain("618");
  });

  it("제호가 마라톤과 갈린다 — 지수는 기록이 아니다", () => {
    expect(html).toContain("Top Index");
    expect(html).not.toContain("Record Holder");
  });

  it("지수 격차는 부호가 뒤집히지 않는다(클수록 상위)", () => {
    const t = text(html);
    expect(t).toContain("내 지수");
    expect(t).toContain("1위까지");
    expect(t).toContain("106");
  });

  it("UTMB INDEX가 뭔지 그 자리에서 답한다", () => {
    expect(html).toContain("UTMB INDEX 설명");
  });

  it("연동한 멤버가 없으면 띠를 세우지 않는다", () => {
    const empty = renderToStaticMarkup(createElement(TrailContent, { entries: [], ctx }));
    expect(empty).not.toContain("bg-board");
  });
});

/* ------------------------------------------------------------------ */

describe("철인3종 판 — 순위가 아니라 명단", () => {
  const events = [
    { eventType: "TRIATHLON_FULL", label: "킹", entries: [] },
    {
      eventType: "TRIATHLON_HALF",
      label: "하프",
      entries: [
        { rank: 1, memId: "p1", name: "박정후", record: "4:41:22", recordSec: 16882, raceName: "구미 70.3" },
        { rank: 2, memId: "p2", name: "이도경", record: "5:02:11", recordSec: 18131, raceName: "고성 70.3" },
      ],
    },
    {
      eventType: "TRIATHLON_OLYMPIC_TY",
      label: "올림픽 - 통영",
      entries: [
        { rank: 1, memId: "p3", name: "강태오", record: "2:18:47", recordSec: 8327, raceName: "통영 트라이애슬론" },
      ],
    },
    { eventType: "TRIATHLON_OLYMPIC_ETC", label: "올림픽 - 기타", entries: [] },
  ];
  const html = renderToStaticMarkup(createElement(TriathlonContent, { events, ctx }));

  it("띠를 세우지 않는다 — 세 명 중 하나를 올리면 목록에 둘이 남는다", () => {
    expect(html).not.toContain("bg-board");
    expect(html).not.toContain("Record Holder");
  });

  it("순위 배지를 달지 않는다 — 종목이 다르면 한 줄로 순위를 매길 수 없다", () => {
    expect(html).not.toContain('aria-label="1위"');
    expect(html).not.toContain('aria-label="2위"');
  });

  it("종목은 칩으로 내린다", () => {
    const t = text(html);
    expect(t).toContain("하프");
    expect(t).toContain("올림픽 · 통영");
    expect(t).toContain("박정후");
  });

  it("완주자 없는 킹은 점선 칸으로 자리를 지키고 등록으로 보낸다", () => {
    const t = text(html);
    expect(t).toContain("첫 완주가 전당의 첫 줄이 됩니다");
    expect(t).toContain("기록 등록");
    expect(html).toContain("border-dashed");
  });

  it("올림픽 파생 칸은 비어도 점선으로 세우지 않는다", () => {
    // 빈 점선 칸은 킹 하나뿐 — "올림픽" 칩이 붙은 점선 칸이 생기면 미완성 표로 읽힌다
    expect(html.match(/border-dashed/g)?.length).toBe(1);
  });
});
