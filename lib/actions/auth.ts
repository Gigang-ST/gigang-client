import type { SupabaseClient } from "@supabase/supabase-js";

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

/** 로그인 + active 멤버만 허용 */
export async function withActive<T>(fn: (ctx: ActionContext) => Promise<T>): Promise<T> {
  return withMember(async (ctx) => {
    if (ctx.member.status !== "active") throw new Error("비활성화된 회원입니다. 관리자에게 문의하세요.");
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
