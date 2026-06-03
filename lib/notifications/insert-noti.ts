import { createUntypedAdminClient } from "@/lib/supabase/admin";

type InsertNotiInput = {
  teamId: string;
  memId: string;
  notiTypeEnm: string;
  notiNm: string;
  notiCont?: string | null;
  refId?: string | null;
  refTypeEnm?: string | null;
};

/**
 * 특정 멤버 1명에게 알림 row를 INSERT한다.
 * noti_pref_cfg에서 해당 타입을 꺼놓은 경우 발송하지 않는다.
 */
export async function insertNoti(input: InsertNotiInput): Promise<void> {
  const admin = createUntypedAdminClient();

  // 수신 설정 확인 — enabled_yn=false 인 row가 있으면 발송 안 함
  const { data: pref } = await admin
    .from("noti_pref_cfg")
    .select("enabled_yn")
    .eq("mem_id", input.memId)
    .eq("noti_type_enm", input.notiTypeEnm)
    .maybeSingle();

  if (pref?.enabled_yn === false) return;

  await admin.from("noti_mst").insert({
    team_id: input.teamId,
    mem_id: input.memId,
    noti_type_enm: input.notiTypeEnm,
    noti_nm: input.notiNm,
    noti_cont: input.notiCont ?? null,
    ref_id: input.refId ?? null,
    ref_type_enm: input.refTypeEnm ?? null,
  });
}
