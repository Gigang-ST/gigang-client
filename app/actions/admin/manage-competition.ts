"use server";

import { revalidateTag } from "next/cache";

import { withActive, withAdmin } from "@/lib/actions/auth";
import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { getCachedCmmCdRows, isValidCompSprtCd } from "@/lib/queries/cmm-cd-cached";
import { getRequestTeamContext } from "@/lib/queries/request-team";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ⚠️ **이 파일이 전부 관리자 전용은 아니다.** 디렉터리 이름(`admin/`)에 속지 말 것 —
 * `updateCompetition`은 **만든 사람 본인 또는 관리자**이고, 나머지 둘만 관리자 전용이다.
 * 권한은 각 함수의 `withAdmin`/`withActive`를 보고 판단한다.
 * (수정을 `app/actions/competition/`으로 떼는 게 맞지만, 유일한 호출처인 관리자 페이지가
 *  기존 lint 에러를 안고 있어 import를 건드리면 커밋이 막힌다 — 그 정리와 함께 옮긴다.)
 *
 * **대회 삭제를 안 여는 이유**: 하드 delete인 데다 그 팀의 참가등록(`comp_reg_rel`)까지
 * 함께 지운다 — 남이 신청해 둔 걸 날리는 동작이라 되돌릴 수 없다. 잘못 만든 대회는
 * 고쳐 쓰면 된다.
 */
