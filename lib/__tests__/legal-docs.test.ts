import { describe, expect, it } from "vitest";

import {
  NEUTRAL_OPERATOR,
  buildPolicyDoc,
  buildPrivacyDoc,
  buildTermsDoc,
  type LegalContext,
  type LegalDoc,
} from "@/lib/legal-docs";
import { buildTeamCopy } from "@/lib/team-copy";

import gigangOriginal from "./__fixtures__/legal-gigang-2026-09-30.json";

/**
 * 약관 3종 팀별 문서(#658).
 * - 기강은 2026-11-15 이전 문서(원본 페이지에서 뽑은 고정 자료)와 **한 글자도** 다르지 않다.
 * - 울산(모보브)은 기강 이름·책임자·주소·86년생이 남지 않고, 운영 주체(송창준)가 적히며, 끈 기능(회비·칭호)은 싣지 않는다.
 * - 연락처가 없으면 지어내지 않고 운영진 문의로 안내한다.
 */

const gigangCopy = buildTeamCopy({ teamCd: "gigang", crewName: "기강", memberNoun: "기강인" });
const movofCopy = buildTeamCopy({ teamCd: "ulsan", crewName: "모보브", memberNoun: null });

const gigang: LegalContext = {
  teamCd: "gigang",
  crewName: gigangCopy.crewName,
  hallName: gigangCopy.hallName,
  galleryName: gigangCopy.galleryName,
  appHost: "gigang.team",
  operator: "이현근 (크루장)",
  contact: "team.gigang@gmail.com",
  duesEnabled: true,
  titlesEnabled: true,
};

const ulsan: LegalContext = {
  teamCd: "ulsan",
  crewName: movofCopy.crewName,
  hallName: movofCopy.hallName,
  galleryName: movofCopy.galleryName,
  appHost: "ulsan.gigang.team",
  operator: "송창준",
  contact: null,
  duesEnabled: false,
  titlesEnabled: false,
};

function allText(doc: LegalDoc): string {
  return [doc.heading, doc.effectiveDate, ...doc.history, ...doc.sections.flatMap((s) => [s.title, ...s.details])].join("\n");
}

describe("기강 — 예전 문서 그대로", () => {
  it.each([
    ["terms", buildTermsDoc],
    ["privacy", buildPrivacyDoc],
    ["policy", buildPolicyDoc],
  ] as const)("%s", (kind, build) => {
    expect(build(gigang)).toEqual(gigangOriginal[kind]);
  });

  it("팀 설정을 못 읽어도(빈 값) 기강 책임자·연락처는 코드 기본값으로 남는다", () => {
    expect(buildPrivacyDoc({ ...gigang, operator: null, contact: null })).toEqual(gigangOriginal.privacy);
  });
});

describe("울산(모보브) — 팀별 문서", () => {
  const docs = [buildTermsDoc(ulsan), buildPrivacyDoc(ulsan), buildPolicyDoc(ulsan)];

  it("기강 이름·책임자·주소·나이 제한·기강 기능 이름이 남지 않는다", () => {
    for (const doc of docs) {
      const t = allText(doc);
      for (const word of ["기강", "이현근", "gigang@", "1986", "깅스타그램", "마일리지런"]) {
        expect(t).not.toContain(word);
      }
    }
  });

  it("주체는 모보브와 그 앱 주소, 운영 주체는 송창준", () => {
    const terms = buildTermsDoc(ulsan);
    expect(terms.sections[0].details).toEqual([
      '본 약관은 모보브(이하 "크루")와 모보브 앱(ulsan.gigang.team) 이용에 관한 권리, 의무 및 책임사항을 규정합니다.',
      "크루와 앱의 운영 주체는 송창준입니다.",
    ]);
    const officer = buildPrivacyDoc(ulsan).sections.find((s) => s.title === "개인정보 보호 책임자");
    expect(officer?.details[0]).toBe("송창준");
  });

  it("연락처가 없으면 지어내지 않고 운영진 문의로 안내한다", () => {
    const privacy = buildPrivacyDoc(ulsan);
    const officer = privacy.sections.find((s) => s.title === "개인정보 보호 책임자");
    expect(officer?.details[1]).toContain("운영진에게 문의");
    const rights = privacy.sections.find((s) => s.title === "정보주체의 권리");
    expect(rights?.details.join(" ")).not.toContain("아래 책임자 연락처");
  });

  it("연락처를 넣으면 이메일/전화로 적힌다", () => {
    const officerOf = (contact: string) =>
      buildPrivacyDoc({ ...ulsan, contact }).sections.find((s) => s.title === "개인정보 보호 책임자")?.details[1];
    expect(officerOf("movof@example.com")).toBe("이메일: movof@example.com");
    expect(officerOf("010-0000-0000")).toBe("연락처: 010-0000-0000");
  });

  it("회비·칭호를 끈 팀은 그 조항·항목이 없고, 조항 번호는 빈칸 없이 이어진다", () => {
    const terms = buildTermsDoc(ulsan);
    expect(terms.sections.map((s) => s.title)).not.toContain("회비 및 결제");
    expect(terms.sections.map((s) => s.id)).toEqual(terms.sections.map((_, i) => i + 1));
    expect(allText(terms)).not.toContain("칭호");
    expect(allText(buildPrivacyDoc(ulsan))).not.toContain("회비");
    expect(terms.sections.find((s) => s.title === "기록 및 프로필 공개")?.details[0]).toBe(
      "회원의 이름, 프로필 사진, 한마디, 러닝 프로필, 대회 기록은 모보브 앱에 공개되며, 로그인하지 않은 방문자도 볼 수 있습니다.",
    );
  });
});

describe("설정이 하나도 없는 새 팀", () => {
  it("운영 주체는 「크루 운영진」, 주소 없이 「○○ 앱」", () => {
    const ctx: LegalContext = { ...ulsan, teamCd: "newteam", crewName: "크루", operator: null, appHost: null };
    expect(buildTermsDoc(ctx).sections[0].details).toEqual([
      '본 약관은 크루(이하 "크루")와 크루 앱 이용에 관한 권리, 의무 및 책임사항을 규정합니다.',
      `크루와 앱의 운영 주체는 ${NEUTRAL_OPERATOR}입니다.`,
    ]);
  });
});
