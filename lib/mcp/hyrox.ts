import type { SupabaseClient } from "@supabase/supabase-js";

import { secondsToTime, timeStringToSeconds, todayKST } from "@/lib/dayjs";
import {
  HYROX_DIVISIONS,
  HYROX_RECORD_DIVISIONS,
  HYROX_SPRT_CD,
  HYROX_STATION_CODES,
  buildHyroxBoards,
  serializeHyroxSplits,
  sumHyroxSplits,
  type HyroxEntry,
  type HyroxRecordDivision,
  type HyroxSplits,
} from "@/lib/hyrox";
import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError } from "@/lib/mcp/queries";
import { fetchHyroxRankingRows } from "@/lib/queries/hyrox-rankings";
import { insertRaceRecordCore } from "@/lib/race-record";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — 하이록스 도구 3개(#349).
 *
 * - `list_hyrox_rankings` — 전당 하이록스 판과 **같은 계산**(`buildHyroxBoards`)으로 순위·스플릿을 돌려준다.
 * - `list_hyrox_competitions` — 기록을 붙일 하이록스 대회 고르기용(comp_id·이름·날짜·부문).
 * - `log_hyrox_record` — 대회 기록 1건 등록. 저장은 앱과 **같은 코어**(`lib/race-record.ts`)를 탄다.
 *
 * ## 권한 — 앱에서 보이는 만큼만
 * 조회 둘은 멤버 누구나(전당·대회 목록은 앱에서도 멤버에게 공개다). 등록은 **본인 기록**이 기본이고,
 * `member_id` 로 남의 기록을 넣는 건 **admin 만** — 앱의 관리자 > 기록 관리 「대신 등록」과 같은 범위다.
 * 대상은 이 팀의 활동 중(active) 회원만(앱의 `adminSaveRaceRecord` 와 같은 기준).
 *
 * ## 앱과 다른 것
 * ① 대회는 만들지 않는다 — 없으면 앱에서 대회를 먼저 등록한다(대회는 팀 공용 데이터라 MCP 가 아무 이름으로
 * 만들면 목록이 더러워진다) ② `dry_run` ③ 감사행(`mcp_audit_log`).
 * 캐시 무효화·칭호 평가는 `next/*` 라 라우트가 한다(이 모듈은 `next/*` 를 import 하지 않는다).
 */

type Db = SupabaseClient<Database>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/*  조회 — 순위                                                        */
/* ------------------------------------------------------------------ */

type McpHyroxEntry = {
  rank: number;
  mem_id: string;
  name: string;
  record: string;
  record_sec: number;
  race_nm: string | null;
  race_dt: string | null;
  /** 입력된 스테이션만 `{코드: "M:SS"}` */
  splits: Record<string, string>;
};

function toMcpEntry(e: HyroxEntry): McpHyroxEntry {
  return {
    rank: e.rank,
    mem_id: e.memId,
    name: e.name,
    record: e.record,
    record_sec: e.recordSec,
    race_nm: e.raceName,
    race_dt: e.raceDt,
    splits: Object.fromEntries(
      Object.entries(e.splits).map(([code, sec]) => [code, secondsToTime(sec as number)]),
    ),
  };
}

/**
 * 하이록스 순위 — 부문마다 사람당 가장 빠른 기록 하나. 전당과 같은 규칙(가입 전 기록 제외 등)은 RPC 가 지킨다.
 *
 * @param input.division 한 부문만(`OPEN`·`PRO`·`DOUBLES`). 없으면 전부. 릴레이는 판이 없다
 * @param input.gender 오픈·프로에서 한쪽만(`male`·`female`)
 * @returns 부문별 판. 오픈·프로는 `men`/`women`, 더블스는 `entries`
 */
export async function listHyroxRankings(
  supabase: Db,
  ctx: OperatorContext,
  input: { division?: string | null; gender?: "male" | "female" | null },
) {
  const division = input.division?.trim().toUpperCase() || null;
  if (division && !HYROX_DIVISIONS.some((d) => d.code === division)) {
    throw new ToolInputError(
      `division 은 ${HYROX_DIVISIONS.map((d) => d.code).join("·")} 중 하나입니다(릴레이는 순위가 없습니다).`,
    );
  }

  const rows = await fetchHyroxRankingRows(supabase, ctx.team_id);
  const boards = buildHyroxBoards(rows).filter((b) => !division || b.eventType === `HYROX_${division}`);

  return {
    divisions: boards.map((b) => {
      const code = b.eventType.replace(/^HYROX_/, "");
      if (!b.byGender) {
        return { division: code, label: b.label, by_gender: false, entries: b.all.map(toMcpEntry) };
      }
      return {
        division: code,
        label: b.label,
        by_gender: true,
        ...(input.gender !== "female" ? { men: b.male.map(toMcpEntry) } : {}),
        ...(input.gender !== "male" ? { women: b.female.map(toMcpEntry) } : {}),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  조회 — 대회                                                        */
/* ------------------------------------------------------------------ */

/** 한 번에 돌려주는 대회 수 — 고르기용이라 최근 것부터 이만큼이면 충분하다 */
export const HYROX_COMPETITION_LIMIT = 50;

/**
 * 하이록스 대회 목록 — 최근 시작일부터. 기록 등록에 쓸 `comp_id` 를 고르는 용도.
 *
 * @param input.query 대회명 일부
 * @param input.from 이 날짜(YYYY-MM-DD) 이후 시작
 * @param input.to 이 날짜까지 시작
 * @returns 대회 목록(최대 {@link HYROX_COMPETITION_LIMIT}건)
 * @throws ToolInputError 날짜 형식이 틀렸을 때
 */
export async function listHyroxCompetitions(
  supabase: Db,
  input: { query?: string | null; from?: string | null; to?: string | null },
) {
  for (const [key, value] of [["from", input.from], ["to", input.to]] as const) {
    if (value && !DATE_RE.test(value)) throw new ToolInputError(`${key} 는 YYYY-MM-DD 형식이어야 합니다.`);
  }

  let q = supabase
    .from("comp_mst")
    .select("comp_id, comp_nm, stt_dt, end_dt, loc_nm, comp_evt_cfg(comp_evt_type, vers, del_yn)")
    .eq("comp_sprt_cd", HYROX_SPRT_CD)
    .eq("vers", 0)
    .eq("del_yn", false);
  const query = input.query?.trim();
  if (query) q = q.ilike("comp_nm", `%${query.replace(/[%_]/g, "")}%`);
  if (input.from) q = q.gte("stt_dt", input.from);
  if (input.to) q = q.lte("stt_dt", input.to);

  const { data, error } = await q
    .order("stt_dt", { ascending: false })
    .order("comp_id", { ascending: true })
    .limit(HYROX_COMPETITION_LIMIT);
  if (error) throw new Error(error.message);

  return {
    competitions: (data ?? []).map((row) => {
      const evts = (row as unknown as { comp_evt_cfg?: { comp_evt_type: string; vers: number; del_yn: boolean }[] })
        .comp_evt_cfg ?? [];
      return {
        comp_id: row.comp_id,
        comp_nm: row.comp_nm,
        stt_dt: row.stt_dt,
        end_dt: row.end_dt ?? null,
        loc_nm: row.loc_nm ?? null,
        // 대회에 아직 없는 부문도 등록할 수 있다(기록 등록이 그 부문을 대회에 붙인다)
        divisions: [
          ...new Set(
            evts
              .filter((e) => e.vers === 0 && !e.del_yn)
              .map((e) => e.comp_evt_type.trim().toUpperCase()),
          ),
        ],
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  등록                                                               */
/* ------------------------------------------------------------------ */

export type LogHyroxRecordInput = {
  comp_id: string;
  division: string;
  total_time: string;
  splits?: Record<string, string | null | undefined> | null;
  race_dt?: string | null;
  member_id?: string | null;
  dry_run?: boolean;
};

/**
 * 입력 검증(순수) — 시간 문자열을 초로, 스플릿 키·형식, 스플릿 합 ≤ 총시간.
 *
 * @returns 정규화한 부문·총시간(초)·스플릿(초)
 * @throws ToolInputError 형식이 틀렸을 때(무엇이 틀렸는지 메시지에 담는다)
 */
export function parseHyroxRecordInput(input: Pick<LogHyroxRecordInput, "division" | "total_time" | "splits">): {
  division: HyroxRecordDivision;
  totalSec: number;
  splits: HyroxSplits | null;
} {
  const division = input.division.trim().toUpperCase();
  if (!(HYROX_RECORD_DIVISIONS as readonly string[]).includes(division)) {
    throw new ToolInputError(`division 은 ${HYROX_RECORD_DIVISIONS.join("·")} 중 하나입니다.`);
  }

  const totalSec = timeStringToSeconds(input.total_time ?? "");
  if (!totalSec || totalSec <= 0) {
    throw new ToolInputError("total_time 은 'H:MM:SS' 또는 'MM:SS' 형식이어야 합니다(예: 1:12:34).");
  }

  const raw: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(input.splits ?? {})) {
    const code = key.trim().toUpperCase();
    if (!(HYROX_STATION_CODES as readonly string[]).includes(code)) {
      throw new ToolInputError(`splits 의 키는 ${HYROX_STATION_CODES.join("·")} 중 하나입니다(받은 값: ${key}).`);
    }
    if (value == null || value === "") continue;
    const sec = timeStringToSeconds(value);
    if (!sec || sec <= 0) throw new ToolInputError(`splits.${code} 은 'M:SS' 형식이어야 합니다(받은 값: ${value}).`);
    raw[code] = sec;
  }
  const splits = serializeHyroxSplits(raw);

  // 스테이션 합이 총시간보다 길 수는 없다(총시간엔 런 8km 까지 들어 있다) — 단위를 헷갈린 입력을 잡는다
  const sum = splits ? sumHyroxSplits(splits) : null;
  if (sum != null && sum > totalSec) {
    throw new ToolInputError(
      `스테이션 합(${secondsToTime(sum)})이 총시간(${secondsToTime(totalSec)})보다 깁니다. 시간 단위를 확인하세요.`,
    );
  }

  return { division: division as HyroxRecordDivision, totalSec, splits };
}

/**
 * 하이록스 대회 기록 1건 등록(본인, 또는 admin 이 `member_id` 로 대신).
 *
 * @returns 저장(또는 dry_run 으로 해석)한 값과 캐시를 털어야 하는지(`should_invalidate` — 라우트가 쓴다)
 * @throws ToolDeniedError admin 이 아닌데 남의 기록을 넣으려 할 때
 * @throws ToolInputError 입력·대회·대상 회원이 맞지 않을 때, 중복 기록일 때
 */
export async function logHyroxRecord(supabase: Db, ctx: OperatorContext, input: LogHyroxRecordInput) {
  const parsed = parseHyroxRecordInput(input);

  // ── 대상 회원 ──
  const targetId = input.member_id?.trim() || ctx.mem_id;
  const forOther = targetId !== ctx.mem_id;
  if (forOther && !ctx.is_admin) {
    throw new ToolDeniedError("다른 회원의 기록 등록은 운영진(admin)만 할 수 있습니다. 본인 기록은 member_id 없이 부르세요.");
  }
  const [{ data: rel }, { data: mst }] = await Promise.all([
    supabase
      .from("team_mem_rel")
      .select("team_mem_id")
      .eq("team_id", ctx.team_id)
      .eq("mem_id", targetId)
      .eq("mem_st_cd", "active")
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle(),
    supabase
      .from("mem_mst")
      .select("mem_nm, gdr_enm")
      .eq("mem_id", targetId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle(),
  ]);
  if (!rel || !mst) throw new ToolInputError("활동 중인 크루 회원이 아닙니다.");

  // ── 대회 ──
  const { data: comp } = await supabase
    .from("comp_mst")
    .select("comp_id, comp_nm, comp_sprt_cd, stt_dt, end_dt")
    .eq("comp_id", input.comp_id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  if (!comp) throw new ToolInputError("대회를 찾을 수 없습니다. list_hyrox_competitions 로 comp_id 를 확인하세요.");
  if (comp.comp_sprt_cd !== HYROX_SPRT_CD) {
    throw new ToolInputError("하이록스 대회가 아닙니다. list_hyrox_competitions 로 comp_id 를 확인하세요.");
  }

  // ── 대회일 — 기본은 시작일, 여러 날짜 대회면 기간 안의 날 ──
  const raceDt = input.race_dt?.trim() || comp.stt_dt;
  if (!DATE_RE.test(raceDt)) throw new ToolInputError("race_dt 는 YYYY-MM-DD 형식이어야 합니다.");
  const endDt = comp.end_dt ?? comp.stt_dt;
  if (raceDt < comp.stt_dt || raceDt > endDt) {
    throw new ToolInputError(`race_dt 는 대회 기간(${comp.stt_dt}~${endDt}) 안이어야 합니다.`);
  }
  if (raceDt > todayKST()) throw new ToolInputError("아직 열리지 않은 대회에는 기록을 넣을 수 없습니다.");

  const summary = {
    member: { mem_id: targetId, mem_nm: mst.mem_nm },
    comp_id: comp.comp_id,
    comp_nm: comp.comp_nm,
    race_dt: raceDt,
    division: parsed.division,
    ranked: parsed.division !== "RELAY",
    total_time: secondsToTime(parsed.totalSec),
    splits: parsed.splits
      ? Object.fromEntries(Object.entries(parsed.splits).map(([k, v]) => [k, secondsToTime(v as number)]))
      : {},
  };

  if (input.dry_run) return { dry_run: true, saved: false, ...summary, team_mem_id: rel.team_mem_id, should_invalidate: false };

  const result = await insertRaceRecordCore(
    supabase,
    supabase,
    ctx.team_id,
    { memId: targetId, teamMemId: rel.team_mem_id, gender: mst.gdr_enm ?? null },
    {
      competitionId: comp.comp_id,
      registrationCompEvtId: null,
      competitionTitle: comp.comp_nm,
      competitionDate: raceDt,
      eventType: parsed.division,
      totalSeconds: parsed.totalSec,
      swimSeconds: null,
      bikeSeconds: null,
      runSeconds: null,
      stationSplits: parsed.splits,
    },
  );
  if (!result.ok) throw new ToolInputError(result.message);

  // 감사행 — 쓰기 도구는 누가 누구의 무엇을 넣었는지 남긴다(create_sch_post 등과 같은 규약)
  const { error: auditErr } = await supabase.from("mcp_audit_log").insert({
    audit_id: crypto.randomUUID(),
    actor_mem_id: ctx.mem_id,
    team_id: ctx.team_id,
    tool_nm: "log_hyrox_record",
    params_json: {
      target_mem_id: targetId,
      comp_id: comp.comp_id,
      race_dt: raceDt,
      division: parsed.division,
      total_sec: parsed.totalSec,
      splits: parsed.splits,
    },
    result_summary: `log_hyrox_record ok: mem=${targetId} comp=${comp.comp_id} ${parsed.division} ${parsed.totalSec}s`,
  });
  if (auditErr) console.error("[mcp] log_hyrox_record 감사 기록 실패", auditErr.message);

  return {
    dry_run: false,
    saved: true,
    ...summary,
    team_mem_id: rel.team_mem_id,
    should_invalidate: result.shouldInvalidate,
  };
}
