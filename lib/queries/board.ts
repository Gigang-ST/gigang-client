import { unstable_cache } from "next/cache";

import { createUntypedAdminClient } from "@/lib/supabase/admin";

/** 게시판 목록·상세 공개 데이터 캐시 태그 (brd_post_mst 변경 시 무효화) */
export const BOARD_POSTS_CACHE_TAG = "board-posts";

/** 특정 게시글 상세 캐시 태그 (`board-post:{postId}`) */
export function boardPostCacheTag(postId: string): string {
  return `board-post:${postId}`;
}

export type BoardPost = {
  post_id: string;
  team_id: string;
  post_type_enm: "notice" | "update";
  post_nm: string;
  post_cont: string;
  writ_mem_id: string | null;
  writ_mem_nm: string | null;
  pin_yn: boolean;
  crt_at: string;
  upd_at: string;
};

export type BoardPostSummary = Omit<BoardPost, "post_cont">;

export async function getBoardPosts(
  teamId: string,
  type: "notice" | "update",
  options: { limit?: number; cursor?: string } = {},
): Promise<BoardPostSummary[]> {
  const admin = createUntypedAdminClient();
  const { limit = 20, cursor } = options;

  let query = admin
    .from("brd_post_mst")
    .select("post_id, team_id, post_type_enm, post_nm, writ_mem_id, pin_yn, crt_at, upd_at")
    .eq("team_id", teamId)
    .eq("post_type_enm", type)
    .eq("del_yn", false)
    .order("pin_yn", { ascending: false })
    .order("crt_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("crt_at", cursor);
  }

  const { data } = await query;

  return (data ?? []).map((row) => ({
    post_id: row.post_id,
    team_id: row.team_id,
    post_type_enm: row.post_type_enm as "notice" | "update",
    post_nm: row.post_nm,
    writ_mem_id: row.writ_mem_id,
    writ_mem_nm: null, // 목록에서는 작성자 이름 불필요
    pin_yn: row.pin_yn ?? false,
    crt_at: row.crt_at,
    upd_at: row.upd_at,
  }));
}

export async function getBoardPost(postId: string): Promise<BoardPost | null> {
  const admin = createUntypedAdminClient();

  const { data: post, error } = await admin
    .from("brd_post_mst")
    .select("post_id, team_id, post_type_enm, post_nm, post_cont, writ_mem_id, pin_yn, crt_at, upd_at")
    .eq("post_id", postId)
    .eq("del_yn", false)
    .single();

  if (error || !post) return null;

  // 작성자 이름 별도 조회
  let writ_mem_nm: string | null = null;
  if (post.writ_mem_id) {
    const { data: mem } = await admin
      .from("mem_mst")
      .select("mem_nm")
      .eq("mem_id", post.writ_mem_id)
      .single();
    writ_mem_nm = mem?.mem_nm ?? null;
  }

  return {
    post_id: post.post_id,
    team_id: post.team_id,
    post_type_enm: post.post_type_enm as "notice" | "update",
    post_nm: post.post_nm,
    post_cont: post.post_cont,
    writ_mem_id: post.writ_mem_id,
    writ_mem_nm,
    pin_yn: post.pin_yn ?? false,
    crt_at: post.crt_at,
    upd_at: post.upd_at,
  };
}

/**
 * 게시판 목록 캐시 래퍼. 목록 페이지 SSG용.
 * 무효화 주경로는 DB 트리거 웹훅(revalidateTag(board-posts))이고,
 * revalidate 시간 만료는 웹훅 유실 시 영구 stale을 막는 안전망이다.
 */
export function getCachedBoardPosts(
  teamId: string,
  type: "notice" | "update",
): Promise<BoardPostSummary[]> {
  return unstable_cache(
    () => getBoardPosts(teamId, type, { limit: 20 }),
    [`board-posts-${teamId}-${type}`],
    { tags: [BOARD_POSTS_CACHE_TAG], revalidate: 3600 },
  )();
}

/**
 * 게시글 상세 캐시 래퍼. 상세 페이지 온디맨드 캐시용.
 * 태그 2개: 전체 목록 무효화(board-posts)와 특정 글 무효화(board-post:{id}) 둘 다에 반응하도록 유지.
 * DB 직접 수정(트리거 → board-posts) / 앱 내 수정(revalidateTag(board-post:{id})) 어느 경로로든 갱신됨.
 */
export function getCachedBoardPost(postId: string): Promise<BoardPost | null> {
  return unstable_cache(
    () => getBoardPost(postId),
    [`board-post-${postId}`],
    {
      tags: [BOARD_POSTS_CACHE_TAG, boardPostCacheTag(postId)],
      revalidate: 3600,
    },
  )();
}

/** 로그인한 멤버가 해당 팀/타입에서 읽지 않은 게시글이 있는지 확인 */
/** 공지/업데이트 미읽음 여부를 쿼리 1번으로 동시에 확인 */
export async function hasUnreadBoardPosts(
  memberId: string | null | undefined,
  teamId: string,
): Promise<{ notice: boolean; update: boolean }> {
  if (!memberId) return { notice: false, update: false };

  const admin = createUntypedAdminClient();

  const { data } = await admin
    .from("brd_post_mst")
    .select("post_id, post_type_enm, brd_post_read_hist!left(post_id)")
    .eq("team_id", teamId)
    .in("post_type_enm", ["notice", "update"])
    .eq("del_yn", false)
    .eq("brd_post_read_hist.mem_id", memberId)
    .limit(50);

  if (!data || data.length === 0) return { notice: false, update: false };

  let notice = false;
  let update = false;
  for (const row of data) {
    const isUnread = !Array.isArray(row.brd_post_read_hist) || row.brd_post_read_hist.length === 0;
    if (!isUnread) continue;
    if (row.post_type_enm === "notice") notice = true;
    else if (row.post_type_enm === "update") update = true;
    if (notice && update) break;
  }

  return { notice, update };
}

/** 게시글 읽음 이력 기록 */
export async function recordBoardPostRead(
  postId: string,
  memberId: string,
): Promise<void> {
  const admin = createUntypedAdminClient();
  await admin
    .from("brd_post_read_hist")
    .upsert({ post_id: postId, mem_id: memberId }, { onConflict: "post_id,mem_id" });
}
