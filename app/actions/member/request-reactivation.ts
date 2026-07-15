"use server";

import { after } from "next/server";

import { withMember } from "@/lib/actions/auth";
import { dayjs } from "@/lib/dayjs";
import { insertNotiMany } from "@/lib/notifications/insert-noti";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 재활성(활동 재개) 문의 — 비활성/탈퇴 회원이 참여를 시도하다 "관리자에게 문의하기"를
 * 누르면 관리자(owner/admin) 전원에게 알림을 보낸다. 알림 클릭 시 회원관리에서 그 회원
 * 상세가 열려(reactivate_req 딥링크 → ?member=team_mem_id) 바로 재활성화할 수 있다.
 *
 * withMember 사용: 비활성 회원은 active 가 아니라 withActive 를 통과 못 하므로, 로그인+가입만
 * 확인하는 withMember 로 게이트한다(이 액션 자체가 "비활성이라 못 하니 풀어달라"는 요청).
 * 이미 active 인 회원이 부르면 무의미하므로 조기 반환한다.
 *
 * 중복 방지: requestDuesCheck 와 동일하게 하루 1회. 관리자 알림 도배를 막는다.
 */
export async function requestReactivation() {
  return withMember(async ({ member }) => {
    if (member.status === "active") {
      return { ok: false as const, message: "이미 활동 중인 회원입니다." };
    }

    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    // refId 로 본인 team_mem_id 를 쓴다 — 관리자 딥링크(?member=team_mem_id)가 그 회원
    // 상세를 열게 하기 위함. member 프로필에 team_mem_id 가 이미 있어 별도 조회 불필요.
    const selfTeamMemId = member.team_mem_id;

    // 관리자(owner/admin) 전원 — 회비 문의는 owner만 보내지만, 재활성은 아무 관리자나
    // 처리할 수 있어야 대응이 빠르다.
    const { data: admins } = await db
      .from("team_mem_rel")
      .select("mem_id")
      .eq("team_id", teamId)
      .in("team_role_cd", ["owner", "admin"])
      .eq("vers", 0)
      .eq("del_yn", false);
    if (!admins?.length) return { ok: false as const, message: "관리자를 찾을 수 없습니다." };

    const adminIds = admins.map((a) => a.mem_id);
    // KST 자정 기준 — 서버(UTC)에서 startOf("day")를 그냥 쓰면 KST 오전 9시가 경계가 돼
    // 하루 1회 중복 방지가 엉뚱한 시각에 초기화된다.
    const todayStart = dayjs().tz("Asia/Seoul").startOf("day").toISOString();

    // 하루 1회 중복 방지 — 관리자 중 한 명에게라도 오늘 이미 보냈으면 스킵.
    const { data: existing } = await db
      .from("noti_mst")
      .select("noti_id")
      .in("mem_id", adminIds)
      .eq("noti_type_enm", "reactivate_req")
      .eq("ref_id", selfTeamMemId)
      .gte("crt_at", todayStart)
      .limit(1)
      .maybeSingle();
    if (existing) {
      // 실패가 아니라 "오늘 이미 접수됨" — 클라이언트가 성공 화면을 그대로 보여주도록 ok:true.
      return { ok: true as const, message: null, alreadySent: true };
    }

    const requesterName = member.full_name;
    const teamMemId = selfTeamMemId;
    after(async () => {
      try {
        await insertNotiMany({
          teamId,
          memIds: adminIds,
          notiTypeEnm: "reactivate_req",
          notiNm: "활동 재개 문의",
          notiCont: `${requesterName}님이 활동 재개(재활성)를 요청하셨습니다.`,
          refId: teamMemId,
          refTypeEnm: "member",
        });
      } catch (e) {
        console.error("[reactivate_req] 알림 발송 실패", e);
      }
    });

    return { ok: true as const, message: null };
  });
}
