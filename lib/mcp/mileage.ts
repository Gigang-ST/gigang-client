import type { SupabaseClient } from "@supabase/supabase-js";

import { currentMonthKST, dayjs, todayKST } from "@/lib/dayjs";
import { ToolInputError } from "@/lib/mcp/queries";
import {
  calcBaseMileage,
  calcFinalMileage,
  isMonthAchieved,
  roundMileage,
  MILEAGE_SPORT_LABELS,
  type MileageSport,
} from "@/lib/mileage";
import {
  autoMultiplierIdsFor,
  buildAppliedMults,
  recalcGoalsFromMonth,
  validateActivityDate,
  type AppliedMult,
} from "@/lib/mileage-run";
import type { OperatorContext } from "@/lib/mcp/auth";
import type { Database } from "@/lib/supabase/database.types";
import { activityLogBaseSchema } from "@/lib/validations/mileage-activity";

/**
 * 기강 운영 MCP — 마일리지런 **개인** 도구(#497).
 *
 * ## 성격이 다르다
 * 다른 도구 8개는 "운영진이 팀을 들여다보는" 것이지만, 여기 있는 건 전부 **내 기록**이다.
 * 그래서 대상 멤버를 인자로 받지 않고 토큰 컨텍스트의 `ctx.mem_id` 로만 스코프한다 —
 * admin 이어도 남의 기록에 손대지 못한다(앱의 서버 액션은 admin 우회를 허용하지만, 여기는
 * "내 기록을 보고 넣는" 창구라 그 예외가 없는 편이 놀랍지 않다).
 *
 * ## 쓰기를 여는 게 안전한 이유
 * 멤버는 이미 프로젝트탭 폼에서 아무 수치나 적을 수 있다. MCP 는 **입력 창구가 하나 느는
 * 것이지 새 권한을 주지 않는다.** 팀 전체를 건드리는 쓰기(참가 승인·배율 생성·이벤트 관리)는
 * 계속 제외한다.
 *
 * ## 계산은 앱과 같은 코어를 쓴다
 * 날짜 규칙·배율 적용·목표 연쇄 재계산은 `lib/mileage-run.ts` 한 곳이다. 보증금 환급이 걸린
 * 계산이라 복사해 두면 한쪽만 고쳐지는 날 사람 돈이 어긋난다.
 *
 * ## 사진은 못 붙는다
 * `File` 은 MCP 의 JSON 경계를 못 넘고, 앱 폼도 `uploadActivityPhoto` 로 먼저 올려 URL 만
 * 넘긴다. 사진이 마일리지런 기록을 깅스타그램에 세우는 게이트이므로 **MCP 로 넣은 기록은
 * 전광판에 뜨지 않는다** — 수치·후기는 정상 저장된다. 도구 description 에 적어 AI 가 안내한다.
 *
 * ## 캐시
 * `lib/queries/project-data.ts` 를 재사용하지 않는다. `unstable_cache`·React `cache()` 로
 * 감싸여 있어 **방금 넣은 기록이 최대 60초 동안 안 보인다** — "넣고 바로 확인"이 이 도구의
 * 기본 흐름이라 치명적이다. 여기 조회는 전부 캐시 없는 직접 쿼리다.
 */

type Db = SupabaseClient<Database>;

/** 한 번에 등록할 수 있는 기록 수 — 앱 폼(`activityLogBatchSchema`)과 같은 상한. */
export const MAX_BATCH_ACTIVITIES = 20;

/** 진행 중 이벤트에서 내가 승인된 참가 정보. 모든 도구가 이걸 먼저 얻는다. */
export type MyParticipation = {
  prt_id: string;
  evt_id: string;
  evt_nm: string;
  stt_dt: string;
  end_dt: string;
  stts_enm: string;
  init_goal: number;
  stt_mth: string;
};

export type MyActivityRow = {
  act_id: string;
  act_dt: string;
  sport: MileageSport;
  sport_label: string;
  distance_km: number;
  elevation_m: number;
  base_mlg: number;
  applied_mults: { mult_nm: string; mult_val: number }[];
  final_mlg: number;
  review: string | null;
  /** 사진은 앱에서만 붙일 수 있다. true 면 이 기록은 깅스타그램에도 서 있다. */
  has_photo: boolean;
};

