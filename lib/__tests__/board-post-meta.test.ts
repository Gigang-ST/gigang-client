import { describe, expect, it } from "vitest";
import { boardPostDescription } from "@/lib/seo/board-post-meta";

/**
 * 게시글 meta description 회귀 테스트.
 *
 * 이 문자열은 검색결과 스니펫에 그대로 나간다 — 마크다운 기호가 새어 나가면 사람이
 * 보는 자리에서 깨지고, 빈 문자열이 나가면 루트 설명을 물려받아 홈과 같은 설명이 되어
 * 네이버가 중복 문서로 잡는다. 둘 다 화면에서는 안 보이는 고장이라 여기서 못박는다.
 */
describe("boardPostDescription", () => {
  it("마크다운 서식을 걷어낸다", () => {
    const md = "## 회비 안내\n\n**월 2,000원**이며 [규칙](https://gigang.team/rules)을 참고하세요.";
    expect(boardPostDescription(md, "제목")).toBe(
      "회비 안내 월 2,000원이며 규칙을 참고하세요.",
    );
  });

  it("이미지와 코드 블록을 버린다", () => {
    const md = "![사진](https://x/y.png)\n\n```js\nconst a = 1;\n```\n\n본문만 남는다";
    expect(boardPostDescription(md, "제목")).toBe("본문만 남는다");
  });

  it("인용·목록 기호를 뗀다", () => {
    expect(boardPostDescription("- 첫째\n- 둘째\n> 인용", "제목")).toBe("첫째 둘째 인용");
  });

  it("150자를 넘으면 자르고 말줄임을 붙인다", () => {
    const out = boardPostDescription("가".repeat(300), "제목");
    expect(out).toHaveLength(150);
    expect(out.endsWith("…")).toBe(true);
  });

  // slice()는 UTF-16 코드 단위라 이모지를 반토막 낸다 — 깨진 글자가 스니펫에 뜬다.
  it("이모지를 반토막 내지 않는다", () => {
    const out = boardPostDescription("🏃".repeat(300), "제목");
    expect(Array.from(out)).toHaveLength(150);
    expect(out).not.toContain("�");
    // 말줄임을 뺀 본문이 온전한 이모지로만 이뤄져야 한다.
    expect(out.slice(0, -1)).toBe("🏃".repeat(149));
  });

  // 폴백 경로가 제한을 안 타면 긴 제목이 그대로 나간다.
  it("제목으로 폴백할 때도 길이 제한을 지킨다", () => {
    const out = boardPostDescription("", "제".repeat(300));
    expect(out).toHaveLength(150);
    expect(out.endsWith("…")).toBe(true);
  });

  it("150자 이하는 그대로 둔다", () => {
    expect(boardPostDescription("짧은 글", "제목")).toBe("짧은 글");
  });

  // 빈 설명은 루트 값을 상속해 홈과 같은 설명이 된다 — 그게 중복 문서 판정 조건이다.
  it.each(["", "   ", "![사진](https://x/y.png)", "***"])(
    "본문에서 건질 게 없으면(%j) 제목을 되돌린다",
    (content) => {
      expect(boardPostDescription(content, "회비 안내")).toBe("회비 안내");
    },
  );
});
