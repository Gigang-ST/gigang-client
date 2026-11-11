"use client";

import { useState } from "react";
import Image from "next/image";

import { Body, Caption, Micro } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export type LinkedProviders = { kakao: boolean; google: boolean };
type Provider = keyof LinkedProviders;

const PROVIDERS: { key: Provider; label: string; icon: string }[] = [
  { key: "kakao", label: "카카오", icon: "/kakao.png" },
  { key: "google", label: "Google", icon: "/google.webp" },
];

/**
 * 계정 연동 화면 — 지금 로그인한 계정에 다른 로그인을 추가로 붙인다(Supabase `linkIdentity`).
 *
 * 붙이고 나면 어느 쪽으로 로그인해도 **같은 로그인 계정**으로 들어와서, 회원 정보 쪽은 바꿀 게 없다.
 * 연결은 OAuth 를 한 번 거쳐 `/auth/callback?flow=link` 로 돌아오고, 실패하면(그 계정이 이미 다른
 * 회원으로 쓰이는 등) 콜백이 `?link_error=1` 을 붙여 이리로 돌려보낸다.
 *
 * ⚠️ Supabase 대시보드에서 수동 계정 연결(Manual linking)이 켜져 있어야 동작한다 — 꺼져 있으면
 * linkIdentity 가 바로 에러를 돌려주고, 여기선 "아직 쓸 수 없다"고 안내한다.
 */
export function AccountLinkClient({
  linked,
  current,
  linkError,
  justLinked,
}: {
  linked: LinkedProviders;
  /** 지금 로그인한 계정 종류 */
  current: Provider | null;
  /** 콜백이 연결 실패로 돌려보냈나 */
  linkError: boolean;
  /** 방금 연결하고 돌아왔나 */
  justLinked: boolean;
}) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(
    linkError ? "연결하지 못했어요. 그 계정이 이미 다른 회원 정보로 쓰이고 있을 수 있어요. 운영진에게 문의해 주세요." : null,
  );

  async function handleLink(provider: Provider) {
    setBusy(provider);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?flow=link&next=${encodeURIComponent("/settings/accounts?linked=1")}`;
    const { error: linkErr } = await createClient().auth.linkIdentity({ provider, options: { redirectTo } });
    if (linkErr) {
      console.error("[account-link] 연결 시작 실패", linkErr.message);
      setError("지금은 계정 연동을 쓸 수 없어요. 잠시 후 다시 시도하거나 운영진에게 알려 주세요.");
      setBusy(null);
    }
    // 성공이면 브라우저가 카카오·구글 로그인 화면으로 넘어간다
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <Caption>
        지금 계정에 다른 로그인을 더 붙여 두면, 어느 쪽으로 로그인해도 같은 계정으로 들어와요.
      </Caption>

      <div className="flex flex-col gap-3">
        {PROVIDERS.map(({ key, label, icon }) => (
          <CardItem key={key} className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Image src={icon} alt="" width={24} height={24} />
              <div className="flex flex-col">
                <Body className="font-semibold">{label}</Body>
                {current === key && <Micro>지금 로그인한 계정</Micro>}
              </div>
            </div>
            {linked[key] ? (
              <Caption className="shrink-0 text-success">연결됨</Caption>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleLink(key)}
                disabled={busy !== null}
              >
                {busy === key ? "연결 중..." : "연결하기"}
              </Button>
            )}
          </CardItem>
        ))}
      </div>

      {justLinked && !error && <Caption className="text-success">연결했어요.</Caption>}
      {error && <Caption className="text-destructive">{error}</Caption>}
    </div>
  );
}
