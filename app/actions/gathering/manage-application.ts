"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";

import { withActive, withAdminOrThrow } from "@/lib/actions/auth";
import {
  applyToGathering,
  canReviewApplications,
  approveApplication,
  cancelApplication,
  rejectApplication,
  type ApplicationResult,
  type GatheringRef,
} from "@/lib/gathering/application";
import {
  evaluateJoinConditions,
  NO_JOIN_CONDITION,
  type JoinConditionResult,
} from "@/lib/gathering/join-condition";
import { insertNoti, insertNotiMany } from "@/lib/notifications/insert-noti";
import { HOME_CALENDAR_CACHE_TAG } from "@/lib/home-calendar-cache-tag";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * 모임 참가 신청·심사 서버 액션.
 *
 * 도메인 로직은 전부 `lib/gathering/application.ts` 에 있다(MCP 와 공유하기 위해).
 * 여기가 맡는 건 **신원 해석(세션 쿠키)과 next/* 부수효과(revalidate·알림)** 뿐이다.
 *
 * 설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §5.3 · §7
 */

type ActionResult = {
  ok: boolean;
  code?: string;
  message?: string;
  /** 참여조건 미달일 때 — 화면이 어떤 조건이 모자란지 그대로 그린다 */
  conditions?: unknown;
};

function toActionResult(r: ApplicationResult): ActionResult {
  if (r.ok) return { ok: true };
  return { ok: false, code: r.code, message: r.message, conditions: r.conditions };
}

/** 모임 상세 두 경로(직접 URL · 일정탭 딥링크)의 캐시를 함께 턴다. */
function revalidateGathering(gthrId: string) {
  revalidatePath(`/gatherings/${gthrId}`);
  revalidatePath("/schedule");
  // 승인은 gthr_attd_rel 을 늘리므로 달력·리스트의 참석자 수가 바뀐다.
  updateTag(HOME_CALENDAR_CACHE_TAG);
}

/**
 * 새 신청 알림 수신자 — **개설자 + 팀 운영진**.
 *
 * 개설자가 운영진이면 두 번 가므로 mem_id 로 합치고, **신청자 본인은 뺀다**
 * (운영진이 조건부 모임에 직접 신청하는 경우가 실제로 있다).
 */
async function reviewerMemIds(
  admin: ReturnType<typeof createUntypedAdminClient>,
  { teamId, crtBy, applicantMemId }: { teamId: string; crtBy: string; applicantMemId: string },
): Promise<string[]> {
  const { data } = await admin
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("mem_st_cd", "active")
    .in("team_role_cd", ["owner", "admin"]);

  const ids = new Set<string>([crtBy, ...((data ?? []) as { mem_id: string }[]).map((r) => r.mem_id)]);
  ids.delete(applicantMemId);
  return [...ids];
}

/** 다이얼로그가 들고 다니는 내 신청 상태 — 액션 반환값과 한 타입을 공유한다. */
export type MyGatheringApplication = {
  state: "none" | "pending" | "approved" | "rejected" | "canceled";
  rejectReason: string | null;
  conditions: JoinConditionResult;
};

/**
 * 내 신청 상태 + 참여조건 판정 — **일정탭 다이얼로그 전용 조회**.
 *
 * 모임 상세 페이지는 서버 컴포넌트라 같은 값을 직접 계산하지만, 다이얼로그는 클라이언트라
 * 스스로 계산할 수 없다(조건 집계는 팀 전체 모임을 봐야 해서 RLS 로는 부족하고, 대기·반려는
 * 애초에 본인·개설자·운영진만 볼 수 있다).
 *
 * `get_gathering_detail` RPC 에 실지 않는 이유는 그게 `SECURITY DEFINER` + anon 실행 허용이라
 * 대기·반려가 비로그인에게까지 새기 때문이다(설계 §8-9). 여기는 세션으로 신원을 풀고
 * **자기 것만** 돌려준다.
 */
