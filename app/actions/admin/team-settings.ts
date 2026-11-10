"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { withAdmin } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createUntypedAdminClient } from "@/lib/supabase/admin";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import { invalidateTeamCfgCache } from "@/lib/team-cfg/read";
import { isTeamCfgCd, TEAM_CFG_REGISTRY, type TeamCfgCd } from "@/lib/team-cfg/registry";

type Result = { ok: true; message: null } | { ok: false; message: string };

const OWNER_ONLY_MESSAGE = "이 설정은 팀 owner만 바꿀 수 있어요.";

/**
 * owner 만 바꾸는 설정(계좌·카톡방)이 바뀌면 그 팀 owner·관리자에게 알린다 — 바꾼 사람은 빼고.
 * 관리자 누구나 바꾸던 시절엔 계좌가 바뀌어도 아무도 몰랐다. 응답 밖에서(실패해도 저장은 그대로).
 */
function notifySensitiveChange(teamId: string, cd: TeamCfgCd, actor: { id: string; full_name: string }, what: string) {
  after(async () => {
    try {
      const db = createUntypedAdminClient();
      const { data } = await db
        .from("team_mem_rel")
        .select("mem_id")
        .eq("team_id", teamId)
        .in("team_role_cd", ["admin", "owner"])
        .eq("mem_st_cd", "active")
        .eq("vers", 0)
        .eq("del_yn", false);
      const memIds = ((data ?? []) as { mem_id: string }[]).map((r) => r.mem_id).filter((id) => id !== actor.id);
      if (memIds.length === 0) return;
      await insertNotiMany({
        teamId,
        memIds,
        notiTypeEnm: "team_cfg_chg",
        notiNm: "팀 설정이 바뀌었어요",
        notiCont: `${actor.full_name}님이 「${TEAM_CFG_REGISTRY[cd].label}」을(를) ${what}`,
      });
    } catch (e) {
      console.error("[team-settings] 변경 알림 실패", cd, e);
    }
  });
}

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
/**
 * 화면에 안 올리는 키(`hidden` — 다른 팀 가입 안내 등)는 **저장·되돌리기도 막는다**. 화면엔 없어도 서버 액션은
 * 화면과 별개로 열려 있어, 관리자가 직접 부르면 바뀌었다(PR #649 리뷰). 이런 키는 코드·마이그레이션으로만 바꾼다.
 */
const HIDDEN_MESSAGE = "이 설정은 화면에서 바꾸지 않아요(코드·마이그레이션으로 관리)";

export async function saveTeamSetting(cd: string, value: unknown): Promise<Result> {
  return withAdmin(async ({ member }) => {
    if (!isTeamCfgCd(cd)) return { ok: false, message: "알 수 없는 설정입니다" };
    const def = TEAM_CFG_REGISTRY[cd] as { ownerOnly?: boolean; hidden?: boolean };
    if (def.hidden) return { ok: false, message: HIDDEN_MESSAGE };
    if (def.ownerOnly && !member.owner) return { ok: false, message: OWNER_ONLY_MESSAGE };
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

    const patch = { cfg_val_json: parsed.data, del_yn: false, upd_at: now, upd_by: member.id };
    const updateCurrent = () =>
      db.from("team_cfg").update(patch).eq("team_id", teamId).eq("cfg_cd", cd).eq("vers", 0);
    let { error } = cur
      ? await updateCurrent()
      : await db.from("team_cfg").insert({
          team_id: teamId,
          cfg_cd: cd,
          cfg_val_json: parsed.data,
          crt_by: member.id,
          upd_by: member.id,
        });
    // 첫 저장이 동시에 두 번 오면(두 관리자·두 번 누름) 늦은 쪽 INSERT 가 유니크(team_id, cfg_cd, vers)에 걸린다 —
    // 그 사이 생긴 행을 고친다. upsert 로 바꾸지 않은 건 처음 만든 사람(crt_by)까지 덮어쓰게 돼서다.
    if (error?.code === "23505") ({ error } = await updateCurrent());
    if (error) {
      console.error("[team-settings] 저장 실패", cd, error.message);
      return { ok: false, message: "저장에 실패했습니다" };
    }

    invalidateTeamCfgCache(teamId);
    if (def.ownerOnly) notifySensitiveChange(teamId, cd, member, "바꿨어요");
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
    const def = TEAM_CFG_REGISTRY[cd] as { ownerOnly?: boolean; hidden?: boolean };
    if (def.hidden) return { ok: false, message: HIDDEN_MESSAGE };
    if (def.ownerOnly && !member.owner) return { ok: false, message: OWNER_ONLY_MESSAGE };
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
    if (def.ownerOnly) notifySensitiveChange(teamId, cd, member, "지웠어요");
    revalidatePath("/admin/team-settings");
    return { ok: true, message: null };
  });
}
