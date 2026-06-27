import { resolveNotiDeepLink } from "@/lib/notifications/deep-link";
import {
  type PushPayload,
  sendPushToMember,
  sendPushToMembers,
} from "@/lib/push/send-push";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * 알림 발송의 단일 관문(choke point).
 *
 * 모든 알림은 이 모듈을 통해서만 발송한다 — noti_mst에 직접 INSERT 금지.
 * 인앱 알림(noti_mst INSERT)과 푸시 알림을 항상 한 몸으로 처리하므로,
 * 새로운 알림 종류가 추가돼도 이 함수만 쓰면 자동으로 인앱+푸시가 함께 나간다.
 *
 * - insertNoti        : 멤버 1명
 * - insertNotiMany    : 여러 멤버 (구독 IN 조회 1회 + 배치 푸시)
 * - insertNotiForTeam : 팀 전체 (RPC 일괄 INSERT + 배치 푸시)
 *
 * 수신 거부(noti_pref_cfg.enabled_yn=false)는 이 관문에서 일괄 필터하므로
 * 발송처가 따로 pref를 확인할 필요가 없다.
 */

type NotiInput = {
  teamId: string;
  memId: string;
  notiTypeEnm: string;
  notiNm: string;
  notiCont?: string | null;
  refId?: string | null;
  refTypeEnm?: string | null;
};

/** noti row → 푸시 payload (딥링크 해석 + notiId 기반 tag) */
function toPushPayload(
  notiId: string,
  notiTypeEnm: string,
  notiNm: string,
  notiCont: string | null,
  refId: string | null,
  refTypeEnm: string | null,
): PushPayload {
  return {
    title: notiNm,
    body: notiCont ?? undefined,
    url: resolveNotiDeepLink(notiTypeEnm, refId, refTypeEnm) ?? "/",
    // notiId(고유값)를 tag로 — 같은 종류 알림도 덮어쓰지 않고 개별로 쌓이게 한다
    tag: `noti-${notiId}`,
  };
}

/**
 * 특정 멤버 1명에게 알림(인앱+푸시)을 발송한다.
 * noti_pref_cfg에서 해당 타입을 꺼놓은 경우 발송하지 않는다.
 */
export async function insertNoti(input: NotiInput): Promise<void> {
  const admin = createUntypedAdminClient();

  // 수신 설정 확인 — enabled_yn=false 인 row가 있으면 발송 안 함
  const { data: pref } = await admin
    .from("noti_pref_cfg")
    .select("enabled_yn")
    .eq("mem_id", input.memId)
    .eq("noti_type_enm", input.notiTypeEnm)
    .maybeSingle();

  if (pref?.enabled_yn === false) return;

  const { data: inserted, error: insertErr } = await admin
    .from("noti_mst")
    .insert({
      team_id: input.teamId,
      mem_id: input.memId,
      noti_type_enm: input.notiTypeEnm,
      noti_nm: input.notiNm,
      noti_cont: input.notiCont ?? null,
      ref_id: input.refId ?? null,
      ref_type_enm: input.refTypeEnm ?? null,
    })
    .select("noti_id")
    .single();
  // INSERT 실패 시 조용히 누락되지 않도록 예외로 올린다(호출처에서 처리).
  if (insertErr) {
    throw new Error(`noti_mst insert 실패: ${insertErr.message}`);
  }

  // 인앱 알림 INSERT 직후 푸시도 발송. await로 완료까지 대기(서버리스 함수 종료 시 잘림 방지).
  // 푸시 실패가 인앱 알림 흐름을 막지 않도록 try/catch로 격리.
  try {
    await sendPushToMember(
      input.memId,
      toPushPayload(
        inserted!.noti_id,
        input.notiTypeEnm,
        input.notiNm,
        input.notiCont ?? null,
        input.refId ?? null,
        input.refTypeEnm ?? null,
      ),
    );
  } catch (err) {
    console.error("[push] insertNoti 발송 실패", input.memId, err);
  }
}

type NotiManyInput = {
  teamId: string;
  memIds: string[];
  notiTypeEnm: string;
  /** 수신거부(noti_pref_cfg) 판단에 쓸 타입. 생략 시 notiTypeEnm 사용.
   *  예: gthr_del 알림이지만 수신거부는 gthr_upd 설정으로 묶어 판단할 때. */
  prefTypeEnm?: string;
  notiNm: string;
  notiCont?: string | null;
  refId?: string | null;
  refTypeEnm?: string | null;
};

