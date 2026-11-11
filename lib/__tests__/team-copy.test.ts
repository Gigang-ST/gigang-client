import { describe, expect, it } from "vitest";

import {
  CARD_COPY_KEYS,
  buildTeamCopy,
  pageDescription,
  pickTeamCopy,
  type PageDescriptionKey,
} from "@/lib/team-copy";

const gigang = buildTeamCopy({ teamCd: "gigang", crewName: "기강", memberNoun: "기강인", wordmark: "GIGANG" });
const movof = buildTeamCopy({ teamCd: "ulsan", crewName: "모보브", memberNoun: null });
const blank = buildTeamCopy({ teamCd: "newteam", crewName: null, memberNoun: null });

describe("buildTeamCopy — 기강은 2026-11-10 이전 화면 문구와 한 글자도 다르지 않다", () => {
  it("이름·호칭·기능 이름·사진 지면", () => {
    expect(gigang).toMatchObject({
      crewName: "기강",
      memberNoun: "기강인",
      hallName: "기강의 전당",
      storyName: "기강이야기",
      galleryName: "깅스타그램",
      galleryLabel: "Gingstargram",
      wordmark: "GIGANG",
      orgName: "기강 스포츠 팀",
    });
  });

  it("말장난 문구 그대로", () => {
    expect(gigang.pushPromptTitle).toBe("🔔 기강이 빠졌군. 알림 켜라!");
    expect(gigang.installPromptTitle).toBe("📲 기강이 풀렸군. 홈 화면에 모시고 알림 켜라!");
    expect(gigang.actvKicker).toBe("이번 달 기강 잡는");
    expect(gigang.moodLabels).toEqual({ blazing: "기강 그 자체", steady: "기강 잡아", resting: "기며든다", dormant: "실종" });
    expect(gigang.cardMood).toEqual({
      blazing: "내가 곧 기강의 기준",
      steady: "슬슬 기강 좀 잡아볼까",
      resting: "기강에 관심이 생기는 정도",
    });
  });

  it("홈 리드 헤드라인 — 예전 14줄과 순서까지 같다(대표마다 걸리는 줄이 안 바뀐다)", () => {
    expect(gigang.actvHeadlines).toEqual([
      "{name}, 요즘 제일 뜨겁다",
      "{name}, 지칠 줄을 모른다",
      "{name}, 이번 달 기강의 기준",
      "{name}, 오늘도 달리고 있다",
      "{name}, 두 발이 쉬질 않는다",
      "이번 달, {name}의 심장은 쉬지 않았다",
      "{name}, 심장에 모터라도 달았나",
      "이번 달 가장 뜨거운 심장, {name}",
      "쉬는 법을 잊은 사람, {name}",
      "{name}, 이번 달 기강을 혼자 다 잡았다",
      "아무도 못 말린다, 이번 달 {name}",
      "{name}, 이번 달 러닝화 밑창 갈아치울 기세",
      "이번 달 기강의 심박수는 {name} 담당",
      "{name}, 이번 달 기강의 페이스메이커",
    ]);
  });

  it("한마디 예시 — 예전 12줄과 순서까지 같다", () => {
    expect(gigang.quips[0]).toBe("기강 잡으러 나갔다가 기강 잡혔다");
    expect(gigang.quips[1]).toBe("수배 풀렸습니다");
    expect(gigang.quips).toHaveLength(12);
  });
});

describe("buildTeamCopy — 다른 팀", () => {
  it("모보브: 이름으로 만든 기능 이름, 호칭이 없으면 크루원, 사진 지면은 갤러리", () => {
    expect(movof).toMatchObject({
      crewName: "모보브",
      memberNoun: "크루원",
      hallName: "모보브의 전당",
      storyName: "모보브이야기",
      galleryName: "갤러리",
      galleryLabel: "Gallery",
      orgName: "모보브",
    });
  });

  it("말장난은 중립 문구로 — 「기강」이 한 글자도 안 남는다", () => {
    expect(movof.pushPromptTitle).toBe("🔔 알림을 켜 두세요");
    expect(movof.actvKicker).toBe("이번 달 가장 뜨거운");
    expect(movof.actvHeadlines).toHaveLength(13);
    expect(movof.actvHeadlines).toContain("{name}, 이번 달 모보브의 기준");
    expect(movof.quips).toHaveLength(11);
    expect(JSON.stringify(movof)).not.toContain("기강");
  });

  it("아무것도 안 정한 새 팀은 중립어 — 크루·크루원", () => {
    expect(blank).toMatchObject({ crewName: "크루", memberNoun: "크루원", wordmark: "크루", hallName: "크루의 전당", storyName: "크루이야기" });
    expect(JSON.stringify(blank)).not.toContain("기강");
  });
});

