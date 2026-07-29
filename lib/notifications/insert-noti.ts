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
  /** 수신거부(noti_pref_cfg) 판단에 쓸 타입. 생략 시 notiTypeEnm 사용.
   *  예: gthr_cncl 알림이지만 수신거부는 gthr_upd 설정으로 묶어 판단할 때. */
  prefTypeEnm?: string;
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

  // 수신 설정 확인 — enabled_yn=false 인 row가 있으면 발송 안 함 (prefTypeEnm 지정 시 그 타입으로 판단)
  const { data: pref } = await admin
    .from("noti_pref_cfg")
    .select("enabled_yn")
    .eq("mem_id", input.memId)
    .eq("noti_type_enm", input.prefTypeEnm ?? input.notiTypeEnm)
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
  // 알림은 부가 기능 — 실패해도 본행동(모임 등록·댓글 등)을 막지 않는다. 로깅만 하고 중단.
  // (디버깅을 위해 에러는 명확히 남긴다 — "왜 안 갔지?"는 로그로 추적)
  if (insertErr || !inserted) {
    console.error("[noti] insertNoti 인앱 저장 실패", input.memId, insertErr?.message);
    return;
  }

  // 인앱 알림 INSERT 직후 푸시도 발송. await로 완료까지 대기(서버리스 함수 종료 시 잘림 방지).
  // 푸시 실패가 인앱 알림 흐름을 막지 않도록 try/catch로 격리.
  try {
    await sendPushToMember(
      input.memId,
      toPushPayload(
        inserted.noti_id,
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
  /** 한 번의 발송을 묶는 배치 식별자. 관리자 수동 발송 이력(발송 이력 화면)이
   *  이 값으로 수신자를 그룹핑한다. 생략 시 null — 개별 알림은 이력에 묶이지 않는다. */
  batchId?: string | null;
};

/** insertNotiMany 결과. 기존 호출자는 반환값을 무시하므로 시그니처 확장은 하위호환이다. */
export type InsertNotiManyResult = {
  /** noti_mst 인앱 INSERT 성공 여부. INSERT 에러 시 false(발송 전면 실패). */
  inAppOk: boolean;
  /** 수신거부 필터 후 **실제로 인앱 INSERT된** mem_id 목록(=실측 발송 대상). */
  notifiedMemIds: string[];
};

/**
 * 여러 멤버에게 같은 내용의 알림(인앱+푸시)을 발송한다.
 * - noti_pref_cfg로 수신 거부한 멤버는 자동 제외 (조회 1회)
 * - noti_mst 일괄 INSERT 후, 구독자에게 배치 푸시 (구독 IN 조회 1회)
 *
 * 반환값은 감사 무결성이 필요한 호출자(예: MCP send_push)가 실측 발송분을 기록하기 위한 것으로,
 * 기존 호출자(gathering·board 등)는 반환값을 무시하므로 이 확장은 하위호환이다.
 * 푸시는 기존대로 fire-and-forget(실패해도 인앱 흐름을 막지 않음)이다.
 */
export async function insertNotiMany(
  input: NotiManyInput,
): Promise<InsertNotiManyResult> {
  if (input.memIds.length === 0) return { inAppOk: true, notifiedMemIds: [] };
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
  // 전원 수신거부 = 인앱 저장은 정상(0건)이며 실패가 아니다. 실측 발송분 0으로 반환.
  if (targets.length === 0) return { inAppOk: true, notifiedMemIds: [] };

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
        batch_id: input.batchId ?? null,
      })),
    )
    .select("noti_id, mem_id");
  // 알림은 부가 기능 — 실패해도 본행동을 막지 않는다(로깅만). 단, 인앱 저장 실패는 반환값에 명시해
  // 감사 무결성이 필요한 호출자가 "발송 실패"로 판단할 수 있게 한다(inAppOk=false).
  if (insertErr) {
    console.error("[noti] insertNotiMany 인앱 저장 실패", insertErr.message);
    return { inAppOk: false, notifiedMemIds: [] };
  }

  const insertedRows = (rows ?? []) as { noti_id: string; mem_id: string }[];
  // 실제 INSERT된 행의 mem_id = 실측 발송 대상(수신거부 필터 반영분).
  const notifiedMemIds = insertedRows.map((r) => r.mem_id);

  try {
    const payloadByMemId = new Map<string, PushPayload>();
    for (const r of insertedRows) {
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

  return { inAppOk: true, notifiedMemIds };
}

type NotiTeamInput = {
  teamId: string;
  notiTypeEnm: string;
  notiNm: string;
  notiCont?: string | null;
  refId?: string | null;
  refTypeEnm?: string | null;
  /** 발송 이력 그룹핑용 배치 식별자 (insertNotiMany로 그대로 전달). */
  batchId?: string | null;
};

/**
 * 팀 전체(활성) 멤버에게 알림(인앱+푸시)을 발송한다.
 * 멤버 목록을 조회해 insertNotiMany에 위임 — RPC + batch_id 되조회를 쓰지 않으므로
 * 발송 대상과 푸시 대상이 항상 일치하고(불일치 없음), 되조회 부하도 없다.
 * 수신거부 필터·INSERT·푸시는 insertNotiMany가 일괄 처리한다.
 */
export async function insertNotiForTeam(input: NotiTeamInput): Promise<void> {
  const admin = createUntypedAdminClient();

  const { data: members, error } = await admin
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", input.teamId)
    .eq("vers", 0)
    .eq("del_yn", false);

  if (error) {
    console.error("[noti] insertNotiForTeam 멤버 조회 실패", error.message);
    return;
  }
  if (!members?.length) return;

  await insertNotiMany({
    teamId: input.teamId,
    memIds: members.map((m: { mem_id: string }) => m.mem_id),
    notiTypeEnm: input.notiTypeEnm,
    notiNm: input.notiNm,
    notiCont: input.notiCont ?? null,
    refId: input.refId ?? null,
    refTypeEnm: input.refTypeEnm ?? null,
    batchId: input.batchId ?? null,
  });
}