export async function getMyGatheringApplication(gthrId: string): Promise<MyGatheringApplication> {
  return withActive(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const { data: gthr } = await admin
      .from("gthr_mst")
      .select("req_attd_cnt, req_attd_months")
      .eq("gthr_id", gthrId)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .maybeSingle();

    if (!gthr) return { state: "none" as const, rejectReason: null, conditions: NO_JOIN_CONDITION };

    const [{ data: aply }, conditions] = await Promise.all([
      admin
        .from("gthr_aply_rel")
        .select("aply_st_cd, rvw_memo_txt")
        .eq("gthr_id", gthrId)
        .eq("mem_id", member.id)
        .maybeSingle(),
      evaluateJoinConditions(admin, {
        spec: gthr as { req_attd_cnt: number | null; req_attd_months: number | null },
        memId: member.id,
        teamId,
      }),
    ]);

    return {
      state: (aply?.aply_st_cd ?? "none") as "none" | "pending" | "approved" | "rejected" | "canceled",
      rejectReason: aply?.rvw_memo_txt ?? null,
      conditions,
    };
  });
}

/** 신청 관리 목록 한 줄 — 다이얼로그의 승인/반려 UI가 그리는 표면. */
export type GatheringApplicationRow = {
  mem_id: string;
  mem_nm: string | null;
  avatar_url: string | null;
  aply_st_cd: "pending" | "approved" | "rejected" | "canceled";
  aply_memo_txt: string | null;
  rvw_memo_txt: string | null;
  crt_at: string;
};

/**
 * 신청 명단 — **개설자 또는 운영진만**.
 *
 * `admin` 클라이언트로 읽으므로(이름·아바타 조인 때문) 권한을 **코드가 다시 판정한다**
 * — RLS 우회 경로는 스코프를 코드가 강제한다(KNOWLEDGE.md). 권한이 없으면 빈 배열이다.
 */
export async function listGatheringApplications(
  gthrId: string,
): Promise<GatheringApplicationRow[]> {
  return withActive(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const { data: gthr } = await admin
      .from("gthr_mst")
      .select("crt_by")
      .eq("gthr_id", gthrId)
      .eq("team_id", teamId)
      .eq("del_yn", false)
      .maybeSingle();

    if (!gthr) return [];
    if (!canReviewApplications(gthr as { crt_by: string }, { memId: member.id, isAdmin: member.admin })) {
      return [];
    }

    // ⚠️ 임베드에 **FK 이름을 명시해야 한다.** `gthr_aply_rel` 은 `mem_mst` 로 가는 FK 가
    //    둘(`mem_id`, `rvw_by`)이라, 그냥 `mem_mst(...)` 라고 쓰면 PostgREST 가 관계를
    //    특정하지 못해 요청 전체를 **에러로 거절**한다. 실제로 그렇게 뚫렸다 —
    //    error 를 안 보고 data 만 받으니 목록이 조용히 비어, 본인이 대기 중인데도
    //    신청 관리에 "대기 중인 신청이 없어요" 가 떴다.
    const { data, error } = await admin
      .from("gthr_aply_rel")
      .select(
        "mem_id, aply_st_cd, aply_memo_txt, rvw_memo_txt, crt_at, mem_mst!gthr_aply_rel_mem_id_fkey(mem_nm, avatar_url)",
      )
      .eq("gthr_id", gthrId)
      .order("crt_at", { ascending: true });

    if (error) {
      // 빈 목록으로 떨어뜨리면 "신청이 없다"와 구분되지 않는다 — 최소한 로그는 남긴다.
      console.error("[gthr-application] 신청 명단 조회 실패", error.message);
      return [];
    }

    return ((data ?? []) as RawAplyRow[]).map((r) => {
      const m = Array.isArray(r.mem_mst) ? r.mem_mst[0] : r.mem_mst;
      return {
        mem_id: r.mem_id,
        mem_nm: m?.mem_nm ?? null,
        avatar_url: m?.avatar_url ?? null,
        aply_st_cd: r.aply_st_cd as GatheringApplicationRow["aply_st_cd"],
        aply_memo_txt: r.aply_memo_txt ?? null,
        rvw_memo_txt: r.rvw_memo_txt ?? null,
        crt_at: r.crt_at,
      };
    });
  });
}

type RawAplyRow = {
  mem_id: string;
  aply_st_cd: string;
  aply_memo_txt: string | null;
  rvw_memo_txt: string | null;
  crt_at: string;
  mem_mst: { mem_nm: string | null; avatar_url: string | null } | { mem_nm: string | null; avatar_url: string | null }[] | null;
};

