"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/** 릴스 표시용 댓글 한 줄 — 목록 표시에 필요한 것만(수정/삭제 메타는 시트가 맡는다) */
export type PostComment = {
  cmnt_id: string;
  mem_id: string;
  mem_nm: string;
  avatar_url: string | null;
  cont_txt: string;
};

/**
 * 운동기록 한 건의 댓글 목록 — 말풍선 티커와 하단 입력줄(개수)이 **함께** 쓴다.
 *
 * 두 컴포넌트가 각자 조회하면 같은 장에서 쿼리가 두 번 나가고, 더 나쁘게는 Realtime이
 * 한쪽에만 닿아 "말풍선엔 새 댓글이 뜨는데 숫자는 그대로"인 어긋남이 생긴다. 한 곳에서
 * 읽고 내려보낸다.
 *
 * **보이는 장만 읽는다**(`active`): 릴스는 전 장이 한꺼번에 마운트돼 있어(scroll-snap
 * 목록) 이게 없으면 화면에 없는 수백 장이 동시에 댓글을 조회한다.
 */
export function usePostComments(postId: string, teamId: string, active: boolean) {
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const supabase = useMemo(() => createClient(), []);
  /**
   * 이미 읽은 장의 post_id — 스와이프로 오갈 때마다 쿼리가 다시 나가지 않게 한다.
   *
   * **boolean 플래그로 두면 안 된다.** 예전엔 `loadedRef = useRef(false)`였는데,
   * React 19 개발 모드는 effect를 두 번 돌린다(StrictMode): 1회차가 플래그를 세우고
   * 요청을 띄운 뒤 cleanup이 `cancelled=true`로 그 결과를 버리고, 2회차는 플래그에 걸려
   * 아예 요청을 안 한다 → **응답이 영영 안 들어와 comments가 null로 굳는다**
   * (= 말풍선도 개수도 안 뜨는 그 증상). "성공했을 때만" 표시해야 안전하다.
   */
  const loadedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || loadedForRef.current === postId) return;
    let cancelled = false;

    void supabase
      .from("cmnt_mst")
      .select(
        "cmnt_id, mem_id, cont_txt, mem_mst!cmnt_mst_mem_id_fkey(mem_nm, avatar_url)",
      )
      .eq("entity_type", "post")
      .eq("entity_id", postId)
      .eq("team_id", teamId)
      // 삭제된 댓글은 뺀다 — "삭제된 댓글입니다" 자리표시자는 스레드 맥락을 지키는 장치라
      // 목록(시트) 안에서만 뜻이 있다. 흐르는 말풍선·개수에 섞이면 그냥 고장으로 읽힌다.
      .eq("del_yn", false)
      .order("crt_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // 실패는 표시하지 않는다 — loadedForRef를 그대로 둬야 다음 진입에 다시 시도한다.
          console.error("[usePostComments] 댓글 조회 실패", error);
          setComments([]);
          return;
        }
        // **성공한 뒤에** 읽음 표시. 이 순서가 핵심이다(위 loadedForRef 주석 참조).
        loadedForRef.current = postId;
        setComments(
          (data ?? []).map((row) => {
            const mem = Array.isArray(row.mem_mst) ? row.mem_mst[0] : row.mem_mst;
            return {
              cmnt_id: row.cmnt_id,
              mem_id: row.mem_id,
              mem_nm: (mem as { mem_nm?: string | null })?.mem_nm ?? "멤버",
              avatar_url: (mem as { avatar_url?: string | null })?.avatar_url ?? null,
              cont_txt: row.cont_txt,
            };
          }),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [active, postId, teamId, supabase]);

  // 시트에서 쓰고 닫았을 때 뒤 배경의 말풍선·개수가 옛 목록인 채로 남지 않게 한다.
  useEffect(() => {
    if (!active) return;
    const channel = supabase
      .channel(`cmnt-post:${postId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cmnt_mst",
          filter: `entity_id=eq.${postId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          // 같은 entity_id를 다른 타입/팀이 쓸 수 있으므로 한 번 더 좁힌다(CommentSection 동일 방어).
          if (row?.entity_type !== "post" || row?.team_id !== teamId) return;

          if (payload.eventType === "INSERT") {
            const incoming = payload.new as {
              cmnt_id: string;
              mem_id: string;
              cont_txt: string;
              del_yn: boolean;
            };
            if (incoming.del_yn) return;
            setComments((prev) => {
              const list = prev ?? [];
              if (list.some((c) => c.cmnt_id === incoming.cmnt_id)) return list;
              return [
                ...list,
                {
                  cmnt_id: incoming.cmnt_id,
                  mem_id: incoming.mem_id,
                  // Realtime payload엔 조인이 안 실린다 — 이름·프사는 다음 진입 조회에서 채워진다.
                  mem_nm: "멤버",
                  avatar_url: null,
                  cont_txt: incoming.cont_txt,
                },
              ];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as {
              cmnt_id: string;
              cont_txt: string;
              del_yn: boolean;
            };
            setComments((prev) => {
              const list = prev ?? [];
              // 삭제(soft)면 빼고, 수정이면 본문만 갈아끼운다.
              if (updated.del_yn) {
                return list.filter((c) => c.cmnt_id !== updated.cmnt_id);
              }
              return list.map((c) =>
                c.cmnt_id === updated.cmnt_id ? { ...c, cont_txt: updated.cont_txt } : c,
              );
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, postId, teamId, supabase]);

  return comments;
}
