import { NextRequest, NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/queries/member";
import {
  getNotifications,
  getUnreadNotificationCount,
} from "@/lib/queries/notification";

/**
 * 알림 목록 — **첫 장이면 안읽음 수도 같이 준다.**
 *
 * 카운트를 여기 얹은 이유: 알림은 **페이지 렌더와 무관해야 한다.** 예전엔 뱃지 숫자를
 * `HeaderActions`(서버 컴포넌트)가 읽어서, 여섯 지면의 모든 렌더가 알림 조회를 기다렸다.
 * 목록과 한 번에 내려주면 클라이언트가 **요청 1회로 둘 다** 받고, 서버 렌더는 알림을
 * 전혀 기다리지 않는다(§components/notifications/notification-channel.tsx).
 *
 * 다음 장(`cursor` 있음)엔 카운트를 싣지 않는다 — 무한스크롤마다 셀 이유가 없다.
 */
export async function GET(request: NextRequest) {
  const { member } = await getCurrentMember();
  if (!member) return NextResponse.json({ notifications: [] });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const cursor = searchParams.get("cursor") ?? undefined;

  try {
    if (cursor) {
      const notifications = await getNotifications(member.id, { cursor, limit });
      return NextResponse.json({ notifications });
    }

    const [notifications, unreadCount] = await Promise.all([
      getNotifications(member.id, { limit }),
      getUnreadNotificationCount(member.id),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch {
    return NextResponse.json({ error: "알림 조회 실패" }, { status: 500 });
  }
}