export type MyMileageRow = {
  month: string;
  evt_nm: string;
  goal_mlg: number;
  achv_mlg: number;
  achv_yn: boolean;
  /** 목표까지 남은 마일리지(달성했으면 0). */
  remaining_mlg: number;
  act_cnt: number;
  lst_act_dt: string | null;
};

export type MultiplierRow = {
  mult_id: string;
  mult_nm: string;
  mult_val: number;
  stt_dt: string | null;
  end_dt: string | null;
  active_yn: boolean;
  /** 오늘(KST) 기준으로 지금 걸려 있는가. */
  in_effect_today: boolean;
};

/** 기록 저장 뒤 칭호 평가에 필요한 재료 — 실제 평가(부수효과)는 라우트가 `after()` 로 돌린다. */
export type TitleEvalSeed = {
  teamId: string;
  teamMemId: string;
  projectId: string;
  actDt: string;
  prevAchvYn: boolean;
};

export type LogActivityResult = {
  saved_cnt: number;
  activities: {
    act_id: string;
    act_dt: string;
    sport_label: string;
    distance_km: number;
    elevation_m: number;
    base_mlg: number;
    /** 서버가 그날 걸려 있던 배율을 자동 적용한 결과 — 무엇이 붙었는지 여기 적어 준다. */
    applied_mults: { mult_nm: string; mult_val: number }[];
    final_mlg: number;
  }[];
  month_after: MyMileageRow | null;
  /** 사진이 없어 전광판(깅스타그램)에는 뜨지 않는다는 안내. AI 가 그대로 전하면 된다. */
  notice: string;
  title_eval_seeds: TitleEvalSeed[];
};

const NO_PHOTO_NOTICE =
  "MCP로 넣은 기록은 사진이 없어 기강이야기(깅스타그램)에는 뜨지 않아요. 수치와 후기는 정상 저장됩니다.";

/** `aply_mults` JSON 을 표시용으로 좁힌다(mult_id 는 사람이 읽을 값이 아니다). */
function toDisplayMults(raw: unknown): { mult_nm: string; mult_val: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is AppliedMult => !!m && typeof m === "object" && "mult_nm" in m)
    .map((m) => ({ mult_nm: String(m.mult_nm), mult_val: Number(m.mult_val) }));
}

/** 'YYYY-MM' → 'YYYY-MM-01'. 형식 위반은 안전 에러로 되돌린다. */
function toMonthStart(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ToolInputError(`month 는 'YYYY-MM' 형식이어야 합니다. 받은 값: ${month}`);
  }
  return `${month}-01`;
}

/**
 * 내가 승인된 참가 정보를 찾는다. **`evt_id` 는 도구 인자로 받지 않는다** — 대화에서
 * 이벤트 uuid 를 부를 일이 없다.
 *
 * 고르는 순서: 오늘(KST)이 기간 안인 이벤트 → 없으면 가장 최근에 끝난 것.
 * `CLOSED` 는 마지막 후보로만 남긴다(정산이 끝난 판에 기록을 넣게 유도하지 않는다).
 */
