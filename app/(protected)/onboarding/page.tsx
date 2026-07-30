import { Suspense } from "react";

import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { isDevModeEnabled } from "@/lib/dev-mode";
import { getCurrentMember } from "@/lib/queries/member";
import { getOpenGatheringsForPledge } from "@/lib/queries/onboarding-gatherings";

import { MemberOnboardingForm } from "@/components/auth/member-onboarding-form";

async function OnboardingContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; preview?: string }>;
}) {
  const params = await searchParams;
  const nextParam = params.next ?? "/";
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  // 개발 모드 완료 화면 미리보기(?preview=success) — 이미 가입된 회원도 리다이렉트하지
  // 않고 폼을 렌더해 완료 화면 UI를 확인할 수 있게 한다. 운영에선 dev 모드가 꺼져 무시.
  const previewSuccess = isDevModeEnabled() && params.preview === "success";

  const { user, member } = await getCurrentMember();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(safeNext)}`);
  }

  // 이미 가입된 회원(active/inactive 등)은 온보딩 불필요 (단, 미리보기 모드는 예외)
  if (member && !previewSuccess) {
    redirect(safeNext === "/onboarding" ? "/" : safeNext);
  }

  // OAuth 프로필 사진 URL 추출 (카카오: avatar_url/picture, 구글: picture/avatar_url)
  //
  // 플랫폼이 채워 넣은 **기본 프사는 받지 않는다** — 본인이 고른 사진이 아닌데 저장하면
  // 앱이 "프사 있음"으로 판정해 DiceBear 폴백을 건너뛰고, 카카오 회색 실루엣이나 구글
  // 이니셜 아바타가 그대로 걸린다. 여기서 안 받으면 avatar_url이 null로 남아 자동으로
  // DiceBear가 뜬다. 이 페이지가 avatar_url의 **유일한 유입구**라(신규가입·기존연동 두
  // 경로가 다 여기서 받은 값을 쓴다) 이 한 곳만 막으면 된다.
  //   - 카카오: 기본 프사 URL엔 `default_profile`이 문자열로 박혀 있다(썸네일 래퍼 안에
  //     원본 주소가 들어간다). 실제 프사(`dn/{해시}/img_640x640.jpg`)와 확실히 갈린다.
  //   - 구글: 출처째로 버린다. 이니셜이든 실제 사진이든 URL 모양이 같아서
  //     (`googleusercontent.com/a/{고유해시}=s96-c`) 구분이 **불가능**하고, 구글 계정에
  //     프사를 따로 넣는 사람이 드물어 실제 사진까지 버리는 손해가 작다고 봤다.
  const rawAvatarUrl =
    user.user_metadata?.picture ??
    user.user_metadata?.avatar_url ??
    null;
  const isPlatformDefaultAvatar =
    typeof rawAvatarUrl === "string" &&
    (rawAvatarUrl.includes("default_profile") ||
      rawAvatarUrl.includes("googleusercontent.com"));
  // 카카오는 프사 주소를 `http://`로 준다. 그대로 저장하면 https 페이지에서 mixed content가
  // 되어 브라우저가 콘솔 경고를 쏟고(아바타는 화면마다 수십 번 그려진다) 자동 https 승격에
  // 실패하는 환경에선 이미지가 차단된다. k.kakaocdn.net은 https를 지원하므로 여기서 승격해
  // 저장한다. 호스트를 안 가리고 올리는 건, 어떤 출처든 http 프사는 그 자체로 버그라서.
  const initialAvatarUrl =
    typeof rawAvatarUrl === "string" && !isPlatformDefaultAvatar
      ? rawAvatarUrl.replace(/^http:\/\//i, "https://")
      : null;

  // OAuth 이름 후보 추출 — 한글 2~5자만 prefill(검증 통과 값), 그 외는 빈 값
  const rawName =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    "";
  const initialFullName = /^[가-힣]{2,5}$/.test(rawName.trim())
    ? rawName.trim()
    : "";

  const gatherings = await getOpenGatheringsForPledge();

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <MemberOnboardingForm
          userId={user.id}
          provider={user.app_metadata?.provider as "kakao" | "google"}
          email={user.email}
          initialAvatarUrl={initialAvatarUrl}
          initialFullName={initialFullName}
          kakaoChatPassword={env.KAKAO_CHAT_PASSWORD ?? ""}
          gatherings={gatherings}
        />
      </div>
    </div>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingContent searchParams={searchParams} />
    </Suspense>
  );
}

function OnboardingFallback() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
