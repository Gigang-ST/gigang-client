import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { COMMON_CODES_CACHE_TAG } from "@/lib/common-codes-cache-tag";
import { env } from "@/lib/env";
import { BOARD_POSTS_CACHE_TAG } from "@/lib/queries/board";
import { HOME_CALENDAR_CACHE_TAG } from "@/lib/queries/home-calendar";
import { teamCacheTag } from "@/lib/team-cache-tag";

/** 홈 캘린더 데이터에 반영되는 테이블 (모임·참석·일정포스트·댓글 카운트) */
const HOME_TABLES = new Set(["gthr_mst", "gthr_attd_rel", "sch_post_mst", "cmnt_mst"]);
/** 대회 목록·등록 카운트에 반영되는 테이블 (홈 캘린더에도 대회가 표시되므로 함께 무효화) */
const COMP_TABLES = new Set(["comp_mst", "team_comp_plan_rel", "comp_reg_rel"]);
/** 랭킹(/records)에 반영되는 테이블 */
const RECORDS_TABLES = new Set(["personal_best", "utmb_profile"]);
/** 공통코드 캐시에 반영되는 테이블 */
const CMM_CD_TABLES = new Set(["cmm_cd_mst"]);
/** 게시판(/board 목록·상세)에 반영되는 테이블 */
const BOARD_TABLES = new Set(["brd_post_mst"]);

// 홈(/)·랭킹(/records)은 dynamic 렌더라 revalidatePath는 no-op — 태그 무효화만 수행
//
// **팀이 오면 그 팀 태그만 턴다.** 트리거(revalidate_records)가 행의 팀을 같이 보낸다
// (`supabase/migrations/20261109200000_revalidate_webhook_team.sql`). 팀이 없으면(대회 원본처럼 공용이거나,
// 부모 행을 못 찾았거나, 옛 트리거) 공용 태그로 **모든 팀**을 턴다 — 덜 터는 것보다 낫다.
// 캐시는 공용 + 팀 태그를 같이 달고 있다(§lib/team-cache-tag).

function revalidateHomeCalendar(teamId: string | null) {
  revalidateTag(teamId ? teamCacheTag(HOME_CALENDAR_CACHE_TAG, teamId) : HOME_CALENDAR_CACHE_TAG, "max");
}

function revalidateCompetitions(teamId: string | null) {
  if (teamId) {
    // 팀 대회 계획·참가 신청 — 그 팀 캘린더(대회 칩·reg_count)와 그 팀 피드(다가오는 대회)만.
    // 대회 목록 캐시("competitions")는 공용 원본(comp_mst)만 담아 팀 행이 바뀌어도 그대로다.
    revalidateHomeCalendar(teamId);
    revalidateTag(teamCacheTag("story-feed", teamId), "max");
    return;
  }
  // 대회 원본은 공용 — 모든 팀
  revalidateTag("competitions", "max");
  revalidateHomeCalendar(null);
}

function revalidateRecords() {
  // /records 의 unstable_cache(tags: "records", `records:${teamId}`). 지금 이 경로로 오는 테이블은
  // 옛 archive 테이블뿐이다(대회 기록 저장은 앱이 팀 태그를 직접 턴다).
  revalidateTag("records", "max");
}

function revalidateBoard(teamId: string | null) {
  // /board 목록·사이트맵·상세가 공용 + 팀 태그를 같이 단다 — 팀이 오면 그 팀 것만
  revalidateTag(teamId ? teamCacheTag(BOARD_POSTS_CACHE_TAG, teamId) : BOARD_POSTS_CACHE_TAG, "max");
}

/** 테이블 정보가 없거나 매핑에 없는 테이블 → 기존 동작대로 전체 무효화 (하위호환 폴백) */
function revalidateAll() {
  revalidateHomeCalendar(null);
  revalidateCompetitions(null);
  revalidateRecords();
  revalidateTag(COMMON_CODES_CACHE_TAG, "max");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");

  if (secret !== env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DB 트리거(revalidate_records)가 body에 변경 테이블명과 (있으면) 그 행의 팀을 실어 보냄
  let table: string | null = null;
  let teamId: string | null = null;
  try {
    const payload = await request.json();
    if (typeof payload?.table === "string") table = payload.table;
    // 형식이 이상하면 팀을 버리고 전부 턴다(엉뚱한 태그를 털어 아무것도 안 털리는 것보다 낫다)
    if (typeof payload?.team_id === "string" && UUID_RE.test(payload.team_id)) teamId = payload.team_id;
  } catch {
    // body가 비었거나 JSON이 아니면 전체 무효화 폴백
  }

  if (table === null) {
    revalidateAll();
  } else if (HOME_TABLES.has(table)) {
    revalidateHomeCalendar(teamId);
  } else if (COMP_TABLES.has(table)) {
    revalidateCompetitions(teamId);
  } else if (RECORDS_TABLES.has(table)) {
    revalidateRecords();
  } else if (CMM_CD_TABLES.has(table)) {
    revalidateTag(COMMON_CODES_CACHE_TAG, "max");
  } else if (BOARD_TABLES.has(table)) {
    revalidateBoard(teamId);
  } else {
    revalidateAll();
  }

  return NextResponse.json({ revalidated: true, table, teamId });
}
