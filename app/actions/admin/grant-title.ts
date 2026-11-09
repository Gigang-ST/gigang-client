"use server";

import { after } from "next/server";

import { withAdmin } from "@/lib/actions/auth";
import { isTeamMemIdInTeam } from "@/lib/actions/team-scope";
import { insertNoti } from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 관리자 수동 수여. 팀은 **서버가 접속 주소로 정한다** — 예전엔 브라우저가 teamId 를 넘겼고,
 * 울산 관리자가 기강 teamId·기강 회원을 넘기면 기강 칭호를 기강 회원에게 줄 수 있었다.
 */
export async function grantTitle(teamMemId: string, ttlId: string) {
  return withAdmin(async ({ member }) => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    if (!(await isTeamMemIdInTeam(db, teamId, teamMemId))) {
      return { ok: false as const, message: "회원을 찾을 수 없습니다." };
    }

    const { data: title } = await db
      .from("ttl_mst")
      .select("ttl_id")
      .eq("ttl_id", ttlId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (!title) return { ok: false as const, message: "칭호를 찾을 수 없습니다." };

    const { data: existing } = await db
      .from("mem_ttl_rel")
      .select("mem_ttl_id")
      .eq("team_mem_id", teamMemId)
      .eq("ttl_id", ttlId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();
    if (existing) return { ok: false as const, message: "이미 보유한 칭호입니다." };

    const { error } = await db.from("mem_ttl_rel").insert({
      team_id: teamId,
      team_mem_id: teamMemId,
      ttl_id: ttlId,
      grnt_by_mem_id: member.id,
      grnt_rsn_txt: "관리자 수동 수여",
      // false로 넣어도 INSERT 직후 트리거가 이 칭호를 대표로 승격한다
      // (`trg_mem_ttl_rel_promote_latest_primary`) — 수여 경로와 무관한 규칙이다.
      is_prmy_yn: false,
      vers: 0,
      del_yn: false,
    });
    if (error) return { ok: false as const, message: "수여에 실패했습니다." };

    // 알림(인앱+푸시)은 응답 후 백그라운드로. after()라 Vercel 함수 종료 시에도 보장됨.
    after(async () => {
      try {
        const [{ data: rel }, { data: ttl }] = await Promise.all([
          db.from("team_mem_rel").select("mem_id").eq("team_mem_id", teamMemId).eq("vers", 0).eq("del_yn", false).single(),
          db.from("ttl_mst").select("ttl_nm").eq("ttl_id", ttlId).single(),
        ]);
        if (!rel?.mem_id) return;
        await insertNoti({
          teamId,
          memId: rel.mem_id,
          notiTypeEnm: "ttl_grnt",
          notiNm: `'${ttl?.ttl_nm ?? "칭호"}' 칭호를 획득했습니다!`,
          refId: ttlId,
          refTypeEnm: "ttl",
        });
      } catch (e) {
        console.error("[ttl_grnt] 알림 발송 실패", e);
      }
    });

    return { ok: true as const, message: null };
  });
}