export async function resolveMyParticipation(
  db: Db,
  ctx: OperatorContext,
): Promise<MyParticipation> {
  const { data, error } = await db
    .from("evt_team_prt_rel")
    .select(
      "prt_id, evt_id, init_goal, stt_mth, evt_team_mst!inner(evt_nm, stt_dt, end_dt, stts_enm, team_id)",
    )
    .eq("mem_id", ctx.mem_id)
    .eq("aprv_yn", true)
    .eq("evt_team_mst.team_id", ctx.team_id);

  if (error) throw error;

  const rows = (data ?? []).map((r) => {
    const evt = (
      Array.isArray(r.evt_team_mst) ? r.evt_team_mst[0] : r.evt_team_mst
    ) as {
      evt_nm: string;
      stt_dt: string;
      end_dt: string;
      stts_enm: string;
    };
    return {
      prt_id: r.prt_id as string,
      evt_id: r.evt_id as string,
      evt_nm: evt?.evt_nm ?? "",
      stt_dt: evt?.stt_dt ?? "",
      end_dt: evt?.end_dt ?? "",
      stts_enm: evt?.stts_enm ?? "",
      init_goal: Number(r.init_goal),
      stt_mth: r.stt_mth as string,
    } satisfies MyParticipation;
  });

  if (rows.length === 0) {
    throw new ToolInputError(
      "승인된 마일리지런 참가 정보가 없습니다. 프로젝트탭에서 참가 신청 후 운영진 승인을 받아야 기록을 넣을 수 있어요.",
    );
  }

  const today = todayKST();
  const ongoing = rows
    .filter((r) => r.stts_enm !== "CLOSED" && r.stt_dt <= today && today <= r.end_dt)
    .sort((a, b) => (a.stt_dt < b.stt_dt ? 1 : -1));
  if (ongoing.length > 0) return ongoing[0];

  // 기간 밖이면 가장 최근 이벤트. 날짜 규칙(2개월 이전 불가 등)이 뒤에서 다시 거른다.
  return rows.sort((a, b) => (a.end_dt < b.end_dt ? 1 : -1))[0];
}

/** §1 내 활동 로그 — `date` 하루 또는 `from`~`to` 구간(둘 다 없으면 이번 달). */
export async function listMyActivities(
  db: Db,
  ctx: OperatorContext,
  params: { date?: string; from?: string; to?: string } = {},
): Promise<{ evt_nm: string; range: { from: string; to: string }; activities: MyActivityRow[] }> {
  const prt = await resolveMyParticipation(db, ctx);

  const { from, to } = resolveDateRange(params);

  const { data, error } = await db
    .from("evt_mlg_act_hist")
    .select(
      "act_id, act_dt, sprt_enm, dst_km, elv_m, base_mlg, aply_mults, final_mlg, review, photo_url",
    )
    .eq("prt_id", prt.prt_id)
    .gte("act_dt", from)
    .lte("act_dt", to)
    .order("act_dt", { ascending: false });
  if (error) throw error;

  return {
    evt_nm: prt.evt_nm,
    range: { from, to },
    activities: (data ?? []).map((r) => {
      const sport = r.sprt_enm as MileageSport;
      return {
        act_id: r.act_id as string,
        act_dt: r.act_dt as string,
        sport,
        sport_label: MILEAGE_SPORT_LABELS[sport] ?? sport,
        distance_km: Number(r.dst_km),
        elevation_m: Number(r.elv_m ?? 0),
        base_mlg: Number(r.base_mlg),
        applied_mults: toDisplayMults(r.aply_mults),
        final_mlg: Number(r.final_mlg),
        review: (r.review as string | null) ?? null,
        has_photo: !!r.photo_url,
      };
    }),
  };
}

/** `date` 하루 / `from`~`to` 구간 / 기본 이번 달. 형식 위반은 안전 에러. */
function resolveDateRange(params: { date?: string; from?: string; to?: string }): {
  from: string;
  to: string;
} {
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (params.date) {
    if (!isDate(params.date)) {
      throw new ToolInputError(`date 는 'YYYY-MM-DD' 형식이어야 합니다. 받은 값: ${params.date}`);
    }
    return { from: params.date, to: params.date };
  }
  if (params.from || params.to) {
    const from = params.from ?? params.to!;
    const to = params.to ?? params.from!;
    for (const [label, v] of [["from", from], ["to", to]] as const) {
      if (!isDate(v)) {
        throw new ToolInputError(`${label} 은 'YYYY-MM-DD' 형식이어야 합니다. 받은 값: ${v}`);
      }
    }
    if (from > to) {
      throw new ToolInputError("from 이 to 보다 늦습니다. 기간을 다시 확인해 주세요.");
    }
    return { from, to };
  }
  const monthStart = currentMonthKST();
  return {
    from: monthStart,
    to: dayjs(monthStart).endOf("month").format("YYYY-MM-DD"),
  };
}

