import { buildTeamCopy } from "@/lib/team-copy";

/**
 * 테스트·스토리용 **기강** 팀 문구. 렌더 테스트들의 기대 문구(「기강인만 볼 수 있어요」「기강 소개」 등)가 기강 것이라
 * 화면을 그릴 때 이걸 넘긴다. 필드가 늘어도 여기 한 곳만 고친다(리뷰 2026-11-11 — 10곳에 복사돼 있었다).
 * 팀 문구 자체의 규칙은 `lib/__tests__/team-copy.test.ts` 가 `buildTeamCopy` 로 직접 검증한다.
 */
export const GIGANG_COPY = buildTeamCopy({ teamCd: "gigang", crewName: "기강", memberNoun: "기강인", wordmark: "GIGANG" });

/**
 * 테스트용 **울산(모보브)** 팀 문구 — 다른 팀 화면에 「기강」이 남지 않는지 보는 렌더 테스트가 쓴다(#658).
 * 호칭은 설정 전(빈 값 → 「크루원」)이 지금 실제 상태다.
 */
export const ULSAN_COPY = buildTeamCopy({ teamCd: "ulsan", crewName: "모보브", memberNoun: null, wordmark: "MOVOF" });
