import type { SupabaseClient } from "@supabase/supabase-js";

import { compEvtTypeContainsHangul } from "@/lib/comp-evt-type";
import { COMPETITION_COLUMNS, type CompetitionRow } from "@/lib/competition-row";
import { todayKST } from "@/lib/dayjs";
import { hyroxCompetitionIssue } from "@/lib/hyrox";
import { isValidCompSprtCd, type CachedCmmCdRow } from "@/lib/queries/cmm-cd-cached";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 대회 추가 코어 — 서버 액션 `createCompetition`(웹)과 운영 MCP `create_competition` 이 **같이 쓴다**.
 *
 * 검증 순서·문구·insert 컬럼이 두 경로에서 갈라지지 않게 한 곳에 둔다. `next/*` 를 import 하지 않는다
 * (캐시 무효화는 각 경로가 맡는다 — README §7). 공통코드는 호출부가 읽어 넘긴다.
 */

export type CompetitionCreateInput = {
  title: string;
  sport: string;
  startDate: string;
  endDate: string | null;
  location: string;
  eventTypes: string[];
  sourceUrl: string;
  datePolicy?: "future-only" | "allow-past";
};

export type CompetitionCreateCoreResult =
  | { ok: false; message: string }
  | {
      ok: true;
      /** 정규화(대문자·공백 제거)된 종목 */
      eventTypes: string[];
      comp: CompetitionRow;
    };

/** 종목 정규화 + 검증만 한다(저장 없음). 웹·MCP 공용. */
export function validateCompetitionInput(
  input: CompetitionCreateInput,
  cmmRows: readonly CachedCmmCdRow[],
): { ok: false; message: string } | { ok: true; eventTypes: string[] } {
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

  // 하이록스 대회는 종목·코스가 맞아야 전당 판에 잡힌다(#671). 폼 검증과 같은 함수 — 폼을 안 거치는
  // 길(기록 입력의 대회 추가·관리자 화면)도 여기서 막힌다
  const hyroxIssue = hyroxCompetitionIssue({ title: input.title, sport: input.sport, eventTypes });
  if (hyroxIssue) return { ok: false, message: hyroxIssue.message };

  return { ok: true, eventTypes };
}

/**
 * 검증 → `comp_mst` insert → `comp_evt_cfg` insert(실패하면 대회 행을 되돌린다).
 *
 * @param admin service-role 클라이언트
 * @param memberId 만든 사람(`crt_by`) — 나중에 본인이 고칠 수 있는 유일한 근거다
 */
export async function createCompetitionCore(
  admin: SupabaseClient<Database>,
  params: {
    input: CompetitionCreateInput;
    memberId: string;
    cmmRows: readonly CachedCmmCdRow[];
  },
): Promise<CompetitionCreateCoreResult> {
  const { input, memberId, cmmRows } = params;
  const checked = validateCompetitionInput(input, cmmRows);
  if (!checked.ok) return checked;
  const { eventTypes } = checked;

  const { data: comp, error: compErr } = await admin
    .from("comp_mst")
    .insert({
      ext_id: `manual:${crypto.randomUUID()}`, comp_sprt_cd: input.sport,
      comp_nm: input.title.trim(), stt_dt: input.startDate, end_dt: input.endDate || null,
      loc_nm: input.location.trim() || null, src_url: input.sourceUrl.trim() || null,
      // 만든 사람 — 나중에 본인이 고칠 수 있는 유일한 근거다(§updateCompetition).
      // 여기서 안 적으면 그 대회는 영영 관리자만 고칠 수 있다.
      crt_by: memberId,
      vers: 0, del_yn: false,
    })
    // short_id는 DB가 만들어 주므로 되받아야 한다 — 목록과 같은 컬럼을 되받아 같은 변환(toCompetition)을 거친다.
    .select(COMPETITION_COLUMNS)
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

  return {
    ok: true,
    eventTypes,
    comp: { ...comp, comp_evt_types: eventTypes } as CompetitionRow,
  };
}