/** §2 내 그 달 목표·달성·남은 양. `month` 미지정이면 당월(KST). */
export async function getMyMileage(
  db: Db,
  ctx: OperatorContext,
  params: { month?: string } = {},
): Promise<MyMileageRow> {
  const prt = await resolveMyParticipation(db, ctx);
  const baseDt = params.month ? toMonthStart(params.month) : currentMonthKST();

  const { data, error } = await db
    .from("evt_mlg_mth_snap")
    .select("base_dt, goal_mlg, achv_mlg, achv_yn, act_cnt, lst_act_dt")
    .eq("prt_id", prt.prt_id)
    .eq("base_dt", baseDt)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    // "참가 시작월 이후를 확인하라"고만 하면 도움이 안 된다 — 시작월 뒤인데도 행이 없는 경우가
    // 실제로 있다(참가 도중 합류·데이터 보정 등). **있는 달을 그대로 알려준다.**
    const { data: months } = await db
      .from("evt_mlg_mth_snap")
      .select("base_dt")
      .eq("prt_id", prt.prt_id)
      .order("base_dt", { ascending: true });
    const have = (months ?? []).map((m) => (m.base_dt as string).slice(0, 7));
    throw new ToolInputError(
      have.length
        ? `${baseDt.slice(0, 7)} 의 목표가 없습니다. 목표가 있는 달: ${have.join(", ")}`
        : `${prt.evt_nm} 에 아직 월별 목표가 만들어지지 않았습니다. 운영진에게 문의해 주세요.`,
    );
  }
  return toMileageRow(data, prt.evt_nm);
}

function toMileageRow(
  snap: {
    base_dt: string;
    goal_mlg: number;
    achv_mlg: number;
    achv_yn: boolean;
    act_cnt: number;
    lst_act_dt: string | null;
  },
  evtNm: string,
): MyMileageRow {
  const goal = Number(snap.goal_mlg);
  const achv = Number(snap.achv_mlg);
  return {
    month: snap.base_dt.slice(0, 7),
    evt_nm: evtNm,
    goal_mlg: goal,
    achv_mlg: achv,
    // 판정은 앱과 같은 함수로 — 199.96 을 200 목표의 달성으로 보는 반올림 규약이 여기 들어 있다.
    achv_yn: isMonthAchieved(achv, goal),
    remaining_mlg: isMonthAchieved(achv, goal) ? 0 : roundMileage(goal - achv),
    act_cnt: Number(snap.act_cnt),
    lst_act_dt: snap.lst_act_dt ?? null,
  };
}

/** §6 배율 목록 — 계산 근거 확인용. */
export async function listMileageMultipliers(
  db: Db,
  ctx: OperatorContext,
  params: { active_only?: boolean } = {},
): Promise<{ evt_nm: string; multipliers: MultiplierRow[] }> {
  const prt = await resolveMyParticipation(db, ctx);
  const today = todayKST();

  const { data, error } = await db
    .from("evt_mlg_mult_cfg")
    .select("mult_id, mult_nm, mult_val, stt_dt, end_dt, active_yn")
    .eq("evt_id", prt.evt_id)
    .order("stt_dt", { ascending: false, nullsFirst: false });
  if (error) throw error;

  const rows: MultiplierRow[] = (data ?? []).map((m) => {
    const sttDt = (m.stt_dt as string | null) ?? null;
    const endDt = (m.end_dt as string | null) ?? null;
    return {
      mult_id: m.mult_id as string,
      mult_nm: m.mult_nm as string,
      mult_val: Number(m.mult_val),
      stt_dt: sttDt,
      end_dt: endDt,
      active_yn: !!m.active_yn,
      in_effect_today:
        !!m.active_yn && (!sttDt || today >= sttDt) && (!endDt || today <= endDt),
    };
  });

  return {
    evt_nm: prt.evt_nm,
    multipliers: params.active_only ? rows.filter((r) => r.in_effect_today) : rows,
  };
}

export type LogActivityIn = {
  act_dt: string;
  sport: string;
  distance_km: number;
  elevation_m?: number | null;
  review?: string | null;
};

