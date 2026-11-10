import { describe, expect, it } from "vitest";

import { buildTeamCopy } from "@/lib/team-copy";

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
