import Link from "next/link";
import { Menu } from "lucide-react";

import { getCurrentMember } from "@/lib/queries/member";
import { getNotifications, getUnreadNotificationCount } from "@/lib/queries/notification";

import { NotificationBellIcon } from "@/components/notifications/notification-bell-icon";

/**
 * 모든 메인 탭이 공유하는 우측 헤더 액션 — **[알림][햄버거]** 순.
 *
 * 예전엔 홈 헤더에만 있던 걸(게시판 팝오버 + 알림 벨) 전 탭으로 올렸다. 어느 탭에 있든
 * 손이 같은 자리로 가고, 알림·설정이 특정 탭에 갇히지 않는다.
 *
 * **게시판 아이콘은 없앴다.** 공지·업데이트는 설정 화면 안으로 들어갔고(안읽음 표시도
 * 거기), "새 공지가 있다"는 신호는 알림 벨이 흡수한다(작성 시 `insertNotiForTeam`).
 * 그래서 우상단 배지는 알림 벨 하나뿐 — **햄버거(설정)엔 배지를 달지 않는다.** 이유가 둘이다:
 *
 * 1. **알림 벨과 어긋난다.** 공지·업데이트는 글이 올라가는 순간 팀 전원에게 알림이 나가므로
 *    벨이 이미 그 사건을 알린다. 여기 점을 하나 더 찍으면 같은 사건을 두 곳이 가리키는데,
 *    벨은 *알림을 읽으면* 꺼지고 점은 *게시글을 열어야* 꺼진다 — 알림만 확인하고 넘긴 사람은
 *    햄버거 점이 계속 남는다.
 * 2. **설정은 여러 메뉴가 든 큰 방이라** 그 위 빨간 점이 "뭘 봐야 하는지"를 못 가리킨다.
 *
 * ⚠️ 회비 미납 dot은 애초에 후보가 아니다 — **사용자가 지울 수 없는 점**이라서다(돈을 내고
 * 운영진이 반영해야 꺼진다). 설정 화면 안의 "회비 내역" 줄에만 찍고, 그것도 끝수를 걸러
 * 일정액 이상일 때만 켠다(§`settings/page.tsx`). 여기에 dot을 추가하고 싶어지면 먼저
 * **"이건 사용자가 지울 수 있나"**와 **"알림 벨이 이미 알리고 있나"**를 묻는다.
 *
 * 서버 컴포넌트다: 알림 카운트·목록 조회를 여기 한 곳에 모아, 각 탭 page는 이 컴포넌트만
 * 꽂으면 된다(다섯 탭에 같은 조회를 복붙하지 않게). `getCurrentMember`는 React cache라
 * 각 탭이 이미 부른 것과 중복 쿼리가 나지 않는다.
 *
 * 순서에 유의: 알림이 더 자주 쓰는 기능이라 안쪽(왼), 햄버거가 바깥(오른쪽 끝).
 */
export async function HeaderActions() {
  const { member } = await getCurrentMember();

  const [unreadCount, initialNotifications] = await Promise.all([
    getUnreadNotificationCount(member?.id),
    member ? getNotifications(member.id, { limit: 20 }) : Promise.resolve([]),
  ]);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <NotificationBellIcon
        initialCount={unreadCount}
        initialNotifications={initialNotifications}
        memberId={member?.id}
        disabled={!member}
      />
      {/* 햄버거 = 설정 진입. 아이콘만 Menu로 바꿨고 목적지는 기존 설정 그대로.
          비로그인도 보이되 설정은 로그인 화면으로 흐른다(설정 페이지가 알아서 막는다). */}
      <Link
        href="/settings"
        aria-label="설정"
        className="flex size-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Menu className="size-5" />
      </Link>
    </div>
  );
}
