"use client";

import dynamic from "next/dynamic";

import type { MemberCardDialogProps } from "@/components/members/member-card-dialog";

/**
 * 멤버 프로필 카드 다이얼로그 — **지연 로딩 판**. 카드를 여는 자리는 전부 이걸 쓴다.
 *
 * `MemberCardDialog`는 868줄짜리 `MemberCardDetail`(+ 칭호 배지·프레임·페이스 차트 진입)을
 * 물고 있어서, 정적으로 import하면 이걸 쓰는 화면들(`/`·`/story`·`/records`·`/profile`)의
 * **초기 번들에 통째로** 들어간다. 카드를 한 번도 안 여는 사람도 받고, 무엇보다 그만큼
 * 파싱·하이드레이션이 늦어져 화면이 반응하기 시작하는 시점이 밀린다.
 *
 * 호출부들이 이 다이얼로그를 **조건부가 아니라 항상 렌더**하므로(`open`으로만 여닫는다),
 * 청크 다운로드는 하이드레이션 직후 자동으로 시작된다 — "안 받는" 게 아니라 **크리티컬
 * 패스 밖으로 밀어내는** 것이다. 사용자가 얼굴을 찾아 누르기까지의 시간이면 대개 이미 도착해 있다.
 *
 * 그래서 `loading` 폴백을 두지 않는다: 닫힌 다이얼로그는 어차피 아무것도 그리지 않아
 * 폴백(`null`)과 결과가 같고, `next/dynamic`의 폴백은 props를 못 받아 `open`을 알 수 없어
 * 껍데기조차 못 그린다. 청크 도착 전에 눌리면 잠깐 무반응인데, 그 찰나를 막자고 래퍼를
 * 한 겹 더 두는 건 얻는 것에 비해 과하다고 봤다.
 *
 * **`dynamic()`은 여기 한 곳에만 둔다** — 호출부마다 쓰면 `ssr`·`loading` 설정이 갈라진다.
 * (같은 패턴: `components/profile/pace-chart-dynamic.tsx`)
 */
export const MemberCardDialogDynamic = dynamic<MemberCardDialogProps>(
  () =>
    import("@/components/members/member-card-dialog").then(
      (m) => m.MemberCardDialog,
    ),
  { ssr: false },
);