/**
 * 여러 멤버에게 같은 내용의 알림(인앱+푸시)을 발송한다.
 * - noti_pref_cfg로 수신 거부한 멤버는 자동 제외 (조회 1회)
 * - noti_mst 일괄 INSERT 후, 구독자에게 배치 푸시 (구독 IN 조회 1회)
 */
export async function insertNotiMany(input: NotiManyInput): Promise<void> {
  if (input.memIds.length === 0) return;
  const admin = createUntypedAdminClient();

  // 수신 거부자 일괄 조회 후 제외 (prefTypeEnm 지정 시 그 타입으로 판단)
  const { data: disabledPrefs } = await admin
    .from("noti_pref_cfg")
    .select("mem_id")
    .eq("noti_type_enm", input.prefTypeEnm ?? input.notiTypeEnm)
    .eq("enabled_yn", false)
    .in("mem_id", input.memIds);

  const disabled = new Set(
    (disabledPrefs ?? []).map((p: { mem_id: string }) => p.mem_id),
  );
  const targets = input.memIds.filter((id) => !disabled.has(id));
  if (targets.length === 0) return;

  const { data: rows, error: insertErr } = await admin
    .from("noti_mst")
    .insert(
      targets.map((memId) => ({
        team_id: input.teamId,
        mem_id: memId,
        noti_type_enm: input.notiTypeEnm,
        noti_nm: input.notiNm,
        noti_cont: input.notiCont ?? null,
        ref_id: input.refId ?? null,
        ref_type_enm: input.refTypeEnm ?? null,
      })),
    )
    .select("noti_id, mem_id");
  if (insertErr) {
    throw new Error(`noti_mst 일괄 insert 실패: ${insertErr.message}`);
  }

  try {
    const payloadByMemId = new Map<string, PushPayload>();
    for (const r of (rows ?? []) as { noti_id: string; mem_id: string }[]) {
      payloadByMemId.set(
        r.mem_id,
        toPushPayload(
          r.noti_id,
          input.notiTypeEnm,
          input.notiNm,
          input.notiCont ?? null,
          input.refId ?? null,
          input.refTypeEnm ?? null,
        ),
      );
    }
    await sendPushToMembers(payloadByMemId);
  } catch (err) {
    console.error("[push] insertNotiMany 발송 실패", err);
  }
}

type NotiTeamInput = {
  teamId: string;
  notiTypeEnm: string;
  notiNm: string;
  notiCont?: string | null;
  refId?: string | null;
  refTypeEnm?: string | null;
  batchId?: string | null;
};

/**
 * 팀 전체 멤버에게 알림(인앱+푸시)을 발송한다.
 * - 인앱: DB 함수 create_noti_for_team으로 일괄 INSERT (수신 거부 필터는 함수 내부)
 * - 푸시: INSERT된 row들을 조회해 구독자에게 배치 발송
 */
export async function insertNotiForTeam(input: NotiTeamInput): Promise<void> {
  const admin = createUntypedAdminClient();
  const batchId = input.batchId ?? crypto.randomUUID();

  const { error } = await admin.rpc("create_noti_for_team", {
    p_team_id: input.teamId,
    p_noti_type_enm: input.notiTypeEnm,
    p_noti_nm: input.notiNm,
    p_noti_cont: input.notiCont ?? null,
    p_ref_id: input.refId ?? null,
    p_ref_type_enm: input.refTypeEnm ?? null,
    p_batch_id: batchId,
  });
  if (error) {
    throw new Error(`create_noti_for_team 실패: ${error.message}`);
  }

  // 방금 생성된 알림 row들을 batch_id로 조회해 푸시 발송
  try {
    const { data: rows } = await admin
      .from("noti_mst")
      .select("noti_id, mem_id")
      .eq("batch_id", batchId);

    const payloadByMemId = new Map<string, PushPayload>();
    for (const r of (rows ?? []) as { noti_id: string; mem_id: string }[]) {
      payloadByMemId.set(
        r.mem_id,
        toPushPayload(
          r.noti_id,
          input.notiTypeEnm,
          input.notiNm,
          input.notiCont ?? null,
          input.refId ?? null,
          input.refTypeEnm ?? null,
        ),
      );
    }
    await sendPushToMembers(payloadByMemId);
  } catch (err) {
    console.error("[push] insertNotiForTeam 발송 실패", err);
  }
}
