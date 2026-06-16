import { NextRequest, NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/queries/member";
import { getNotifications } from "@/lib/queries/notification";

export async function GET(request: NextRequest) {
  const { member } = await getCurrentMember();
  if (!member) return NextResponse.json({ notifications: [] });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const cursor = searchParams.get("cursor") ?? undefined;

  try {
    const notifications = await getNotifications(member.id, { cursor, limit });
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ error: "알림 조회 실패" }, { status: 500 });
  }
}
