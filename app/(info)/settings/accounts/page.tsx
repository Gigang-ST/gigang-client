import { redirect } from "next/navigation";

import { AccountLinkClient, type LinkedProviders } from "@/components/settings/account-link-client";
import { getCurrentMember } from "@/lib/queries/member";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 더보기 → 계정 연동 — 지금 로그인한 계정에 다른 로그인(카카오·구글)을 추가로 붙인다.
 *
 * 가입 화면의 "전화번호로 기존 회원 연결"은 로그인이 하나도 없는 회원에만 열려 있다(§lib/oauth-link).
 * 이미 로그인이 붙은 회원이 다른 로그인도 쓰고 싶으면 **원래 계정으로 로그인한 상태에서** 여기서 붙인다 —
 * 로그인으로 본인임이 확인된 상태라 번호만 아는 사람이 붙일 수 없다.
 *
 * 연결 상태는 두 군데를 함께 본다:
 * - 지금 로그인 계정에 붙은 로그인(Supabase identities) — 여기서 연동한 것
 * - 회원 정보의 카카오·구글 칸 — 예전에 각각 따로 가입해 둘 다 붙어 있는 회원(prd 12명)
 */
export default async function AccountLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ link_error?: string; linked?: string }>;
}) {
  const [{ user, member, supabase }, params] = await Promise.all([getCurrentMember(), searchParams]);
  if (!user) redirect("/auth/login?next=%2Fsettings%2Faccounts");
  if (!member) redirect("/onboarding");

  // 연결된 로그인 목록(identities)은 토큰 요약(getCurrentMember 의 user)에 없다 — 이 화면에서만 한 번 더 묻는다
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const { data: mst } = await createAdminClient()
    .from("mem_mst")
    .select("oauth_kakao_id, oauth_google_id")
    .eq("mem_id", member.id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();

  const identityProviders = new Set((authUser?.identities ?? []).map((i) => i.provider));
  const linked: LinkedProviders = {
    kakao: identityProviders.has("kakao") || Boolean(mst?.oauth_kakao_id),
    google: identityProviders.has("google") || Boolean(mst?.oauth_google_id),
  };
  const provider = authUser?.app_metadata?.provider;
  const current = provider === "google" || provider === "kakao" ? provider : null;

  return (
    <AccountLinkClient
      linked={linked}
      current={current}
      linkError={params.link_error === "1"}
      justLinked={params.linked === "1"}
    />
  );
}