/**
 * 입력 1건을 앱 폼과 **같은 스키마**로 검증하고, 그날 걸려 있던 배율을 자동으로 채운다.
 * 배율 id 를 도구 인자로 받지 않는 이유: 대화에서 uuid 를 부를 일이 없다(#497).
 */
async function normalizeOne(
  db: Db,
  evtId: string,
  isAdmin: boolean,
  input: LogActivityIn,
): Promise<{
  actDt: string;
  sport: MileageSport;
  distanceKm: number;
  elevationM: number;
  review: string | null;
  appliedMults: AppliedMult[];
  baseMlg: number;
  finalMlg: number;
}> {
  // 사진 없는 본체 스키마 — 앱 폼과 같은 수치·날짜·후기 규칙을 쓰되, 사진 URL 검증
  // (Supabase 공개 환경변수를 물고 있다)은 이 경로에 필요가 없어 붙이지 않는다.
  const parsed = activityLogBaseSchema.safeParse({
    act_dt: input.act_dt,
    sprt_enm: input.sport,
    distance_km: input.distance_km,
    elevation_m: input.elevation_m ?? 0,
    applied_mult_ids: [],
    review: input.review ?? null,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ToolInputError(`${first.path.join(".") || "입력"}: ${first.message}`);
  }
  const v = parsed.data;

  const dateErr = validateActivityDate(v.act_dt, isAdmin);
  if (dateErr) throw new ToolInputError(dateErr);

  const autoIds = await autoMultiplierIdsFor(db, evtId, v.act_dt);
  const { appliedMults, multValues, error: multErr } = await buildAppliedMults(
    db,
    evtId,
    autoIds,
    v.act_dt,
  );
  if (multErr) throw new ToolInputError(multErr);

  const baseMlg = roundMileage(
    calcBaseMileage(v.sprt_enm, v.distance_km, v.elevation_m),
  );
  return {
    actDt: v.act_dt,
    sport: v.sprt_enm,
    distanceKm: v.distance_km,
    elevationM: v.elevation_m,
    review: v.review?.trim() || null,
    appliedMults,
    baseMlg,
    finalMlg: roundMileage(calcFinalMileage(baseMlg, multValues)),
  };
}

/** 팀 멤버 정본 행 — 칭호 평가에 필요한 team_mem_id 를 얻는다. */
async function fetchTeamMemRow(
  db: Db,
  ctx: OperatorContext,
): Promise<{ team_mem_id: string; team_id: string } | null> {
  const { data } = await db
    .from("team_mem_rel")
    .select("team_mem_id, team_id")
    .eq("mem_id", ctx.mem_id)
    .eq("team_id", ctx.team_id)
    .eq("vers", 0)
    .eq("del_yn", false)
    .maybeSingle();
  return data
    ? { team_mem_id: data.team_mem_id as string, team_id: data.team_id as string }
    : null;
}

/**
 * §3·§4 내 활동 기록 등록(1건 또는 다건).
 *
 * 검증을 **전부 먼저** 돌리고 나서 저장한다 — 3번째 기록의 거리가 비었을 때 앞의 둘만
 * 저장돼 반쯤 들어간 상태로 남지 않게(앱 다건 폼과 같은 순서).
 */
export async function logMyActivities(
  db: Db,
  ctx: OperatorContext,
  inputs: LogActivityIn[],
): Promise<LogActivityResult> {
  if (inputs.length === 0) {
    throw new ToolInputError("최소 1건 이상 입력해 주세요.");
  }
  if (inputs.length > MAX_BATCH_ACTIVITIES) {
    throw new ToolInputError(
      `한 번에 최대 ${MAX_BATCH_ACTIVITIES}건까지 등록할 수 있습니다. 받은 건수: ${inputs.length}`,
    );
  }

  const prt = await resolveMyParticipation(db, ctx);

  // 1) 검증·계산 먼저(쓰기 없음).
  const normalized = [];
  for (const input of inputs) {
    normalized.push(await normalizeOne(db, prt.evt_id, ctx.is_admin, input));
  }

  // 2) 저장 직전 달성 여부 — 칭호 엔진이 "이번에 처음 달성했는가"를 판정하는 재료다.
  const months = Array.from(new Set(normalized.map((n) => n.actDt.slice(0, 7) + "-01")));
  const prevAchvByMonth = new Map<string, boolean>();
  for (const month of months) {
    const { data } = await db
      .from("evt_mlg_mth_snap")
      .select("achv_yn")
      .eq("prt_id", prt.prt_id)
      .eq("base_dt", month)
      .maybeSingle();
    prevAchvByMonth.set(month, data?.achv_yn ?? false);
  }

  // 3) 저장.
  const { data: inserted, error } = await db
    .from("evt_mlg_act_hist")
    .insert(
      normalized.map((n) => ({
        prt_id: prt.prt_id,
        act_dt: n.actDt,
        sprt_enm: n.sport,
        dst_km: n.distanceKm,
        elv_m: n.elevationM,
        base_mlg: n.baseMlg,
        aply_mults: n.appliedMults,
        final_mlg: n.finalMlg,
        review: n.review,
        photo_url: null,
      })),
    )
    .select("act_id, act_dt");
  if (error) throw new ToolInputError("활동 기록 추가에 실패했습니다.");

  await recalcGoalsFromMonth(db, prt.evt_id, prt.prt_id);

  const teamMemRow = await fetchTeamMemRow(db, ctx);
  const seeds: TitleEvalSeed[] = teamMemRow
    ? months.map((month) => ({
        teamId: teamMemRow.team_id,
        teamMemId: teamMemRow.team_mem_id,
        projectId: prt.evt_id,
        actDt: month.slice(0, 8) + "01",
        prevAchvYn: prevAchvByMonth.get(month) ?? false,
      }))
    : [];

  const insertedIds = (inserted ?? []) as { act_id: string; act_dt: string }[];
  return {
    saved_cnt: normalized.length,
    activities: normalized.map((n, i) => ({
      act_id: insertedIds[i]?.act_id ?? "",
      act_dt: n.actDt,
      sport_label: MILEAGE_SPORT_LABELS[n.sport] ?? n.sport,
      distance_km: n.distanceKm,
      elevation_m: n.elevationM,
      base_mlg: n.baseMlg,
      applied_mults: n.appliedMults.map((m) => ({
        mult_nm: m.mult_nm,
        mult_val: m.mult_val,
      })),
      final_mlg: n.finalMlg,
    })),
    month_after: await safeMonthAfter(db, prt, normalized[0].actDt),
    notice: NO_PHOTO_NOTICE,
    title_eval_seeds: seeds,
  };
}

/** 저장 후 그 달 현황. 목표 행이 없으면(참가 시작 전 달) 조용히 생략한다. */
async function safeMonthAfter(
  db: Db,
  prt: MyParticipation,
  actDt: string,
): Promise<MyMileageRow | null> {
  const { data } = await db
    .from("evt_mlg_mth_snap")
    .select("base_dt, goal_mlg, achv_mlg, achv_yn, act_cnt, lst_act_dt")
    .eq("prt_id", prt.prt_id)
    .eq("base_dt", actDt.slice(0, 7) + "-01")
    .maybeSingle();
  return data ? toMileageRow(data, prt.evt_nm) : null;
}

/**
 * §5 내 기록 수정. **본인 기록만** — admin 우회 없음.
 * 사진이 붙어 있던 기록은 사진을 그대로 둔다(MCP 는 사진을 만들지도 지우지도 않는다).
 */
export async function updateMyActivity(
  db: Db,
  ctx: OperatorContext,
  actId: string,
  input: LogActivityIn,
): Promise<{ act_id: string; before: MyActivityRow; after: MyActivityRow; month_after: MyMileageRow | null }> {
  const prt = await resolveMyParticipation(db, ctx);
  const existing = await fetchOwnActivity(db, prt.prt_id, actId);

  const n = await normalizeOne(db, prt.evt_id, ctx.is_admin, input);

  const { error } = await db
    .from("evt_mlg_act_hist")
    .update({
      act_dt: n.actDt,
      sprt_enm: n.sport,
      dst_km: n.distanceKm,
      elv_m: n.elevationM,
      base_mlg: n.baseMlg,
      aply_mults: n.appliedMults,
      final_mlg: n.finalMlg,
      review: n.review,
      updated_at: dayjs().toISOString(),
    })
    .eq("act_id", actId)
    // prt_id 를 조건에 한 번 더 건다 — 위 소유 확인과 이 UPDATE 사이를 코드가 아니라
    // 쿼리로도 막아 둔다(남의 act_id 로 도달할 경로를 두 겹으로 닫는다).
    .eq("prt_id", prt.prt_id);
  if (error) throw new ToolInputError("활동 기록 수정에 실패했습니다.");

  await recalcGoalsFromMonth(db, prt.evt_id, prt.prt_id);

  return {
    act_id: actId,
    before: existing,
    after: {
      ...existing,
      act_dt: n.actDt,
      sport: n.sport,
      sport_label: MILEAGE_SPORT_LABELS[n.sport] ?? n.sport,
      distance_km: n.distanceKm,
      elevation_m: n.elevationM,
      base_mlg: n.baseMlg,
      applied_mults: n.appliedMults.map((m) => ({
        mult_nm: m.mult_nm,
        mult_val: m.mult_val,
      })),
      final_mlg: n.finalMlg,
      review: n.review,
    },
    month_after: await safeMonthAfter(db, prt, n.actDt),
  };
}

/** §5 내 기록 삭제. **본인 기록만** — admin 우회 없음. */
export async function deleteMyActivity(
  db: Db,
  ctx: OperatorContext,
  actId: string,
): Promise<{ deleted: MyActivityRow; month_after: MyMileageRow | null }> {
  const prt = await resolveMyParticipation(db, ctx);
  const existing = await fetchOwnActivity(db, prt.prt_id, actId);

  const dateErr = validateActivityDate(existing.act_dt, ctx.is_admin);
  if (dateErr) throw new ToolInputError(dateErr);

  if (existing.has_photo) {
    // 사진 파일 정리는 앱 액션의 몫이다(Storage 접근·트리거 연동이 거기 있다).
    // 여기서 행만 지우면 파일이 고아로 남으므로 앱으로 보낸다.
    throw new ToolInputError(
      "사진이 붙은 기록은 앱(프로젝트탭)에서 삭제해 주세요. 사진 파일까지 함께 정리해야 합니다.",
    );
  }

  const { error } = await db
    .from("evt_mlg_act_hist")
    .delete()
    .eq("act_id", actId)
    .eq("prt_id", prt.prt_id);
  if (error) throw new ToolInputError("활동 기록 삭제에 실패했습니다.");

  await recalcGoalsFromMonth(db, prt.evt_id, prt.prt_id);

  return { deleted: existing, month_after: await safeMonthAfter(db, prt, existing.act_dt) };
}

/**
 * 내 기록 1건을 가져온다. **`prt_id` 로 스코프**하므로 남의 `act_id` 는 "찾을 수 없음"이 된다 —
 * 존재 여부조차 알려주지 않는다(남의 기록이 있다/없다도 정보다).
 */
async function fetchOwnActivity(
  db: Db,
  prtId: string,
  actId: string,
): Promise<MyActivityRow> {
  const { data, error } = await db
    .from("evt_mlg_act_hist")
    .select(
      "act_id, act_dt, sprt_enm, dst_km, elv_m, base_mlg, aply_mults, final_mlg, review, photo_url",
    )
    .eq("act_id", actId)
    .eq("prt_id", prtId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ToolInputError("내 기록 중에 해당 act_id 가 없습니다.");

  const sport = data.sprt_enm as MileageSport;
  return {
    act_id: data.act_id as string,
    act_dt: data.act_dt as string,
    sport,
    sport_label: MILEAGE_SPORT_LABELS[sport] ?? sport,
    distance_km: Number(data.dst_km),
    elevation_m: Number(data.elv_m ?? 0),
    base_mlg: Number(data.base_mlg),
    applied_mults: toDisplayMults(data.aply_mults),
    final_mlg: Number(data.final_mlg),
    review: (data.review as string | null) ?? null,
    has_photo: !!data.photo_url,
  };
}
