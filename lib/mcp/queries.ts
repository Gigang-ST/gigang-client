import type { SupabaseClient } from "@supabase/supabase-js";

import { dayjs } from "@/lib/dayjs";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — 6개 읽기 도구의 쿼리 로직(SG-04, 스펙 §4·§5).
 *
 * 설계 원칙
 * - **team_id 강제 스코프**: 모든 함수는 operator ctx의 `teamId`를 필수 인자로 받는다.
 *   도구는 절대 team 파라미터를 노출하지 않으며, 여기서도 team을 인자로만 받아 필터에 강제한다.
 * - **service-role 클라이언트 주입식 순수함수**: 클라이언트를 인자로 받아 이 모듈은
 *   `server-only` 체인(admin.ts 등)을 import 하지 않는다 → vitest server-only 함정 회피
 *   ([[troubleshooting/vitest-server-only-trap]]). 집계·정렬 등 순수 로직은 별도 export 해 단위 테스트한다.
 * - **민감정보 전면 차단(M-03 불변식)**: 어떤 select 목록에도 `phone_no·email_addr·bank_nm·
 *   bank_acct_no`를 포함하지 않는다. `get_member_profile`도 생일·성별·소개·아바타까지만 반환한다.
 * - **정본 행 규약(vers=0)**: `team_mem_rel`·`mem_mst`는 앱 전역과 동일하게 `vers=0 & del_yn=false`를
 *   현재 정본으로 본다(lib/queries/app-member.ts, lib/mcp/auth.ts 동일). 스펙 §5 baseline SQL 본문은
 *   `vers=0`을 생략했으나, dev 실데이터에는 `del_yn=false & vers>0`인 낡은 team_mem_rel 행이 존재해
 *   그대로 두면 동일 멤버가 중복되거나 'left' 멤버가 'active'로 되살아난다(중복·유령 행). 정확도 기준
 *   M-01은 이 정본 규약(vers=0)으로 보정한 baseline과 대조한다.
 */

/** 알려진 안전 에러(입력·미존재) — 라우트가 사용자에게 그대로 노출해도 무방한 메시지만 담는다. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

type Db = SupabaseClient<Database>;

const KST = "Asia/Seoul";

/** 임베디드 관계 결과를 to-one으로 정규화(타입 추론이 배열/객체로 갈릴 때 방어). */
function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/**
 * KST 달력일(`date` 미지정 시 오늘) 하루의 UTC 반열림 구간을 계산한다.
 * baseline의 `(stt_at at time zone 'Asia/Seoul')::date = :day`와 동치인
 * `stt_at >= startIso and stt_at < endIso` 필터로 변환하기 위한 순수 함수.
 */
export function kstDayRange(date?: string): {
  day: string;
  startIso: string;
  endIso: string;
} {
  const day =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : dayjs().tz(KST).format("YYYY-MM-DD");
  const start = dayjs.tz(day, KST);
  return {
    day,
    startIso: start.toISOString(),
    endIso: start.add(1, "day").toISOString(),
  };
}

// ── 출력 행 타입 ────────────────────────────────────────────────────────────

export type TodayGatheringRow = {
  gthr_id: string;
  gthr_nm: string;
  gthr_type_enm: string;
  stt_at: string;
  end_at: string | null;
  loc_txt: string | null;
  max_prt_cnt: number | null;
  attendee_cnt: number;
};

export type RecentMemberRow = {
  mem_id: string;
  mem_nm: string;
  join_dt: string | null;
  team_role_cd: string;
  mem_st_cd: string;
};

export type AttendanceRow = {
  mem_id: string;
  mem_nm: string;
  join_dt: string | null;
  attendance_cnt: number;
  last_attended_at: string | null;
};

export type MemberProfileRow = {
  mem_id: string;
  mem_nm: string;
  birth_dt: string | null;
  gdr_enm: string | null;
  join_dt: string | null;
  team_role_cd: string;
  mem_st_cd: string;
  intro_txt: string | null;
  avatar_url: string | null;
};

export type PushStatusRow = {
  mem_id: string;
  mem_nm: string;
  mem_st_cd: string;
  push_enabled: boolean;
};

