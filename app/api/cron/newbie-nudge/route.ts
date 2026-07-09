import { NextResponse } from "next/server";

import { dayjs } from "@/lib/dayjs";
import { env } from "@/lib/env";
import { insertNoti } from "@/lib/notifications/insert-noti";
import { createUntypedAdminClient } from "@/lib/supabase/admin";

/**
 * 뉴비 온보딩 미참석 넛지 크론 — 매일 09:00 KST(00:00 UTC) 실행.
 * 설계: docs/design/2026-07-08-뉴비온보딩-유령회원방지.md §7.1
 *
 * 인증: Vercel Cron은 호출 시 `Authorization: Bearer <CRON_SECRET>` 헤더를 자동 첨부한다
 * (Vercel 공식 문서 https://vercel.com/docs/cron-jobs/manage-cron-jobs — CRON_SECRET 환경변수를
 * 설정해두면 Vercel이 매 크론 호출에 이 헤더를 실어 보내고, 라우트는 값을 직접 비교 검증한다).
 * keep-alive 크론과 달리 이 라우트는 실제로 푸시를 발송하므로 인증이 필수다.
 *
 * 판정(§7.1):
 *   - 대상 공통: mem_onbd_prf.attd_pldg_at IS NOT NULL(개편 후 온보딩 가입자) AND
 *     mem_mst.del_yn = false AND team_mem_rel(mem_st_cd='active', vers=0, del_yn=false) AND
 *     gthr_attd_rel 0건(한 번도 참석 안 함)
 *   - D+14: 가입(crt_at) 후 14일 경과 AND newbie_nudge_14 미발송
 *   - D+28: 가입 후 28일 경과 AND newbie_nudge_28 미발송 (D+14 미발송이어도 28만 단독 발송 가능)
 *   - 중복 방지는 noti_mst에 해당 타입 발송 이력 존재 여부로 판정(별도 상태 컬럼 불필요)
 *
 * 동시발송 방지(백엔드 리뷰 P0-2): 크론이 며칠 밀리면 28일 경과+14 미발송 회원이 due14/due28
 * 양쪽에 동시에 걸릴 수 있다. "28만 단독 발송 가능"의 취지(둘 중 하나만)를 지키기 위해
 * targets28에서 이번 실행의 targets14 대상자를 제외한다 — 28일이 더 급한 메시지이므로
 * 28 판정을 우선하고, 14를 이미 이번 실행에서 보낸 회원은 28에서 제외해 하루 두 건 발송을 막는다.
 */

type NudgeTarget = {
  memId: string;
  teamId: string;
  crtAt: string;
};

const DAY_14_MS = 14 * 24 * 60 * 60 * 1000;
const DAY_28_MS = 28 * 24 * 60 * 60 * 1000;

/** 다가오는 정기런(가장 가까운 1건) 날짜가 있으면 날짜를 박은 멘트, 없으면 기본 멘트 */
async function buildNudgeMessage(
  admin: ReturnType<typeof createUntypedAdminClient>,
  teamId: string,
  kind: "14" | "28",
): Promise<string> {
  const { data: nextRegular } = await admin
    .from("gthr_mst")
    .select("stt_at")
    .eq("team_id", teamId)
    .eq("gthr_type_enm", "regular")
    .eq("del_yn", false)
    .gt("stt_at", dayjs().toISOString())
    .order("stt_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextRegular?.stt_at) {
    const dateLabel = dayjs(nextRegular.stt_at).tz("Asia/Seoul").format("M/D(ddd)");
    return `약속하신 첫 모임, ${dateLabel} 정기런 어때요? 🏃`;
  }

  return kind === "14"
    ? "가입하고 2주가 지났어요! 약속하신 첫 모임, 이번 정기런은 어때요? 🏃"
    : "한 달 약속이 코앞이에요. 이번 주가 딱 좋은 타이밍! 부담 없이 나와요 🙌";
}

/** attd_pldg_at IS NOT NULL AND active AND 미참석(0건)인 회원 목록 조회 */
async function findCandidates(
  admin: ReturnType<typeof createUntypedAdminClient>,
): Promise<NudgeTarget[]> {
  const { data: pledged, error: pledgedErr } = await admin
    .from("mem_onbd_prf")
    .select("mem_id")
    .not("attd_pldg_at", "is", null);

  if (pledgedErr) {
    console.error("[cron/newbie-nudge] 서약 회원 조회 실패", pledgedErr.message);
    return [];
  }
  if (!pledged?.length) return [];

  const memIds = pledged.map((p: { mem_id: string }) => p.mem_id);

  const { data: mems, error: memErr } = await admin
    .from("mem_mst")
    .select("mem_id, crt_at")
    .in("mem_id", memIds)
    .eq("del_yn", false);

  if (memErr) {
    console.error("[cron/newbie-nudge] mem_mst 조회 실패", memErr.message);
    return [];
  }
  if (!mems?.length) return [];

  const { data: rels, error: relErr } = await admin
    .from("team_mem_rel")
    .select("mem_id, team_id")
    .in(
      "mem_id",
      mems.map((m: { mem_id: string }) => m.mem_id),
    )
    .eq("mem_st_cd", "active")
    .eq("vers", 0)
    .eq("del_yn", false);

  if (relErr) {
    console.error("[cron/newbie-nudge] team_mem_rel 조회 실패", relErr.message);
    return [];
  }
  if (!rels?.length) return [];

  const teamByMemId = new Map(
    (rels as { mem_id: string; team_id: string }[]).map((r) => [r.mem_id, r.team_id]),
  );

  const activeMems = mems.filter((m: { mem_id: string }) => teamByMemId.has(m.mem_id));
  if (!activeMems.length) return [];

  // 참석 이력 0건 필터 — gthr_attd_rel에 존재하는 mem_id를 조회해 제외한다.
  const { data: attended, error: attdErr } = await admin
    .from("gthr_attd_rel")
    .select("mem_id")
    .in(
      "mem_id",
      activeMems.map((m: { mem_id: string }) => m.mem_id),
    );

  if (attdErr) {
    console.error("[cron/newbie-nudge] gthr_attd_rel 조회 실패", attdErr.message);
    return [];
  }

  const attendedSet = new Set((attended ?? []).map((a: { mem_id: string }) => a.mem_id));

  return activeMems
    .filter((m: { mem_id: string }) => !attendedSet.has(m.mem_id))
    .map((m: { mem_id: string; crt_at: string }) => ({
      memId: m.mem_id,
      teamId: teamByMemId.get(m.mem_id)!,
      crtAt: m.crt_at,
    }));
}

