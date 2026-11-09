"use server";

import { revalidatePath } from "next/cache";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { invalidateTeamCfgCache } from "@/lib/team-cfg/read";
import { isTeamCfgCd, TEAM_CFG_REGISTRY } from "@/lib/team-cfg/registry";

type Result = { ok: true; message: null } | { ok: false; message: string };

/**
 * 관리자 「팀 설정」 저장 — **접속한 팀의 설정만** 바꾼다(관리자 권한도 접속한 팀 기준).
 *
 * 값은 사전(`lib/team-cfg/registry.ts`)의 같은 형식 검사를 통과해야 저장된다 — 읽을 때 형식이 틀리면
 * 기본값으로 조용히 돌기 때문에, 잘못된 값은 쓸 때 막아야 화면이 "저장됐는데 안 바뀐다"가 되지 않는다.
 *
 * 정본은 `vers=0` 한 행이다. 있으면 고치고(지웠던 행이면 되살리고), 없으면 넣는다. 이전 값은 테이블 트리거
 * (`team_cfg_keep_history`)가 이력 행으로 남긴다. 반영은 최대 1분(다른 서버 인스턴스의 설정 캐시) —
 * 저장한 인스턴스의 캐시는 바로 비운다.
 */
export async function saveTeamSetting(cd: string, value: unknown): Promise<Result> {
  return withAdmin(async ({ member }) => {
    if (!isTeamCfgCd(cd)) return { ok: false, message: "알 수 없는 설정입니다" };
    const parsed = TEAM_CFG_REGISTRY[cd].schema.safeParse(value);
    if (!parsed.success) {
      return { ok: false, message: `형식이 맞지 않아요: ${parsed.error.issues[0]?.message ?? "값을 확인해 주세요"}` };
    }

    const { teamId } = await getRequestTeamContext();
    const db = createUntypedAdminClient();
    const now = dayjs().toISOString();

    const { data: cur, error: curErr } = await db
      .from("team_cfg")
      .select("team_cfg_id")
      .eq("team_id", teamId)
      .eq("cfg_cd", cd)
      .eq("vers", 0)
      .maybeSingle();
    if (curErr) return { ok: false, message: "저장에 실패했습니다" };

    const { error } = cur
      ? await db
          .from("team_cfg")
          .update({ cfg_val_json: parsed.data, del_yn: false, upd_at: now, upd_by: member.id })
          .eq("team_cfg_id", (cur as { team_cfg_id: string }).team_cfg_id)
      : await db.from("team_cfg").insert({
          team_id: teamId,
          cfg_cd: cd,
          cfg_val_json: parsed.data,
          crt_by: member.id,
          upd_by: member.id,
        });
    if (error) {
      console.error("[team-settings] 저장 실패", cd, error.message);
      return { ok: false, message: "저장에 실패했습니다" };
    }

    invalidateTeamCfgCache(teamId);
    revalidatePath("/admin/team-settings");
    return { ok: true, message: null };
  });
}

/**
 * 이 팀이 정한 값을 지운다 — 사전의 기본값으로 돌아간다(기본값이 "없음"인 키는 화면에서 사라진다).
 * 행을 지우지 않고 `del_yn` 으로 내린다(이력은 트리거가 남긴다).
 */
export async function resetTeamSetting(cd: string): Promise<Result> {
  return withAdmin(async ({ member }) => {
    if (!isTeamCfgCd(cd)) return { ok: false, message: "알 수 없는 설정입니다" };
    const { teamId } = await getRequestTeamContext();
    const db = createUntypedAdminClient();

    const { error } = await db
      .from("team_cfg")
      .update({ del_yn: true, upd_at: dayjs().toISOString(), upd_by: member.id })
      .eq("team_id", teamId)
      .eq("cfg_cd", cd)
      .eq("vers", 0)
      .eq("del_yn", false);
    if (error) {
      console.error("[team-settings] 되돌리기 실패", cd, error.message);
      return { ok: false, message: "되돌리기에 실패했습니다" };
    }

    invalidateTeamCfgCache(teamId);
    revalidatePath("/admin/team-settings");
    return { ok: true, message: null };
  });
}
