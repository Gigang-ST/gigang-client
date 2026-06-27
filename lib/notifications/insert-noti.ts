import { resolveNotiDeepLink } from "@/lib/notifications/deep-link";
import { sendPushToMember } from "@/lib/push/send-push";
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

  const { error: insertErr } = await admin.from("noti_mst").insert({
    team_id: input.teamId,
    mem_id: input.memId,
    noti_type_enm: input.notiTypeEnm,
    noti_nm: input.notiNm,
    noti_cont: input.notiCont ?? null,
    ref_id: input.refId ?? null,
    ref_type_enm: input.refTypeEnm ?? null,
  });
  // INSERT 실패 시 조용히 누락되지 않도록 예외로 올린다(호출처에서 처리).
  if (insertErr) {
    throw new Error(`noti_mst insert 실패: ${insertErr.message}`);
  }

  // 인앱 알림 INSERT 직후 푸시도 발송 (발송 중앙 지점).
  // noti_pref_cfg로 꺼진 타입은 위에서 이미 return 되므로 푸시도 자동으로 안 나간다.
  // await로 발송 완료까지 기다린다 — Vercel 서버리스는 응답 후 백그라운드 작업을 보장하지 않으므로
  // void(fire-and-forget)로 띄우면 함수 종료 시 발송이 잘릴 수 있다.
  // 실패가 인앱 알림 흐름을 막지 않도록 try/catch로 격리한다.
  try {
    const url =
      resolveNotiDeepLink(
        input.notiTypeEnm,
        input.refId ?? null,
        input.refTypeEnm ?? null,
      ) ?? "/";
    await sendPushToMember(input.memId, {
      title: input.notiNm,
      body: input.notiCont ?? undefined,
      url,
      tag: input.notiTypeEnm,
    });
  } catch (err) {
    console.error("[push] insertNoti 발송 실패", input.memId, err);
  }
}