describe("buildTeamCopy — 팀 설정을 못 읽거나 비어도 이름과 말투가 같은 팀으로 맞물린다", () => {
  it("기강: 설정이 다 비어도(조회 실패·마이그레이션 전 배포) 팀 기본 이름 — 「크루이야기」에 「기강이 빠졌군」이 섞이지 않는다", () => {
    const failed = buildTeamCopy({ teamCd: "gigang", crewName: null, memberNoun: null, wordmark: null });
    expect(failed).toMatchObject({
      crewName: "기강",
      memberNoun: "기강인",
      wordmark: "GIGANG",
      hallName: "기강의 전당",
      storyName: "기강이야기",
    });
    // 이름·말투가 둘 다 기강 — 설정이 있을 때와 똑같다
    expect(failed).toEqual(gigang);
  });

  it("팀 설정 값이 있으면 그게 이긴다(팀 기본 이름보다 우선)", () => {
    const renamed = buildTeamCopy({ teamCd: "gigang", crewName: "기강 크루", memberNoun: "기강러", wordmark: null });
    expect(renamed).toMatchObject({ crewName: "기강 크루", memberNoun: "기강러", hallName: "기강 크루의 전당" });
  });

  it("말투 표에 없는 팀은 설정을 못 읽으면 중립어 + 중립 말투 — 역시 섞이지 않는다", () => {
    const failed = buildTeamCopy({ teamCd: "ulsan", crewName: null, memberNoun: null });
    expect(failed).toMatchObject({ crewName: "크루", memberNoun: "크루원", galleryName: "갤러리" });
    expect(JSON.stringify(failed)).not.toContain("기강");
  });
});

const PAGE_KEYS: PageDescriptionKey[] = [
  "board", "join", "newbie", "rules", "terms", "privacy", "policy", "schedule", "races", "records", "projects", "recap",
];

describe("pageDescription — 지면 검색 설명", () => {
  it("기강은 다듬어 둔 문장 그대로(2026-11-11 이전 지면 metadata)", () => {
    expect(pageDescription("records", "gigang", "기강")).toBe(
      "기강 러닝크루 종목별 최고 기록. 5K·10K·하프·풀코스 크루원 기록을 모았습니다.",
    );
    expect(pageDescription("schedule", "gigang", "기강")).toBe(
      "기강 러닝크루의 다가오는 러닝·자전거·수영 모임과 참가 대회 일정.",
    );
    expect(pageDescription("join", "gigang", "기강")).toContain("양재천·강남");
  });

  it("다른 팀은 모든 지면이 그 팀 이름의 중립 문장 — 「기강」·기강 지역·종목이 안 남는다", () => {
    for (const key of PAGE_KEYS) {
      const d = pageDescription(key, "ulsan", "모보브");
      expect(d).toContain("모보브");
      expect(d).not.toMatch(/기강|양재천|강남/);
    }
    expect(pageDescription("races", "ulsan", "모보브")).toMatch(/^모보브가 /); // 조사
  });
});

describe("pickTeamCopy — 화면별로 필요한 칸만 넘긴다", () => {
  it("고른 칸만 실린다 — 헤드라인·한마디 묶음 같은 큰 칸이 카드 화면에 따라가지 않는다", () => {
    const card = pickTeamCopy(gigang, CARD_COPY_KEYS);
    expect(Object.keys(card).sort()).toEqual([...CARD_COPY_KEYS].sort());
    expect(card).not.toHaveProperty("actvHeadlines");
    expect(card.memberNoun).toBe("기강인");
  });
});