/** 처리 대기가 남은 모임 한 줄 — 관리자 모임 화면 상단의 "처리할 신청" 목록. */
export type PendingApplicationGathering = {
  gthr_id: string;
  gthr_nm: string;
  gthr_type_enm: string;
  stt_at: string;
  loc_txt: string | null;
  /** 확정 참석자 수 — 월 목록 카드와 **같은 모양**으로 그리려면 여기도 있어야 한다. */
  attd_count: number;
  pending_cnt: number;
};

/**
 * 대기 신청이 남은 모임 — **팀 전체에서, 월 필터를 무시하고** 모은다.
 *
 * 관리자 모임 화면은 월별인데 승인 업무는 월과 안 맞는다: 12월 송년회 신청은 10·11월에
 * 들어온다. 월에 갇힌 채로 두면 다른 달 대기 건을 영영 못 보므로 여기만 월을 무시한다.
 *
 * 운영진 전용이다. 개설자(일반 멤버)는 이 화면 자체에 못 들어오고, 자기 모임 승인은
 * 일정탭 모임 다이얼로그에서 한다.
 */
export async function listPendingApplicationGatherings(): Promise<PendingApplicationGathering[]> {
  return withAdminOrThrow(async () => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    // 대기 행 → 모임으로 접는다. 대기 건이 있는 모임만 알면 되므로 집계는 앱에서 한다
    // (모임 수가 적고, 카운트 RPC 를 새로 만들 만한 일이 아니다).
    const { data, error } = await admin
      .from("gthr_aply_rel")
      .select(
        "gthr_id, gthr_mst!inner(gthr_id, gthr_nm, gthr_type_enm, stt_at, loc_txt, team_id, del_yn)",
      )
      .eq("aply_st_cd", "pending")
      .eq("gthr_mst.team_id", teamId)
      .eq("gthr_mst.del_yn", false);

    if (error) {
      console.error("[gthr-application] 대기 모임 조회 실패", error.message);
      return [];
    }

    const byGthr = new Map<string, PendingApplicationGathering>();
    for (const row of (data ?? []) as RawPendingRow[]) {
      const g = Array.isArray(row.gthr_mst) ? row.gthr_mst[0] : row.gthr_mst;
      if (!g) continue;
      const hit = byGthr.get(row.gthr_id);
      if (hit) {
        hit.pending_cnt += 1;
        continue;
      }
      byGthr.set(row.gthr_id, {
        gthr_id: row.gthr_id,
        gthr_nm: g.gthr_nm,
        gthr_type_enm: g.gthr_type_enm,
        stt_at: g.stt_at,
        loc_txt: g.loc_txt ?? null,
        attd_count: 0,
        pending_cnt: 1,
      });
    }

    // 확정 참석자 수 — 월 목록 카드와 같은 모양으로 그리기 위해 채운다.
    // 대기 모임은 많아야 몇 개라 한 번에 묶어 세는 걸로 충분하다.
    const ids = [...byGthr.keys()];
    if (ids.length > 0) {
      const { data: attd } = await admin
        .from("gthr_attd_rel")
        .select("gthr_id")
        .in("gthr_id", ids);
      for (const row of (attd ?? []) as { gthr_id: string }[]) {
        const hit = byGthr.get(row.gthr_id);
        if (hit) hit.attd_count += 1;
      }
    }

    // 임박한 모임부터 — 처리 기한이 가까운 순서다(지난 모임은 뒤로 밀려도 무방).
    return [...byGthr.values()].sort((a, b) => a.stt_at.localeCompare(b.stt_at));
  });
}

type RawPendingGthr = {
  gthr_nm: string;
  gthr_type_enm: string;
  stt_at: string;
  loc_txt: string | null;
};
type RawPendingRow = { gthr_id: string; gthr_mst: RawPendingGthr | RawPendingGthr[] | null };