/** 집계용 최소 멤버 형태. */
type MemberSeed = { mem_id: string; mem_nm: string; join_dt: string | null };
/** 집계용 참석 이벤트(과거 팀 모임 1건 참석 = 1행). */
type AttendanceEvent = { mem_id: string; stt_at: string | null };

// ── 순수 집계·정렬 로직(단위 테스트 대상) ─────────────────────────────────────

/**
 * baseline 정렬 규약: `last_attended_at asc nulls first, attendance_cnt asc`.
 * (전혀/오래 안 나온 멤버가 앞) — 최종 호출 판단은 AI가 하도록 사실만 정렬한다.
 * ISO timestamptz 문자열(모두 동일 +00:00 오프셋)의 사전식 비교 = 시간순.
 */
function compareAttendance(a: AttendanceRow, b: AttendanceRow): number {
  const al = a.last_attended_at;
  const bl = b.last_attended_at;
  if (al === null && bl !== null) return -1; // nulls first
  if (al !== null && bl === null) return 1;
  if (al !== null && bl !== null) {
    if (al < bl) return -1;
    if (al > bl) return 1;
  }
  return a.attendance_cnt - b.attendance_cnt;
}

/**
 * 멤버 목록에 각자의 과거 팀 모임 참석 횟수/마지막 참석시각을 left-merge 후 정렬한다.
 * baseline §5.3/§5.5의 `count(...) filter (where stt_at<=now)` / `max(...) filter (...)`와 동치:
 * `events`는 이미 "과거 & 팀 & 미삭제 모임" 참석으로 필터된 행만 담겨야 한다.
 */
export function aggregateAttendance(
  members: MemberSeed[],
  events: AttendanceEvent[],
  limit?: number,
): AttendanceRow[] {
  const byMem = new Map<string, { cnt: number; last: string | null }>();
  for (const e of events) {
    const cur = byMem.get(e.mem_id) ?? { cnt: 0, last: null };
    cur.cnt += 1;
    if (
      e.stt_at !== null &&
      (cur.last === null || dayjs(e.stt_at).isAfter(dayjs(cur.last)))
    ) {
      cur.last = e.stt_at;
    }
    byMem.set(e.mem_id, cur);
  }
  const rows: AttendanceRow[] = members.map((m) => {
    const agg = byMem.get(m.mem_id);
    return {
      mem_id: m.mem_id,
      mem_nm: m.mem_nm,
      join_dt: m.join_dt,
      attendance_cnt: agg?.cnt ?? 0,
      last_attended_at: agg?.last ?? null,
    };
  });
  rows.sort(compareAttendance);
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

/**
 * 멤버별 푸시 구독 여부를 표시하고 baseline §5.6 정렬(`push_enabled asc, mem_nm`)로 정렬한다.
 * 이름 단위 정렬은 DB collation과 완전히 일치하지 않을 수 있어(핵심은 push_enabled 그룹핑) 참고.
 */
export function buildPushStatus(
  members: Array<{ mem_id: string; mem_nm: string; mem_st_cd: string }>,
  subscribedMemIds: ReadonlySet<string>,
): PushStatusRow[] {
  const rows: PushStatusRow[] = members.map((m) => ({
    mem_id: m.mem_id,
    mem_nm: m.mem_nm,
    mem_st_cd: m.mem_st_cd,
    push_enabled: subscribedMemIds.has(m.mem_id),
  }));
  rows.sort((a, b) => {
    if (a.push_enabled !== b.push_enabled) return a.push_enabled ? 1 : -1; // false first
    return a.mem_nm.localeCompare(b.mem_nm);
  });
  return rows;
}

// ── 쿼리 함수(supabase 주입) ─────────────────────────────────────────────────

/** 활성 팀 멤버(정본 vers=0) 시드 목록 — 5.3/5.5 공통 기반. */
async function fetchActiveMemberSeeds(
  supabase: Db,
  teamId: string,
): Promise<MemberSeed[]> {
  const { data, error } = await supabase
    .from("team_mem_rel")
    .select("mem_id, join_dt, mem_mst!inner(mem_nm)")
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .eq("vers", 0)
    .eq("mem_st_cd", "active")
    .eq("mem_mst.del_yn", false);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const mem = pickOne(r.mem_mst as { mem_nm: string } | { mem_nm: string }[]);
    return {
      mem_id: r.mem_id as string,
      mem_nm: mem?.mem_nm ?? "",
      join_dt: (r.join_dt as string | null) ?? null,
    };
  });
}

