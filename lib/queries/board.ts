import { createUntypedAdminClient } from "@/lib/supabase/admin";

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
    .select(
      "post_id, team_id, post_type_enm, post_nm, writ_mem_id, pin_yn, crt_at, upd_at, mem_mst(mem_nm)",
    )
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

  return (data ?? []).map((row) => {
    const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
    return {
      post_id: row.post_id,
      team_id: row.team_id,
      post_type_enm: row.post_type_enm as "notice" | "update",
      post_nm: row.post_nm,
      writ_mem_id: row.writ_mem_id,
      writ_mem_nm: (mem as { mem_nm: string } | null)?.mem_nm ?? null,
      pin_yn: row.pin_yn ?? false,
      crt_at: row.crt_at,
      upd_at: row.upd_at,
    };
  });
}

export async function getBoardPost(postId: string): Promise<BoardPost | null> {
  const admin = createUntypedAdminClient();

  const { data } = await admin
    .from("brd_post_mst")
    .select(
      "post_id, team_id, post_type_enm, post_nm, post_cont, writ_mem_id, pin_yn, crt_at, upd_at, mem_mst(mem_nm)",
    )
    .eq("post_id", postId)
    .eq("del_yn", false)
    .single();

  if (!data) return null;

  const mem = Array.isArray(data.mem_mst) ? data.mem_mst[0] : data.mem_mst;
  return {
    post_id: data.post_id,
    team_id: data.team_id,
    post_type_enm: data.post_type_enm as "notice" | "update",
    post_nm: data.post_nm,
    post_cont: data.post_cont,
    writ_mem_id: data.writ_mem_id,
    writ_mem_nm: (mem as { mem_nm: string } | null)?.mem_nm ?? null,
    pin_yn: data.pin_yn ?? false,
    crt_at: data.crt_at,
    upd_at: data.upd_at,
  };
}

/** 로그인한 멤버가 해당 팀/타입에서 읽지 않은 게시글이 있는지 확인 */
export async function hasUnreadBoardPost(
  memberId: string | null | undefined,
  teamId: string,
  type: "notice" | "update",
): Promise<boolean> {
  if (!memberId) return false;

  const admin = createUntypedAdminClient();

  const { data } = await admin
    .from("brd_post_mst")
    .select("post_id")
    .eq("team_id", teamId)
    .eq("post_type_enm", type)
    .eq("del_yn", false)
    .limit(50);

  if (!data || data.length === 0) return false;

  const postIds = data.map((r) => r.post_id);

  const { data: readData } = await admin
    .from("brd_post_read_hist")
    .select("post_id")
    .eq("mem_id", memberId)
    .in("post_id", postIds);

  const readSet = new Set((readData ?? []).map((r) => r.post_id));
  return postIds.some((id) => !readSet.has(id));
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