export async function deleteCompetition(competitionId: string) {
  return withAdmin(async () => {
    const { teamId } = await getRequestTeamContext();
    const db = createAdminClient();

    const { data: plans } = await db
      .from("team_comp_plan_rel")
      .select("team_comp_id")
      .eq("comp_id", competitionId)
      .eq("team_id", teamId)
      .eq("vers", 0)
      .eq("del_yn", false);

    if (plans && plans.length > 0) {
      const { error: regErr } = await db
        .from("comp_reg_rel")
        .delete()
        .in("team_comp_id", plans.map((p) => p.team_comp_id));
      if (regErr) return { ok: false, message: "삭제에 실패했습니다" };

      const { error: planErr } = await db
        .from("team_comp_plan_rel")
        .delete()
        .in("team_comp_id", plans.map((p) => p.team_comp_id));
      if (planErr) return { ok: false, message: "삭제에 실패했습니다" };
    }

    const { data: remainingPlans, error: remainErr } = await db
      .from("team_comp_plan_rel")
      .select("team_comp_id")
      .eq("comp_id", competitionId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .limit(1);
    if (remainErr) return { ok: false, message: "삭제에 실패했습니다" };

    if (!remainingPlans || remainingPlans.length === 0) {
      const { error } = await db.from("comp_mst").delete().eq("comp_id", competitionId);
      if (error) return { ok: false, message: "삭제에 실패했습니다" };
    }

    revalidateTag("competitions", "max");
    return { ok: true, message: null };
  });
}

/**
 * 대회 정보 수정 — **만든 사람 본인 또는 관리자**(이 파일에서 유일하게 관리자 전용이 아니다).
 *
 * 대회 등록(`createCompetition`)이 이미 활성 회원 전원에게 열려 있는데 수정만 관리자
 * 전용이면, 날짜를 잘못 넣은 사람이 **자기가 만든 대회조차** 못 고치고 운영진에게 부탁해야
 * 했다. 그래서 `comp_mst.crt_by`를 도입해 본인 것은 본인이 고치게 열었다.
 *
 * `crt_by`가 비어 있으면(외부 수집분 · 컬럼 도입 이전 등록분) **관리자만** 고칠 수 있다.
 * 이건 부작용이 아니라 원하는 동작이다 — 크롤링으로 들어온 원본 대회를 아무나 고치면
 * 다음 수집과 어긋난다.
 */
export async function updateCompetition(
  competitionId: string,
  input: {
    title: string;
    sport: string;
    startDate: string;
    endDate: string | null;
    location: string;
    eventTypes: string[];
    sourceUrl: string;
  },
) {
  return withActive(async ({ member }) => {
    const cmmRows = await getCachedCmmCdRows();
    if (!isValidCompSprtCd(cmmRows, input.sport.trim())) {
      return { ok: false, message: "유효하지 않은 종목입니다." };
    }

    // ⚠️ 종목 검증은 **아래 comp_evt_cfg를 지우기 전에** 끝낸다. 예전엔 delete 뒤에 있어서
    //    한글 종목을 넣으면 "수정 실패" 메시지와 함께 **기존 종목이 이미 지워진 채로** 남았다.
    //    관리자만 밟던 길이라 드물었지만, 수정이 작성자에게 열린 지금은 실제로 터진다.
    const nextTypes = (input.eventTypes ?? [])
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);

    if (nextTypes.some((t) => compEvtTypeContainsHangul(t))) {
      return {
        ok: false,
        message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요.",
      };
    }

    const db = createAdminClient();

    // 권한 판정 — UI가 버튼을 감추는 건 안내일 뿐이라 서버가 다시 본다.
    // `createAdminClient()`는 RLS를 우회하므로 이 검사가 유일한 관문이다.
    const { data: current } = await db
      .from("comp_mst")
      .select("crt_by")
      .eq("comp_id", competitionId)
      .eq("vers", 0)
      .eq("del_yn", false)
      .maybeSingle();

    if (!current) return { ok: false, message: "대회를 찾을 수 없습니다." };

    if (!member.admin && current.crt_by !== member.id) {
      return {
        ok: false,
        message: current.crt_by
          ? "직접 등록한 대회만 수정할 수 있어요. 운영진에게 문의해 주세요."
          : "이 대회는 운영진만 수정할 수 있어요.",
      };
    }

    const { error: compErr } = await db
      .from("comp_mst")
      .update({
        comp_nm: input.title.trim(),
        comp_sprt_cd: input.sport.trim(),
        stt_dt: input.startDate,
        end_dt: input.endDate || null,
        loc_nm: input.location.trim() || null,
        src_url: input.sourceUrl.trim() || null,
      })
      .eq("comp_id", competitionId);

    if (compErr) return { ok: false, message: "수정에 실패했습니다" };

    // 종목 목록은 diff로 반영한다 — 안 바뀐 종목의 comp_evt_id는 그대로 둔다.
    // ⚠️ 예전엔 전량 delete 후 insert했는데, comp_reg_rel.comp_evt_id가 이 id를 FK로
    //    참조한다(ON DELETE SET NULL). 종목 문자열이 그대로여도 delete+insert는 새
    //    comp_evt_id를 만들어 옛 id가 사라지므로, 이미 그 종목으로 등록한 참가자 전원의
    //    comp_evt_id가 NULL로 날아갔다 — 대회 정보를 아무거나(날짜 등) 고치기만 해도 발생했다.
    const { data: existingTypes, error: existingErr } = await db
      .from("comp_evt_cfg")
      .select("comp_evt_id, comp_evt_type")
      .eq("comp_id", competitionId)
      .eq("vers", 0)
      .eq("del_yn", false);
    if (existingErr) return { ok: false, message: "수정에 실패했습니다" };

    const existingByType = new Map(
      (existingTypes ?? []).map((row) => [row.comp_evt_type, row.comp_evt_id]),
    );
    const nextTypeSet = new Set(nextTypes);
    const toRemove = (existingTypes ?? []).filter((row) => !nextTypeSet.has(row.comp_evt_type));
    const toAdd = nextTypes.filter((t) => !existingByType.has(t));

    if (toRemove.length > 0) {
      const { error: delErr } = await db
        .from("comp_evt_cfg")
        .delete()
        .in(
          "comp_evt_id",
          toRemove.map((row) => row.comp_evt_id),
        );
      if (delErr) return { ok: false, message: "수정에 실패했습니다" };
    }

    if (toAdd.length > 0) {
      const { error: insErr } = await db.from("comp_evt_cfg").insert(
        toAdd.map((t) => ({
          comp_id: competitionId,
          comp_evt_type: t,
          vers: 0,
          del_yn: false,
        })),
      );
      if (insErr) return { ok: false, message: "수정에 실패했습니다" };
    }

    revalidateTag("competitions", "max");
    return { ok: true, message: null };
  });
}

export async function deleteRegistration(registrationId: string) {
  return withAdmin(async () => {
    const db = createAdminClient();
    const { error } = await db.from("comp_reg_rel").delete().eq("comp_reg_id", registrationId);
    if (error) return { ok: false, message: "삭제에 실패했습니다" };
    revalidateTag("competitions", "max");
    return { ok: true, message: null };
  });
}