/** 과거(이미 시작된) 팀 모임 참석 이벤트 목록 — 5.3/5.5 공통 기반. */
async function fetchPastAttendanceEvents(
  supabase: Db,
  teamId: string,
): Promise<AttendanceEvent[]> {
  const nowIso = dayjs().toISOString();
  const { data, error } = await supabase
    .from("gthr_attd_rel")
    .select("mem_id, gthr_mst!inner(stt_at)")
    .eq("gthr_mst.team_id", teamId)
    .eq("gthr_mst.del_yn", false)
    .lte("gthr_mst.stt_at", nowIso);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const g = pickOne(r.gthr_mst as { stt_at: string } | { stt_at: string }[]);
    return { mem_id: r.mem_id as string, stt_at: (g?.stt_at as string) ?? null };
  });
}

/** §5.1 오늘(또는 지정일, KST)의 팀 모임 + 참석자 수. */
export async function listTodayGatherings(
  supabase: Db,
  teamId: string,
  date?: string,
): Promise<TodayGatheringRow[]> {
  const { startIso, endIso } = kstDayRange(date);
  const { data, error } = await supabase
    .from("gthr_mst")
    .select(
      "gthr_id, gthr_nm, gthr_type_enm, stt_at, end_at, loc_txt, max_prt_cnt, gthr_attd_rel(count)",
    )
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .gte("stt_at", startIso)
    .lt("stt_at", endIso)
    .order("stt_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((g) => {
    const countRel = g.gthr_attd_rel as Array<{ count: number }> | null;
    return {
      gthr_id: g.gthr_id as string,
      gthr_nm: g.gthr_nm as string,
      gthr_type_enm: g.gthr_type_enm as string,
      stt_at: g.stt_at as string,
      end_at: (g.end_at as string | null) ?? null,
      loc_txt: (g.loc_txt as string | null) ?? null,
      max_prt_cnt: (g.max_prt_cnt as number | null) ?? null,
      attendee_cnt: countRel?.[0]?.count ?? 0,
    };
  });
}

/** §5.2 최근 가입 멤버(join_dt desc nulls last, crt_at desc). */
export async function listRecentMembers(
  supabase: Db,
  teamId: string,
  limit = 10,
): Promise<RecentMemberRow[]> {
  const { data, error } = await supabase
    .from("team_mem_rel")
    .select("mem_id, join_dt, team_role_cd, mem_st_cd, crt_at, mem_mst!inner(mem_nm)")
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .eq("vers", 0)
    .eq("mem_mst.del_yn", false)
    .order("join_dt", { ascending: false, nullsFirst: false })
    .order("crt_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const mem = pickOne(r.mem_mst as { mem_nm: string } | { mem_nm: string }[]);
    return {
      mem_id: r.mem_id as string,
      mem_nm: mem?.mem_nm ?? "",
      join_dt: (r.join_dt as string | null) ?? null,
      team_role_cd: r.team_role_cd as string,
      mem_st_cd: r.mem_st_cd as string,
    };
  });
}

/** §5.3 멤버별 참석 현황(오래/전혀 안 나온 순). */
export async function listMembersAttendance(
  supabase: Db,
  teamId: string,
  limit?: number,
): Promise<AttendanceRow[]> {
  const [members, events] = await Promise.all([
    fetchActiveMemberSeeds(supabase, teamId),
    fetchPastAttendanceEvents(supabase, teamId),
  ]);
  return aggregateAttendance(members, events, limit);
}

