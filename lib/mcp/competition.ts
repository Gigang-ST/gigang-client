import type { SupabaseClient } from "@supabase/supabase-js";

import { createCompetitionCore, validateCompetitionInput } from "@/lib/competition-create";
import { toCompetition } from "@/lib/competition-row";
import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError, escapeLikePattern } from "@/lib/mcp/queries";
import type { CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import { ensureTeamCompPlanRel } from "@/lib/queries/ensure-team-comp-plan-rel";
import { normalizeCompEvtType, resolveOrCreateCompEvtId } from "@/lib/server/comp-evt-cfg";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — 대회 도구 3개(#700).
 *
 * - `list_competitions` — 이름·날짜로 대회 찾기(대회 id·종목·내 신청 상태). 쓰기 도구에 넣을 `comp_id` 고르는 용도.
 * - `create_competition` — 대회 추가. 검증·저장은 웹의 `createCompetition` 과 **같은 코어**(`lib/competition-create.ts`).
 * - `register_competition` — **호출한 본인**의 참가 신청. 저장은 웹 신청 경로와 같은 단계
 *   (`ensureTeamCompPlanRel` → `resolveOrCreateCompEvtId` → `comp_reg_rel` insert)를 따른다.
 *
 * ## 권한
 * `create_competition` 은 **admin 전용**이다 — 이슈가 "관리자 폼과 같은 권한"을 요구하고, 앱의 서버 액션은 활성
 * 멤버에게도 열려 있지만 MCP 는 그보다 좁게 둔다(대회는 팀 공용 데이터라 AI 가 아무 이름으로 만들면 목록이 더러워진다).
 * 조회·신청은 멤버 누구나. 신청은 **본인 것만**(대상 멤버를 인자로 받지 않는다).
 *
 * ## 웹과 같은 것 / 다른 것
 * 같은 것: 팀 알림·단톡 공지를 보내지 않는다. 포인트·칭호는 DB 트리거·후속 평가가 따라온다(앱 코드에 훅 없음).
 * 다른 것: `dry_run`, 이미 신청돼 있으면 **고치지 않고** 상태만 돌려준다, 같은 이름·날짜 대회가 있으면
 * **만들지 않고** 기존 것을 돌려준다, 감사행(`mcp_audit_log`).
 * 캐시 무효화는 `next/*` 라 라우트가 한다(이 모듈은 `next/*` 를 import 하지 않는다).
 */

type Db = SupabaseClient<Database>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const COMPETITION_LIST_LIMIT = 50;
export const REGISTER_ROLES = ["participant", "cheering", "volunteer"] as const;
export type RegisterRole = (typeof REGISTER_ROLES)[number];

function requireDate(label: string, value: string): string {
  if (!DATE_RE.test(value)) throw new ToolInputError(`${label} 는 YYYY-MM-DD 형식이어야 합니다.`);
  return value;
}

/* ------------------------------------------------------------------ */
/*  조회                                                               */
/* ------------------------------------------------------------------ */

type CompetitionListRow = {
  comp_id: string;
  short_id: string | null;
  comp_nm: string;
  comp_sprt_cd: string | null;
  stt_dt: string;
  end_dt: string | null;
  loc_nm: string | null;
  src_url: string | null;
  comp_evt_cfg?: { comp_evt_type: string | null; vers: number; del_yn: boolean }[] | null;
};

function activeEventTypes(row: CompetitionListRow): string[] {
  return [
    ...new Set(
      (row.comp_evt_cfg ?? [])
        .filter((e) => e.vers === 0 && !e.del_yn && e.comp_evt_type)
        .map((e) => normalizeCompEvtType(e.comp_evt_type as string)),
    ),
  ];
}

const LIST_COLUMNS =
  "comp_id, short_id, comp_nm, comp_sprt_cd, stt_dt, end_dt, loc_nm, src_url, comp_evt_cfg(comp_evt_type, vers, del_yn)";

/**
 * 대회 찾기 — 이름 일부·기간·종목으로, 시작일 최신순 최대 50건.
 * 각 대회에 **내 신청 상태**(`my_registration`)를 붙인다(이 팀 기준).
 */
export async function listCompetitions(
  supabase: Db,
  ctx: OperatorContext,
  input: { query?: string | null; from?: string | null; to?: string | null; sport?: string | null },
) {
  if (input.from) requireDate("from", input.from);
  if (input.to) requireDate("to", input.to);

  let q = supabase.from("comp_mst").select(LIST_COLUMNS).eq("vers", 0).eq("del_yn", false);
  const query = input.query?.trim();
  if (query) q = q.ilike("comp_nm", `%${query.replace(/[%_]/g, "")}%`);
  if (input.from) q = q.gte("stt_dt", input.from);
  if (input.to) q = q.lte("stt_dt", input.to);
  if (input.sport) q = q.eq("comp_sprt_cd", input.sport.trim());

  const { data, error } = await q
    .order("stt_dt", { ascending: false })
    .order("comp_id", { ascending: true })
    .limit(COMPETITION_LIST_LIMIT);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as CompetitionListRow[];
  const mine = await findMyRegistrations(
    supabase,
    ctx,
    rows.map((r) => r.comp_id),
  );

  return {
    competitions: rows.map((row) => ({
      comp_id: row.comp_id,
      short_id: row.short_id ?? null,
      comp_nm: row.comp_nm,
      sport: row.comp_sprt_cd ?? null,
      stt_dt: row.stt_dt,
      end_dt: row.end_dt ?? null,
      loc_nm: row.loc_nm ?? null,
      src_url: row.src_url ?? null,
      event_types: activeEventTypes(row),
      my_registration: mine.get(row.comp_id) ?? null,
    })),
  };
}

type MyRegistration = { comp_reg_id: string; role: string; event_type: string | null };

/** 이 팀 기준으로 내가 신청한 대회 → 신청 요약. 팀 대회 계획(`team_comp_plan_rel`)에 붙은 것만 본다. */
async function findMyRegistrations(
  supabase: Db,
  ctx: { mem_id: string; team_id: string },
  compIds: string[],
): Promise<Map<string, MyRegistration>> {
  const out = new Map<string, MyRegistration>();
  if (compIds.length === 0) return out;
  const { data, error } = await supabase
    .from("comp_reg_rel")
    .select(
      "comp_reg_id, prt_role_cd, comp_evt_cfg(comp_evt_type), team_comp_plan_rel!inner(comp_id, team_id, vers, del_yn)",
    )
    .eq("mem_id", ctx.mem_id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("team_comp_plan_rel.team_id", ctx.team_id)
    .eq("team_comp_plan_rel.vers", 0)
    .eq("team_comp_plan_rel.del_yn", false)
    .in("team_comp_plan_rel.comp_id", compIds);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as unknown as {
    comp_reg_id: string;
    prt_role_cd: string;
    comp_evt_cfg: { comp_evt_type: string | null } | { comp_evt_type: string | null }[] | null;
    team_comp_plan_rel: { comp_id: string } | { comp_id: string }[] | null;
  }[]) {
    const plan = Array.isArray(row.team_comp_plan_rel) ? row.team_comp_plan_rel[0] : row.team_comp_plan_rel;
    const evt = Array.isArray(row.comp_evt_cfg) ? row.comp_evt_cfg[0] : row.comp_evt_cfg;
    if (!plan?.comp_id) continue;
    out.set(plan.comp_id, {
      comp_reg_id: row.comp_reg_id,
      role: row.prt_role_cd,
      event_type: evt?.comp_evt_type ? normalizeCompEvtType(evt.comp_evt_type) : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  대회 추가                                                          */
/* ------------------------------------------------------------------ */

export type CreateCompetitionMcpInput = {
  title: string;
  sport: string;
  start_date: string;
  end_date?: string | null;
  location: string;
  event_types: string[];
  source_url: string;
  dry_run?: boolean;
};

type CompetitionSummary = {
  comp_id: string;
  short_id: string | null;
  comp_nm: string;
  sport: string | null;
  stt_dt: string;
  end_dt: string | null;
  loc_nm: string | null;
  src_url: string | null;
  event_types: string[];
};

export type CreateCompetitionMcpResult = {
  dry_run: boolean;
  /** `created` 새로 만듦 / `exists` 같은 이름·날짜 대회가 있어 만들지 않음 / `would_create` dry_run 에서 만들 예정 */
  status: "created" | "exists" | "would_create";
  competition: CompetitionSummary | null;
  /** 저장될(저장된) 값 미리보기 — dry_run 에서 사람이 확인하는 자리 */
  normalized: {
    title: string;
    sport: string;
    start_date: string;
    end_date: string | null;
    location: string | null;
    source_url: string | null;
    event_types: string[];
  };
  audit_id: string | null;
};

function sameName(a: string, b: string) {
  return a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * `create_competition` 본체. admin → 입력 검증(웹과 같은 코어) → 같은 이름·시작일 대회 확인 →
 * (dry_run 이면 여기서 종료) → insert → 감사행.
 *
 * @throws ToolDeniedError admin 이 아님
 * @throws ToolInputError 검증 실패·저장 실패
 */
export async function createCompetitionViaMcp(
  supabase: Db,
  ctx: OperatorContext,
  input: CreateCompetitionMcpInput,
  cmmRows: readonly CachedCmmCdRow[],
  baseUrl?: string | null,
): Promise<CreateCompetitionMcpResult & { comp_url: string | null }> {
  if (!ctx.is_admin) throw new ToolDeniedError("대회 추가는 운영진(admin)만 할 수 있습니다.");

  const title = input.title.trim();
  if (!title) throw new ToolInputError("title: 대회명을 입력해 주세요.");
  requireDate("start_date", input.start_date);
  if (input.end_date) {
    requireDate("end_date", input.end_date);
    if (input.end_date < input.start_date) {
      throw new ToolInputError("end_date: 종료일은 시작일 이후여야 합니다.");
    }
  }
  if (!input.location.trim()) throw new ToolInputError("location: 장소를 입력해 주세요.");
  if (!/^https?:\/\/\S+$/.test(input.source_url.trim())) {
    throw new ToolInputError("source_url: 올바른 URL(http/https)을 입력해 주세요.");
  }

  const coreInput = {
    title,
    sport: input.sport.trim(),
    startDate: input.start_date,
    endDate: input.end_date || null,
    location: input.location,
    eventTypes: input.event_types,
    sourceUrl: input.source_url,
  };
  const checked = validateCompetitionInput(coreInput, cmmRows);
  if (!checked.ok) throw new ToolInputError(checked.message);
  if (checked.eventTypes.length === 0) {
    throw new ToolInputError("event_types: 참가 코스를 1개 이상 입력해 주세요.");
  }

  const normalized = {
    title,
    sport: coreInput.sport,
    start_date: input.start_date,
    end_date: input.end_date || null,
    location: input.location.trim() || null,
    source_url: input.source_url.trim() || null,
    event_types: checked.eventTypes,
  };
  const urlOf = (compId: string, shortId: string | null | undefined) => {
    const path = `/schedule?comp=${shortId ?? compId}`;
    return baseUrl ? `${baseUrl}${path}` : path;
  };

  // 같은 이름·시작일 대회가 있으면 만들지 않고 그걸 돌려준다(대회는 팀 공용 데이터라 중복이 곧 오염이다).
  const { data: sameDay, error: dupErr } = await supabase
    .from("comp_mst")
    .select(LIST_COLUMNS)
    .eq("vers", 0)
    .eq("del_yn", false)
    .eq("stt_dt", input.start_date);
  if (dupErr) throw new Error(dupErr.message);
  const dup = ((sameDay ?? []) as unknown as CompetitionListRow[]).find((r) => sameName(r.comp_nm, title));
  if (dup) {
    return {
      dry_run: !!input.dry_run,
      status: "exists",
      competition: {
        comp_id: dup.comp_id,
        short_id: dup.short_id ?? null,
        comp_nm: dup.comp_nm,
        sport: dup.comp_sprt_cd ?? null,
        stt_dt: dup.stt_dt,
        end_dt: dup.end_dt ?? null,
        loc_nm: dup.loc_nm ?? null,
        src_url: dup.src_url ?? null,
        event_types: activeEventTypes(dup),
      },
      normalized,
      audit_id: null,
      comp_url: urlOf(dup.comp_id, dup.short_id ?? null),
    };
  }

  if (input.dry_run) {
    return {
      dry_run: true,
      status: "would_create",
      competition: null,
      normalized,
      audit_id: null,
      comp_url: null,
    };
  }

  const created = await createCompetitionCore(supabase, { input: coreInput, memberId: ctx.mem_id, cmmRows });
  if (!created.ok) throw new ToolInputError(created.message);
  const comp = toCompetition(created.comp);

  const auditId = crypto.randomUUID();
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "create_competition",
    params_json: { comp_id: comp.id, ...normalized },
    result_summary: `create_competition ok: comp_id=${comp.id}`,
  });
  if (auditErr) console.error("[mcp] create_competition 감사 기록 실패", auditErr.message);

  return {
    dry_run: false,
    status: "created",
    competition: {
      comp_id: comp.id,
      short_id: comp.short_id ?? null,
      comp_nm: comp.title,
      sport: comp.sport,
      stt_dt: comp.start_date,
      end_dt: comp.end_date,
      loc_nm: comp.location,
      src_url: comp.source_url,
      event_types: created.eventTypes,
    },
    normalized,
    audit_id: auditId,
    comp_url: urlOf(comp.id, comp.short_id),
  };
}

/* ------------------------------------------------------------------ */
/*  참가 신청                                                          */
/* ------------------------------------------------------------------ */

export type RegisterCompetitionMcpInput = {
  comp_id: string;
  role?: RegisterRole;
  event_type?: string | null;
  /** 대리 등록 대상(admin) — 회원 uuid. `member_name` 과 같이 주면 id 가 이긴다 */
  member_id?: string | null;
  /** 대리 등록 대상(admin) — 이름 완전일치(대소문자 무시). 동명이인이면 등록하지 않고 후보만 돌려준다 */
  member_name?: string | null;
  dry_run?: boolean;
};

export type RegisterCompetitionMcpResult = {
  dry_run: boolean;
  /**
   * `registered` 신청함 / `already_registered` 이미 신청돼 있어 그대로 둠 / `would_register` dry_run 에서 신청할 예정 /
   * `ambiguous_member` 이름이 여럿에 맞아 **등록하지 않고** 후보만 돌려줌(`candidates`)
   */
  status: "registered" | "already_registered" | "would_register" | "ambiguous_member";
  /** 신청 대상 회원(본인 포함) */
  member: { mem_id: string; mem_nm: string } | null;
  /** `ambiguous_member` 일 때만 — member_id 로 다시 부르세요 */
  candidates: { mem_id: string; mem_nm: string; join_dt: string | null }[] | null;
  competition: { comp_id: string; comp_nm: string; stt_dt: string };
  registration: { comp_reg_id: string | null; role: string; event_type: string | null };
  /** already_registered 이면서 요청한 값과 다를 때만 — 고치지 않았다는 안내 */
  note: string | null;
  audit_id: string | null;
};

type RegisterTarget = { mem_id: string; mem_nm: string };

/**
 * 신청 대상 회원을 정한다. 아무것도 안 주면(또는 본인 id) 호출자 본인, 그 외는 **admin 만**.
 * 대상은 이 팀의 활동 중(active) 회원이어야 한다(`log_hyrox_record` 의 대리 등록과 같은 기준).
 * 이름은 완전일치(대소문자 무시)로 찾고, 여럿이면 `candidates` 로 돌려준다.
 */
async function resolveRegisterTarget(
  supabase: Db,
  ctx: OperatorContext,
  input: { member_id?: string | null; member_name?: string | null },
): Promise<
  | { kind: "ok"; target: RegisterTarget }
  | { kind: "ambiguous"; candidates: { mem_id: string; mem_nm: string; join_dt: string | null }[] }
> {
  const memberId = input.member_id?.trim() || null;
  const memberName = input.member_name?.trim() || null;
  const forSelf = !memberId && !memberName ? true : memberId === ctx.mem_id;

  if (!forSelf && !ctx.is_admin) {
    throw new ToolDeniedError(
      "다른 회원의 대신 신청은 운영진(admin)만 할 수 있습니다. 본인 신청은 member_id·member_name 없이 부르세요.",
    );
  }

  const base = () =>
    supabase
      .from("team_mem_rel")
      .select("join_dt, mem_mst!inner(mem_id, mem_nm)")
      .eq("team_id", ctx.team_id)
      .eq("mem_st_cd", "active")
      .eq("vers", 0)
      .eq("del_yn", false)
      .eq("mem_mst.del_yn", false);

  const targetId = forSelf ? ctx.mem_id : memberId;
  const { data, error } = targetId
    ? await base().eq("mem_mst.mem_id", targetId)
    : await base().ilike("mem_mst.mem_nm", escapeLikePattern(memberName as string));
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as {
    join_dt: string | null;
    mem_mst: { mem_id: string; mem_nm: string } | { mem_id: string; mem_nm: string }[] | null;
  }[])
    .map((r) => ({ join_dt: r.join_dt ?? null, mem: Array.isArray(r.mem_mst) ? r.mem_mst[0] : r.mem_mst }))
    .filter((r) => r.mem);

  if (rows.length === 0) {
    throw new ToolInputError(
      targetId ? "활동 중인 크루 회원이 아닙니다." : `이름이 '${memberName}' 인 활동 중인 회원을 찾지 못했습니다.`,
    );
  }
  if (rows.length > 1) {
    return {
      kind: "ambiguous",
      candidates: rows.map((r) => ({ mem_id: r.mem!.mem_id, mem_nm: r.mem!.mem_nm, join_dt: r.join_dt })),
    };
  }
  return { kind: "ok", target: { mem_id: rows[0].mem!.mem_id, mem_nm: rows[0].mem!.mem_nm } };
}

/**
 * `register_competition` 본체 — 기본은 **호출한 본인**, admin 은 `member_id`/`member_name` 으로 **대리 등록**한다.
 * 이미 신청돼 있으면 고치지 않고 상태를 돌려준다(참여 방식·종목을 바꾸려면 앱의 대회 상세에서 수정한다).
 *
 * 참가(`participant`)는 종목이 필수다. 응원·봉사는 종목 없이 신청한다(웹 신청 폼과 같다).
 * 대회에 아직 없는 종목은 웹처럼 대회에 붙는다(`resolveOrCreateCompEvtId`) — 단 dry_run 에서는 만들지 않는다.
 * 대리 등록이어도 **대상 회원에게 알림은 보내지 않는다**(웹 신청과 같다).
 */
export async function registerCompetitionViaMcp(
  supabase: Db,
  ctx: OperatorContext,
  input: RegisterCompetitionMcpInput,
): Promise<RegisterCompetitionMcpResult> {
  const role: RegisterRole = input.role ?? "participant";
  const eventType = role === "participant" ? normalizeCompEvtType(input.event_type ?? "") : null;
  if (role === "participant") {
    if (!eventType) throw new ToolInputError("event_type: 참가 종목을 입력해 주세요(응원·봉사는 종목 없이 신청).");
    if (compEvtTypeContainsHangul(eventType)) {
      throw new ToolInputError("event_type: 종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요.");
    }
  }

  // 권한 거부는 DB 조회보다 먼저(대회 존재 여부를 비-admin 에게 흘리지 않게)
  const resolved = await resolveRegisterTarget(supabase, ctx, input);

  const { data: comp, error: compErr } = await supabase
    .from("comp_mst")
    .select("comp_id, comp_nm, stt_dt")
    .eq("comp_id", input.comp_id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (compErr) throw new Error(compErr.message);
  if (!comp) throw new ToolInputError("대회를 찾을 수 없습니다. list_competitions 로 comp_id 를 확인하세요.");
  const competition = { comp_id: comp.comp_id, comp_nm: comp.comp_nm, stt_dt: comp.stt_dt };

  if (resolved.kind === "ambiguous") {
    // 동명이인 — 아무도 등록하지 않는다. 사람이 member_id 로 골라 다시 부른다.
    return {
      dry_run: !!input.dry_run,
      status: "ambiguous_member",
      member: null,
      candidates: resolved.candidates,
      competition,
      registration: { comp_reg_id: null, role, event_type: eventType },
      note: "같은 이름의 활동 회원이 여럿입니다. 등록하지 않았습니다. candidates 에서 member_id 를 골라 다시 부르세요.",
      audit_id: null,
    };
  }
  const target = resolved.target;

  // 이미 신청했나 — 이 팀 대회 계획에 붙은 신청(웹의 중복 신청 막다른 길과 같은 키)
  const existing = (await findMyRegistrations(supabase, { mem_id: target.mem_id, team_id: ctx.team_id }, [comp.comp_id])).get(
    comp.comp_id,
  );
  if (existing) {
    const differs = existing.role !== role || (role === "participant" && existing.event_type !== eventType);
    return {
      dry_run: !!input.dry_run,
      status: "already_registered",
      member: target,
      candidates: null,
      competition,
      registration: { comp_reg_id: existing.comp_reg_id, role: existing.role, event_type: existing.event_type },
      note: differs
        ? "이미 신청돼 있어 바꾸지 않았습니다. 참여 방식·종목을 바꾸려면 앱의 대회 상세에서 수정하세요."
        : null,
      audit_id: null,
    };
  }

  if (input.dry_run) {
    return {
      dry_run: true,
      status: "would_register",
      member: target,
      candidates: null,
      competition,
      registration: { comp_reg_id: null, role, event_type: eventType },
      note: null,
      audit_id: null,
    };
  }

  // 웹 신청(createRegistration)과 같은 순서: 팀 대회 계획 → 종목 → 신청 insert
  const ensured = await ensureTeamCompPlanRel(supabase, ctx.team_id, comp.comp_id);
  if (!ensured.ok) throw new ToolInputError("신청에 실패했습니다.");

  let compEvtId: string | null = null;
  if (role === "participant") {
    const evt = await resolveOrCreateCompEvtId(supabase, comp.comp_id, eventType as string);
    if (!evt.ok) throw new ToolInputError(evt.message);
    compEvtId = evt.compEvtId;
  }

  const { data: reg, error: regErr } = await supabase
    .from("comp_reg_rel")
    .insert({
      team_comp_id: ensured.teamCompId,
      mem_id: target.mem_id,
      prt_role_cd: role,
      comp_evt_id: compEvtId,
      vers: 0,
      del_yn: false,
    })
    .select("comp_reg_id, prt_role_cd")
    .single();
  if (regErr || !reg) {
    // 동시에 같은 신청이 들어와 유니크 키(23505)에 걸렸다면 실패가 아니라 "이미 신청"이다
    if (regErr?.code === "23505") {
      const again = (await findMyRegistrations(supabase, { mem_id: target.mem_id, team_id: ctx.team_id }, [comp.comp_id])).get(
        comp.comp_id,
      );
      if (again) {
        return {
          dry_run: false,
          status: "already_registered",
          member: target,
          candidates: null,
          competition,
          registration: { comp_reg_id: again.comp_reg_id, role: again.role, event_type: again.event_type },
          note: null,
          audit_id: null,
        };
      }
    }
    throw new ToolInputError("신청에 실패했습니다.");
  }

  const auditId = crypto.randomUUID();
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: auditId,
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "register_competition",
    params_json: {
      comp_id: comp.comp_id,
      comp_reg_id: reg.comp_reg_id,
      target_mem_id: target.mem_id,
      role,
      event_type: eventType,
    },
    result_summary: `register_competition ok: comp_id=${comp.comp_id} mem=${target.mem_id} reg=${reg.comp_reg_id}`,
  });
  if (auditErr) console.error("[mcp] register_competition 감사 기록 실패", auditErr.message);

  return {
    dry_run: false,
    status: "registered",
    member: target,
    candidates: null,
    competition,
    registration: { comp_reg_id: reg.comp_reg_id, role, event_type: eventType },
    note: null,
    audit_id: auditId,
  };
}
