import type { SupabaseClient } from "@supabase/supabase-js";

import { toRow } from "@/lib/intervals/core";
import { toSummaryJson } from "@/lib/intervals/summary";
import type { OperatorContext } from "@/lib/mcp/auth";
import { ToolDeniedError, ToolInputError, escapeLikePattern } from "@/lib/mcp/queries";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 기강 운영 MCP — 회원 운동 요약 조회(#760).
 *
 * - **admin 전용.** 회원이 intervals.icu 를 연결하면 「운영진은 날짜·종목·거리·시간·페이스 요약만 본다」에 동의한 것이다.
 * - **요약만**: 날짜·종목·거리·시간·페이스. 심박·경로 상세는 애초에 저장하지 않으므로 줄 수도 없다.
 * - **API 키는 어떤 경로로도 나가지 않는다** — 연결 테이블에서 키 칸(`api_key_enc`)은 select 하지 않는다.
 * - 팀은 토큰 컨텍스트(`ctx.team_id`)로만 정해진다. 다른 팀 회원은 없는 것처럼 답한다.
 */

type Db = SupabaseClient<Database>;
// 연결·활동 테이블은 생성 타입에 아직 없다 — 느슨하게 부른다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = SupabaseClient<any>;

export const WORKOUTS_DEFAULT_LIMIT = 30;
export const WORKOUTS_MAX_LIMIT = 100;

type TeamMember = { mem_id: string; mem_nm: string };

async function resolveTeamMember(
  db: Db,
  teamId: string,
  params: { memberId?: string; name?: string },
): Promise<TeamMember> {
  const { memberId, name } = params;
  if (!memberId && !name) throw new ToolInputError("member_id 또는 name 중 하나는 필요합니다.");

  let memQuery = db.from("mem_mst").select("mem_id, mem_nm").eq("del_yn", false);
  if (memberId) memQuery = memQuery.eq("mem_id", memberId);
  else if (name) memQuery = memQuery.ilike("mem_nm", escapeLikePattern(name));
  const { data: mems, error: memErr } = await memQuery;
  if (memErr) throw memErr;
  const candidates = (mems ?? []) as TeamMember[];
  if (candidates.length === 0) throw new ToolInputError("해당 회원을 찾을 수 없습니다.");

  // 우리 팀 활동 기록이 있는 사람만 — 남의 팀 회원은 없는 것처럼.
  const { data: rels, error: relErr } = await db
    .from("team_mem_rel")
    .select("mem_id")
    .eq("team_id", teamId)
    .eq("vers", 0)
    .eq("del_yn", false)
    .in(
      "mem_id",
      candidates.map((c) => c.mem_id),
    );
  if (relErr) throw relErr;
  const inTeam = new Set(((rels ?? []) as { mem_id: string }[]).map((r) => r.mem_id));
  const matched = candidates.filter((c) => inTeam.has(c.mem_id));
  if (matched.length === 0) throw new ToolInputError("해당 회원을 찾을 수 없습니다.");
  if (matched.length > 1) {
    throw new ToolInputError(
      `같은 이름의 회원이 ${matched.length}명입니다. member_id 로 다시 불러 주세요: ` +
        matched.map((m) => `${m.mem_nm}(${m.mem_id})`).join(", "),
    );
  }
  return matched[0];
}

export async function listMemberWorkouts(
  db: Db,
  ctx: OperatorContext,
  input: { memberId?: string; name?: string; from?: string; to?: string; limit?: number },
) {
  if (!ctx.is_admin) throw new ToolDeniedError();
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? WORKOUTS_DEFAULT_LIMIT), 1), WORKOUTS_MAX_LIMIT);
  const member = await resolveTeamMember(db, ctx.team_id, input);
  const loose = db as unknown as Loose;

  // 키 칸은 읽지 않는다 — 상태·시각만.
  const { data: conn } = await loose
    .from("mem_icu_cnn_rel")
    .select("cnn_stts_cd, last_ok_at")
    .eq("mem_id", member.mem_id)
    .eq("team_id", ctx.team_id)
    .maybeSingle();
  if (!conn) {
    return {
      member_id: member.mem_id,
      member_name: member.mem_nm,
      connected: false,
      count: 0,
      workouts: [],
    };
  }

  let q = loose
    .from("mem_icu_act_hist")
    .select("icu_act_id, act_dt, sprt_type_nm, dst_m, mov_sec, avg_spd_mps")
    .eq("mem_id", member.mem_id)
    .eq("team_id", ctx.team_id);
  if (input.from) q = q.gte("act_dt", input.from);
  if (input.to) q = q.lte("act_dt", input.to);
  const { data, error } = await q
    .order("act_dt", { ascending: false })
    .order("icu_act_id", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const workouts = ((data ?? []) as Record<string, unknown>[]).map((r) => toSummaryJson(toRow(r)));
  return {
    member_id: member.mem_id,
    member_name: member.mem_nm,
    connected: true,
    connection_status: (conn as { cnn_stts_cd: string }).cnn_stts_cd,
    last_synced_at: (conn as { last_ok_at: string | null }).last_ok_at,
    count: workouts.length,
    workouts,
  };
}