/** §5.4 멤버 프로필(연락처·계좌 절대 미포함). member_id 또는 name으로 조회. */
export async function getMemberProfile(
  supabase: Db,
  teamId: string,
  params: { memberId?: string; name?: string },
): Promise<MemberProfileRow[]> {
  const { memberId, name } = params;
  if (!memberId && !name) {
    throw new ToolInputError("member_id 또는 name 중 하나는 필요합니다.");
  }
  let query = supabase
    .from("team_mem_rel")
    .select(
      "join_dt, team_role_cd, mem_st_cd, intro_txt, mem_mst!inner(mem_id, mem_nm, birth_dt, gdr_enm, avatar_url)",
    )
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .eq("vers", 0)
    .eq("mem_mst.del_yn", false);
  if (memberId) {
    query = query.eq("mem_mst.mem_id", memberId);
  } else if (name) {
    // baseline lower(mem_nm)=lower(name) 동치. ilike(무와일드카드)=대소문자 무시 완전일치.
    query = query.ilike("mem_mst.mem_nm", name);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => {
    const mem = pickOne(
      r.mem_mst as
        | {
            mem_id: string;
            mem_nm: string;
            birth_dt: string | null;
            gdr_enm: string | null;
            avatar_url: string | null;
          }
        | Array<{
            mem_id: string;
            mem_nm: string;
            birth_dt: string | null;
            gdr_enm: string | null;
            avatar_url: string | null;
          }>,
    );
    return {
      mem_id: mem?.mem_id ?? "",
      mem_nm: mem?.mem_nm ?? "",
      birth_dt: mem?.birth_dt ?? null,
      gdr_enm: mem?.gdr_enm ?? null,
      join_dt: (r.join_dt as string | null) ?? null,
      team_role_cd: r.team_role_cd as string,
      mem_st_cd: r.mem_st_cd as string,
      intro_txt: (r.intro_txt as string | null) ?? null,
      avatar_url: mem?.avatar_url ?? null,
    };
  });
}

/** §5.5 특정 모임 미참석 활성 멤버 + 각자 참석 현황. */
export async function listGatheringNonAttendees(
  supabase: Db,
  teamId: string,
  gatheringId: string,
): Promise<AttendanceRow[]> {
  // 모임 존재·팀 스코프 검증(§7: 존재하지 않는 gathering_id → 안전 에러).
  const { data: gthr, error: gErr } = await supabase
    .from("gthr_mst")
    .select("gthr_id")
    .eq("gthr_id", gatheringId)
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .maybeSingle();
  if (gErr) throw gErr;
  if (!gthr) throw new ToolInputError("해당 모임을 찾을 수 없습니다.");

  const [members, events, attendeeIds] = await Promise.all([
    fetchActiveMemberSeeds(supabase, teamId),
    fetchPastAttendanceEvents(supabase, teamId),
    (async () => {
      const { data, error } = await supabase
        .from("gthr_attd_rel")
        .select("mem_id")
        .eq("gthr_id", gatheringId);
      if (error) throw error;
      return new Set((data ?? []).map((a) => a.mem_id as string));
    })(),
  ]);

  const nonAttendees = members.filter((m) => !attendeeIds.has(m.mem_id));
  return aggregateAttendance(nonAttendees, events);
}

/** §5.6 활성 멤버별 푸시 구독 여부. */
export async function listPushStatus(
  supabase: Db,
  teamId: string,
): Promise<PushStatusRow[]> {
  const { data: memberRows, error: mErr } = await supabase
    .from("team_mem_rel")
    .select("mem_id, mem_st_cd, mem_mst!inner(mem_nm)")
    .eq("team_id", teamId)
    .eq("del_yn", false)
    .eq("vers", 0)
    .eq("mem_st_cd", "active")
    .eq("mem_mst.del_yn", false);
  if (mErr) throw mErr;

  const { data: subs, error: sErr } = await supabase
    .from("push_sub_rel")
    .select("mem_id")
    .eq("team_id", teamId);
  if (sErr) throw sErr;

  const subscribed = new Set((subs ?? []).map((s) => s.mem_id as string));
  const members = (memberRows ?? []).map((r) => {
    const mem = pickOne(r.mem_mst as { mem_nm: string } | { mem_nm: string }[]);
    return {
      mem_id: r.mem_id as string,
      mem_nm: mem?.mem_nm ?? "",
      mem_st_cd: r.mem_st_cd as string,
    };
  });
  return buildPushStatus(members, subscribed);
}
