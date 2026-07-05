import { revalidatePath } from "next/cache";
import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { COMMON_CODES_CACHE_TAG } from "@/lib/common-codes-cache-tag";
import { env } from "@/lib/env";
import { HOME_CALENDAR_CACHE_TAG } from "@/lib/queries/home-calendar";

/** 홈 캘린더 데이터에 반영되는 테이블 (모임·참석·일정포스트·댓글 카운트) */
const HOME_TABLES = new Set(["gthr_mst", "gthr_attd_rel", "sch_post_mst", "cmnt_mst"]);
/** 대회 목록·등록 카운트에 반영되는 테이블 (홈 캘린더에도 대회가 표시되므로 함께 무효화) */
const COMP_TABLES = new Set(["comp_mst", "team_comp_plan_rel", "comp_reg_rel"]);
/** 랭킹(/records)에 반영되는 테이블 */
const RECORDS_TABLES = new Set(["personal_best", "utmb_profile"]);

function revalidateHomeCalendar() {
  revalidatePath("/");
  revalidateTag(HOME_CALENDAR_CACHE_TAG, "max");
}

function revalidateCompetitions() {
  revalidateTag("competitions", "max");
  // 대회는 홈 캘린더에도 표시됨 (reg_count 포함)
  revalidateHomeCalendar();
}

function revalidateRecords() {
  revalidatePath("/records");
  // /records 의 unstable_cache(tags: "records", `records:${teamId}`)
  revalidateTag("records", "max");
}

/** 테이블 정보가 없거나 매핑에 없는 테이블 → 기존 동작대로 전체 무효화 (하위호환 폴백) */
function revalidateAll() {
  revalidateHomeCalendar();
  revalidateCompetitions();
  revalidateRecords();
  revalidateTag(COMMON_CODES_CACHE_TAG, "max");
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");

  if (secret !== env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DB 트리거(revalidate_records)가 body에 변경 테이블명을 실어 보냄
  let table: string | null = null;
  try {
    const payload = await request.json();
    if (typeof payload?.table === "string") table = payload.table;
  } catch {
    // body가 비었거나 JSON이 아니면 전체 무효화 폴백
  }

  if (table === null) {
    revalidateAll();
  } else if (HOME_TABLES.has(table)) {
    revalidateHomeCalendar();
  } else if (COMP_TABLES.has(table)) {
    revalidateCompetitions();
  } else if (RECORDS_TABLES.has(table)) {
    revalidateRecords();
  } else if (table === "cmm_cd_mst") {
    revalidateTag(COMMON_CODES_CACHE_TAG, "max");
  } else {
    revalidateAll();
  }

  return NextResponse.json({ revalidated: true, table });
}
