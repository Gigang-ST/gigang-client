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

/** 로그인 + 가입 완료 멤버만 허용 */
export async function withMember<T>(fn: (ctx: ActionContext) => Promise<T>): Promise<T> {
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
  if (!member || !member.admin) return { ok: false, message: "권한이 없습니다" };
  return fn({ member, supabase });
}

/** 로그인 + admin/owner만 허용. throw 패턴 액션용 */
export async function withAdminOrThrow<T>(fn: (ctx: ActionContext) => Promise<T>): Promise<T> {
  const { member, supabase } = await getCurrentMember();
  if (!member || !member.admin) throw new Error("관리자 권한이 필요합니다");
  return fn({ member, supabase });
}