/** 특정 알림 타입 발송 이력이 있는 mem_id Set (memIds가 비면 빈 Set) */
async function findAlreadyNotified(
  admin: ReturnType<typeof createUntypedAdminClient>,
  memIds: string[],
  notiTypeEnm: "newbie_nudge_14" | "newbie_nudge_28",
): Promise<Set<string>> {
  if (memIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("noti_mst")
    .select("mem_id")
    .eq("noti_type_enm", notiTypeEnm)
    .in("mem_id", memIds);

  if (error) {
    console.error(`[cron/newbie-nudge] ${notiTypeEnm} 발송 이력 조회 실패`, error.message);
    // 조회 실패 시 안전하게 "이미 발송됨"으로 간주해 중복 발송을 막는다.
    return new Set(memIds);
  }
  return new Set((data ?? []).map((r: { mem_id: string }) => r.mem_id));
}

export async function GET(request: Request) {
  // Vercel Cron이 자동 첨부하는 Authorization: Bearer <CRON_SECRET> 헤더 검증.
  // CRON_SECRET 미설정 환경(로컬 등)에서는 발송 사고를 막기 위해 503으로 막는다.
  if (!env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 미설정" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createUntypedAdminClient();
  const now = dayjs();

  const candidates = await findCandidates(admin);
  if (!candidates.length) {
    return NextResponse.json({ ok: true, sent14: 0, sent28: 0 });
  }

  const due14 = candidates.filter((c) => now.diff(dayjs(c.crtAt)) >= DAY_14_MS);
  const due28 = candidates.filter((c) => now.diff(dayjs(c.crtAt)) >= DAY_28_MS);

  const [notified14, notified28] = await Promise.all([
    findAlreadyNotified(admin, due14.map((c) => c.memId), "newbie_nudge_14"),
    findAlreadyNotified(admin, due28.map((c) => c.memId), "newbie_nudge_28"),
  ]);

  // 동시발송 방지(P0-2): 크론이 며칠 밀리면 28일 경과+14 미발송 회원이 due14/due28 양쪽에
  // 걸릴 수 있다. 이 경우 더 급한 28을 우선 발송하고 14는 스킵해, 회원당 한 실행에
  // 최대 1건만 나가게 한다(설계 §7.1 "둘 중 하나만" 취지). "2주 지났어요"보다
  // "한 달 코앞이에요"가 시점상 맞기 때문.
  const targets28 = due28.filter((c) => !notified28.has(c.memId));
  const targets28MemIds = new Set(targets28.map((c) => c.memId));
  const targets14 = due14.filter(
    (c) => !notified14.has(c.memId) && !targets28MemIds.has(c.memId),
  );

  // 팀별 멘트를 재사용하기 위해 캐시(팀 수가 적은 도메인이라 무방)
  const msgCache = new Map<string, string>();
  async function messageFor(teamId: string, kind: "14" | "28"): Promise<string> {
    const key = `${teamId}:${kind}`;
    if (!msgCache.has(key)) {
      msgCache.set(key, await buildNudgeMessage(admin, teamId, kind));
    }
    return msgCache.get(key)!;
  }

  // 발송 루프 — 한 회원 발송 실패가 이후 회원 전체를 막지 않도록 건별 try-catch로 격리.
  // 실패 건은 로그만 남기고 계속(noti_mst 중복 방지로 다음 크론에서 재시도된다).
  async function sendNudge(
    target: NudgeTarget,
    kind: "14" | "28",
    notiTypeEnm: "newbie_nudge_14" | "newbie_nudge_28",
  ): Promise<boolean> {
    try {
      const notiCont = await messageFor(target.teamId, kind);
      await insertNoti({
        teamId: target.teamId,
        memId: target.memId,
        notiTypeEnm,
        notiNm: "첫 모임 참석 리마인드",
        notiCont,
      });
      return true;
    } catch (e) {
      console.error(`[cron/newbie-nudge] ${notiTypeEnm} 발송 실패`, target.memId, e);
      return false;
    }
  }

  let sent14 = 0;
  for (const target of targets14) {
    if (await sendNudge(target, "14", "newbie_nudge_14")) sent14 += 1;
  }

  let sent28 = 0;
  for (const target of targets28) {
    if (await sendNudge(target, "28", "newbie_nudge_28")) sent28 += 1;
  }

  return NextResponse.json({ ok: true, sent14, sent28 });
}
