import type { SupabaseClient } from "@supabase/supabase-js";

import { buildInactiveActionMessage } from "@/lib/inactive-notice";
import type { AppMemberProfile } from "@/lib/queries/app-member";
import { getCurrentMember } from "@/lib/queries/member";
import type { Database } from "@/lib/supabase/database.types";

export type ActionContext = {
  member: AppMemberProfile;
  supabase: SupabaseClient<Database>;
};

type ActionResult = { ok: false; message: string } | { ok: true; [key: string]: unknown };

/**
 * 로그인 + 가입 완료 멤버만 허용. **탈퇴(`left`)는 여기서 막는다.**
 *
 * 예전엔 상태를 보지 않아 탈퇴자가 이 관문을 쓰는 액션 전부를 통과했다 —
 * `fetchMemMstWithTeamRel` 이 `vers`·`del_yn` 만 거르고 `mem_st_cd` 는 안 보기 때문이다.
 * 탈퇴 처리(`setMemberLeft`)는 auth 세션도 끊지 않아, 토큰이 살아 있으면 계속 쓸 수 있었다.
 * 실제로 러닝 프로필·가까운 역 수정이 그 경로로 열려 있었고, 둘 다 service role 로 써서
 * RLS 백스톱조차 없었다(2026-09-23 실측: 탈퇴 116명).
 *
 * `inactive` 는 통과시킨다 — 알림 정리처럼 비활성 회원이 써야 하는 액션이 이 관문을 쓴다.
 * 더 좁혀야 하면 `withActive`, 상태를 아예 안 봐야 하면 `withMemberAnyStatus` 를 쓴다.
 */
export async function withMember<T>(fn: (ctx: ActionContext) => Promise<T>): Promise<T> {
  return withMemberAnyStatus(async (ctx) => {
    if (ctx.member.status === "left") throw new Error(buildInactiveActionMessage(ctx.member));
    return fn(ctx);
  });
}

/**
 * 로그인 + 가입 완료 멤버라면 **상태를 보지 않는다** — 탈퇴자도 통과한다.
 *
 * 탈퇴자에게 유일하게 열어 두는 문인 **복귀 요청** 경로 전용이다
 * (`requestReactivation` · `getMyInactiveReason`). 관리자가 `reactivateMember` 로
 * `left` 를 되살릴 수 있는데 앱에서 요청할 길까지 막으면 탈퇴자는 앱 밖으로만 연락할 수 있다.
 *
 * ⚠️ **새 액션에 이걸 쓰지 말 것.** 기본은 `withMember`(탈퇴 차단)다.
 */
export async function withMemberAnyStatus<T>(fn: (ctx: ActionContext) => Promise<T>): Promise<T> {
  const { member, supabase } = await getCurrentMember();
  if (!member) throw new Error("로그인이 필요합니다.");
  return fn({ member, supabase });
}

/**
 * 로그인 + active 멤버만 허용.
 *
 * 막을 때 **왜 막혔는지(비활성 사유)를 문구에 싣는다** — 이 문구는 기강이야기(응원·팻말·
 * 한마디·깅스타그램)처럼 안내 다이얼로그가 없는 자리에서 사용자가 보는 유일한 설명이라,
 * 여기서 이유를 말하지 않으면 그 자리들엔 이유가 닿을 길이 없다. 조립은 `lib/inactive-notice`.
 */
export async function withActive<T>(fn: (ctx: ActionContext) => Promise<T>): Promise<T> {
  return withMember(async (ctx) => {
    if (ctx.member.status !== "active") throw new Error(buildInactiveActionMessage(ctx.member));
    return fn(ctx);
  });
}

/** 로그인 + admin/owner만 허용. { ok: false } 반환 패턴 액션용 */
export async function withAdmin<T extends ActionResult>(
  fn: (ctx: ActionContext) => Promise<T>,
): Promise<T | { ok: false; message: string }> {
  const { member, supabase } = await getCurrentMember();
  // 관리자 권한도 **활동 중일 때만** 산다. `member.admin` 은 `team_role_cd` 만 보므로
  // 탈퇴·비활성 관리자가 남아 있으면 그대로 통과한다 — `setMemberLeft` 는 owner 만 제외한다.
  if (!member || !member.admin || member.status !== "active") {
    return { ok: false, message: "권한이 없습니다" };
  }
  return fn({ member, supabase });
}

/** 로그인 + admin/owner만 허용. throw 패턴 액션용 */
export async function withAdminOrThrow<T>(fn: (ctx: ActionContext) => Promise<T>): Promise<T> {
  const { member, supabase } = await getCurrentMember();
  // 사유는 withAdmin 주석 참고 — 관리자 권한은 활동 중일 때만 산다.
  if (!member || !member.admin || member.status !== "active") {
    throw new Error("관리자 권한이 필요합니다");
  }
  return fn({ member, supabase });
}