/** 참가 신청. 참여조건 미달은 서버가 거부한다(버튼 잠금은 안내일 뿐). */
export async function applyToGatheringAction(gthrId: string, memo?: string): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const result = await applyToGathering(admin, {
      gthrId,
      memId: member.id,
      teamId,
      isAdmin: member.admin,
      memo,
    });
    if (!result.ok) return toActionResult(result);

    revalidateGathering(gthrId);

    // 알림은 응답 밖에서 — 신청 버튼이 웹푸시 외부 HTTP 를 기다리지 않게.
    after(async () => {
      const to = await reviewerMemIds(admin, {
        teamId,
        crtBy: result.gathering.crt_by,
        applicantMemId: member.id,
      });
      if (to.length === 0) return;
      await insertNotiMany({
        teamId,
        memIds: to,
        notiTypeEnm: "gthr_aply",
        notiNm: `${member.full_name}님이 '${result.gathering.gthr_nm}' 참가를 신청했어요`,
        notiCont: memo?.trim() ? `메모: ${memo.trim()}` : null,
        refId: gthrId,
        refTypeEnm: "gathering",
      }).catch((e) => console.error("[gthr_aply] 알림 발송 실패", e));
    });

    return { ok: true };
  });
}

/** 내 신청 취소(대기 중) 또는 참가 취소(확정 후). */
export async function cancelMyApplicationAction(
  gthrId: string,
  reason?: string,
): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const result = await cancelApplication(admin, {
      gthrId,
      memId: member.id,
      teamId,
      actorCd: "self",
      actorMemId: member.id,
      isAdmin: member.admin,
      reason,
    });
    if (!result.ok) return toActionResult(result);

    revalidateGathering(gthrId);

    // 개설자에게만 알린다 — 취소는 자리가 하나 비는 사건이라 정원을 관리하는 사람이 알아야 한다.
    // 수신거부는 기존 참석 취소(gthr_cncl) 설정으로 묶는다: 사용자에겐 같은 사건이다.
    after(async () => {
      if (!result.gathering.crt_by || result.gathering.crt_by === member.id) return;
      await insertNoti({
        teamId,
        memId: result.gathering.crt_by,
        notiTypeEnm: "gthr_cncl",
        notiNm: `${member.full_name}님이 '${result.gathering.gthr_nm}' 참가를 취소했어요`,
        notiCont: reason?.trim() ? `사유: ${reason.trim()}` : null,
        refId: gthrId,
        refTypeEnm: "gathering",
      }).catch((e) => console.error("[gthr_cncl] 알림 발송 실패", e));
    });

    return { ok: true };
  });
}

/** 승인 — 운영진 또는 모임 개설자. 이 순간 gthr_attd_rel 에 들어가며 참가가 확정된다. */
export async function approveApplicationAction(
  gthrId: string,
  memId: string,
): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const result = await approveApplication(admin, {
      gthrId,
      memId,
      teamId,
      actorMemId: member.id,
      isAdmin: member.admin,
    });
    if (!result.ok) return toActionResult(result);

    revalidateGathering(gthrId);
    after(() => notifyApplicant(teamId, memId, gthrId, result.gathering, "aprv", null));

    return { ok: true };
  });
}

/** 반려 — 운영진 또는 모임 개설자. 사유는 선택이지만 신청자에게 그대로 전달된다. */
export async function rejectApplicationAction(
  gthrId: string,
  memId: string,
  reason?: string,
): Promise<ActionResult> {
  return withActive(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const admin = createUntypedAdminClient();

    const result = await rejectApplication(admin, {
      gthrId,
      memId,
      teamId,
      actorMemId: member.id,
      isAdmin: member.admin,
      reason,
    });
    if (!result.ok) return toActionResult(result);

    revalidateGathering(gthrId);
    after(() =>
      notifyApplicant(teamId, memId, gthrId, result.gathering, "rjct", reason?.trim() || null),
    );

    return { ok: true };
  });
}

function notifyApplicant(
  teamId: string,
  memId: string,
  gthrId: string,
  gathering: GatheringRef,
  kind: "aprv" | "rjct",
  reason: string | null,
) {
  const approved = kind === "aprv";
  return insertNoti({
    teamId,
    memId,
    notiTypeEnm: approved ? "gthr_aprv" : "gthr_rjct",
    notiNm: approved
      ? `'${gathering.gthr_nm}' 참가가 확정됐어요`
      : `'${gathering.gthr_nm}' 참가 신청이 반려됐어요`,
    notiCont: reason ? `사유: ${reason}` : null,
    refId: gthrId,
    refTypeEnm: "gathering",
  }).catch((e) => console.error(`[gthr_${kind}] 알림 발송 실패`, e));
}
