"use server";

import { revalidateTag } from "next/cache";

import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { todayKST } from "@/lib/dayjs";
import { getCachedCmmCdRows, isValidCompSprtCd } from "@/lib/queries/cmm-cd-cached";
import { withActive } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreateCompetitionInput {
  title: string;
  sport: string;
  startDate: string;
  endDate: string | null;
  location: string;
  eventTypes: string[];
  sourceUrl: string;
  datePolicy?: "future-only" | "allow-past";
}

export async function createCompetition(input: CreateCompetitionInput) {
  return withActive(async ({ member }) => {
    const cmmRows = await getCachedCmmCdRows();
    if (!isValidCompSprtCd(cmmRows, input.sport.trim())) return { ok: false, message: "유효하지 않은 종목입니다." };

    const datePolicy = input.datePolicy ?? "future-only";
    if (datePolicy === "future-only" && input.startDate < todayKST()) {
      return { ok: false, message: "지난 대회는 기록 입력에서 추가해 주세요." };
    }

    // ⚠️ 종목 검증·정규화는 **comp_mst를 만들기 전에** 끝낸다. 예전엔 insert 뒤에 있어서
    //    한글 종목을 넣으면 대회 행은 이미 만들어진 채로 에러만 돌아왔다 — 아래 insert 실패
    //    경로와 달리 되돌리는 처리도 없어 **종목 없는 빈 대회가 영구히 남았다.**
    const eventTypes = (input.eventTypes ?? [])
      .map((evt) => evt.trim().toUpperCase())
      .filter((evt) => evt.length > 0);

    if (eventTypes.some((evt) => compEvtTypeContainsHangul(evt))) {
      return { ok: false, message: "종목은 한글을 사용할 수 없습니다. 영문·숫자로 입력해 주세요." };
    }

    const admin = createAdminClient();
    const { data: comp, error: compErr } = await admin
      .from("comp_mst")
      .insert({
        ext_id: `manual:${crypto.randomUUID()}`, comp_sprt_cd: input.sport,
        comp_nm: input.title.trim(), stt_dt: input.startDate, end_dt: input.endDate || null,
        loc_nm: input.location.trim() || null, src_url: input.sourceUrl.trim() || null,
        // 만든 사람 — 나중에 본인이 고칠 수 있는 유일한 근거다(§updateCompetition).
        // 여기서 안 적으면 그 대회는 영영 관리자만 고칠 수 있다.
        crt_by: member.id,
        vers: 0, del_yn: false,
      })
      // short_id는 DB가 만들어 주므로 되받아야 한다 — 아래 반환값이 곧바로 상세 다이얼로그로
      // 들어가고, 거기서 공유 링크와 수정 버튼 노출에 둘 다 쓰인다.
      .select("comp_id, short_id, crt_by")
      .single();

    if (compErr || !comp) {
      console.error("대회 등록 실패(comp_mst):", compErr?.code, compErr?.message, compErr?.details);
      return { ok: false, message: "등록에 실패했습니다. 다시 시도해 주세요." };
    }

    if (eventTypes.length > 0) {
      const eventRows = eventTypes.map((evt) => ({
        comp_id: comp.comp_id, comp_evt_type: evt, vers: 0, del_yn: false,
      }));
      const { error: evtErr } = await admin.from("comp_evt_cfg").insert(eventRows);
      if (evtErr) {
        console.error("대회 등록 실패(comp_evt_cfg):", evtErr);
        await admin.from("comp_mst").delete().eq("comp_id", comp.comp_id);
        return { ok: false, message: "등록에 실패했습니다. 다시 시도해 주세요." };
      }
    }

    revalidateTag("competitions", "max");
    return {
      ok: true, message: null,
      competition: {
        id: comp.comp_id,
        // ⚠️ 이 객체는 곧바로 상세 다이얼로그로 들어간다(mini-calendar의 handleCompetitionCreated가
        //    받자마자 연다). 그래서 둘 다 실어야 한다:
        //    - crt_by 없으면 **방금 만든 사람이 자기 대회의 수정 버튼을 못 본다** — 날짜 오타를
        //      알아채는 바로 그 순간이라 이게 빠지면 이 기능의 핵심 동선이 끊긴다
        //    - short_id 없으면 그 화면의 공유 링크가 uuid로 나간다
        short_id: comp.short_id ?? null,
        crt_by: comp.crt_by ?? null,
        external_id: `manual:${comp.comp_id}`, sport: input.sport,
        title: input.title.trim(), start_date: input.startDate, end_date: input.endDate ?? null,
        location: input.location.trim() || null, event_types: eventTypes,
        source_url: input.sourceUrl.trim() || null,
      },
    };
  });
}
