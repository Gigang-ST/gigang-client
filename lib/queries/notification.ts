import { createUntypedAdminClient } from "@/lib/supabase/admin";

export type Notification = {
  noti_id: string;
  team_id: string;
  mem_id: string;
  noti_type_enm: string;
  noti_nm: string;
  noti_cont: string | null;
  ref_id: string | null;
  ref_type_enm: string | null;
  read_yn: boolean;
  crt_at: string;
};

export type NotificationPref = {
  noti_type_enm: string;
  enabled_yn: boolean;
};

/**
 * 알림은 **팀별**이다 — 두 팀에 가입한 사람이 울산 주소에서 기강 알림을 보면 눌러도 없는 글로 가고,
 * 뱃지 숫자도 두 팀이 합쳐진다. 조회·일괄 처리는 전부 접속한 팀(`teamId`)으로 거른다.
 */
export async function getUnreadNotificationCount(
  memberId: string | null | undefined,
  teamId: string,
): Promise<number> {
  if (!memberId) return 0;

  const admin = createUntypedAdminClient();
  const { count, error } = await admin
    .from("noti_mst")
    .select("*", { count: "exact", head: true })
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .eq("read_yn", false);

  // ⚠️ **실패를 0으로 돌려주지 않는다.** 클라이언트는 숫자가 오면 그걸 실측값으로 믿고
  // 뱃지를 그 값으로 맞춘다(`syncUnreadCount`) — 조회가 터졌을 뿐인데 **안 읽은 알림이
  // 있는 사람의 뱃지가 꺼진다.** 던지면 `/api/notifications`가 500으로 답하고, 벨은
  // `res.ok`를 보므로 store를 안 건드린 채 재시도 경로를 연다.
  if (error) throw error;

  return count ?? 0;
}

export async function getNotifications(
  memberId: string,
  teamId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<Notification[]> {
  const admin = createUntypedAdminClient();
  const { cursor, limit = 20 } = options;

  let query = admin
    .from("noti_mst")
    .select(
      "noti_id, team_id, mem_id, noti_type_enm, noti_nm, noti_cont, ref_id, ref_type_enm, read_yn, crt_at",
    )
    .eq("mem_id", memberId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .order("crt_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("crt_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function getNotificationPrefs(
  memberId: string,
  teamId: string,
): Promise<NotificationPref[]> {
  const admin = createUntypedAdminClient();
  // 수신 설정도 팀별 — 기강 모임 알림을 끈다고 울산 모임 알림까지 꺼지지 않게
  const { data } = await admin
    .from("noti_pref_cfg")
    .select("noti_type_enm, enabled_yn")
    .eq("mem_id", memberId)
    .eq("team_id", teamId);

  return (data ?? []) as NotificationPref[];
}
