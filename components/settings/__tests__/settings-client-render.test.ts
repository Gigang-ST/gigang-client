import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * 더보기 화면이 실제로 무엇을 어떤 **순서로** 그리는지 마크업으로 못박는다.
 *
 * 픽셀을 보는 자리가 아니라 **규칙이 지켜지는지**를 보는 자리다: 소셜이 맨 위인가, 두 덩어리
 * 경계가 유지되는가(가는 문 ↔ 스위치·문서), 약관·버전이 푸터로 내려가 있는가, 관리자 줄이
 * 관리자에게만 서는가, 회비 미납 점이 그 줄에만 붙는가. 전부 **틀려도 크래시가 없는** 종류라
 * 눈으로만 지키면 언젠가 조용히 어긋난다 — 실제로 이 화면은 그렇게 7섹션 18줄까지 자랐다.
 *
 * ⚠️ **딥링크(`?social=kakao`)는 여기서 못 잡는다.** 다이얼로그를 여는 건 `useEffect`인데
 * `renderToStaticMarkup`은 effect를 돌리지 않는다(환경도 jsdom이 아니라 node다).
 * 그 경로는 브라우저에서 확인해야 한다.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings",
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: () => {} }),
}));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock("@/app/actions/mark-board-type-read", () => ({
  markBoardTypeRead: async () => {},
}));
vi.mock("@/app/actions/set-week-start", () => ({ setWeekStart: async () => {} }));
vi.mock("@/app/actions/social/get-kakao-password", () => ({
  getKakaoChatPassword: async () => ({ status: "member", password: "1234" }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: async () => ({ error: null }) } }),
}));

const { SettingsClient } = await import("@/components/settings/settings-client");
const { APP_VERSION } = await import("@/lib/app-version");

/** 마크업에서 태그만 걷고 엔티티를 되돌린다 */
function text(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&copy;/g, "©")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function render(
  props: Partial<Parameters<typeof SettingsClient>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(SettingsClient, {
      isAdmin: false,
      weekStart: "sun",
      ...props,
    } as Parameters<typeof SettingsClient>[0]),
  );
}

describe("더보기 화면", () => {
  it("소셜이 맨 위에 서고, 두 덩어리 순서가 유지된다", () => {
    const t = text(render());

    // 가는 문 → 띠 → 스위치·문서
    const order = ["SOCIAL", "MY", "CREW", "설정", "앱 설정", "계정"];
    const positions = order.map((label) => t.indexOf(label));

    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("채널 넷이 모두 뜬다", () => {
    const t = text(render());
    for (const label of ["오픈채팅", "인스타", "소모임", "가민"]) {
      expect(t).toContain(label);
    }
  });

  it("소셜이 MY보다 먼저 온다 — 못 찾는 사람이 여는 방의 첫 칸이라서", () => {
    const t = text(render());
    expect(t.indexOf("오픈채팅")).toBeLessThan(t.indexOf("프로필 수정"));
  });

  it("약관 셋과 버전은 목록 행이 아니라 푸터에 있다", () => {
    const t = text(render());
    const legal = ["이용약관", "개인정보 처리방침", "운영 정책"];

    // 셋 다 존재하되, 아래 덩어리의 마지막 그룹(계정)보다 뒤 = 푸터
    for (const label of legal) {
      expect(t).toContain(label);
      expect(t.indexOf(label)).toBeGreaterThan(t.indexOf("회원 탈퇴"));
    }
    expect(t).toContain(APP_VERSION);
    expect(t.indexOf(APP_VERSION)).toBeGreaterThan(t.indexOf("회원 탈퇴"));

    // "버전 정보"라는 목록 행은 사라졌다(푸터에 숫자만 남는다)
    expect(t).not.toContain("버전 정보");
  });

  it("MCP 토큰은 아래 덩어리로 내려간다", () => {
    const t = text(render());
    expect(t.indexOf("MCP 토큰")).toBeGreaterThan(t.indexOf("대회 목록"));
    expect(t.indexOf("MCP 토큰")).toBeGreaterThan(t.indexOf("다크모드"));
    expect(t).toContain("AI 도구 연결용");
  });

  it("'도움말 및 지원'은 '기강 소개'로 바뀐다 — 목적지가 크루 소개라서", () => {
    const t = text(render());
    expect(t).toContain("기강 소개");
    expect(t).not.toContain("도움말 및 지원");
  });

  it("관리자 페이지는 관리자에게만, 자기 섹션 없이 CREW 맨 위에 선다", () => {
    expect(text(render({ isAdmin: false }))).not.toContain("관리자 페이지");

    const t = text(render({ isAdmin: true }));
    expect(t).toContain("관리자 페이지");
    // CREW 라벨 바로 뒤 = 그룹 맨 위(운영진이 가장 자주 누르는 줄이라서)
    expect(t.indexOf("관리자 페이지")).toBeGreaterThan(t.indexOf("CREW"));
    expect(t.indexOf("관리자 페이지")).toBeLessThan(t.indexOf("공지사항"));
    // 한 줄짜리 ADMIN 섹션을 다시 만들지 않는다
    expect(t).not.toContain("ADMIN");
  });

  it("회비 미납 점은 '회비 내역' 줄에만 붙고, 없으면 안 붙는다", () => {
    expect(text(render({ duesUnpaid: false }))).not.toContain("회비 미납");

    const t = text(render({ duesUnpaid: true }));
    expect(t).toContain("회비 미납");
    // 점 라벨이 회비 내역과 건의하기 사이 = 그 줄에 붙었다
    expect(t.indexOf("회비 미납")).toBeGreaterThan(t.indexOf("회비 내역"));
    expect(t.indexOf("회비 미납")).toBeLessThan(t.indexOf("건의하기"));
  });

  it("공지·업데이트 안읽음 점은 각 줄에 따로 붙는다", () => {
    const none = text(render({ boardUnread: { notice: false, update: false } }));
    expect(none).not.toContain("읽지 않은 공지");
    expect(none).not.toContain("읽지 않은 업데이트");

    const t = text(render({ boardUnread: { notice: true, update: false } }));
    expect(t).toContain("읽지 않은 공지");
    expect(t).not.toContain("읽지 않은 업데이트");
  });
});
