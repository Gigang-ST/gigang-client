"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CmntRow } from "@/components/comment/comment-item";

import { createClient } from "@/lib/supabase/client";

/**
 * 운동기록 댓글 한 줄 — **댓글 시트(`CommentSection`)와 같은 모양**(`CmntRow`)이다.
 *
 * 예전엔 표시에 필요한 것만(이름·본문) 담은 좁은 타입이었는데, 그러면 시트가 이 결과를
 * 재사용하지 못해 **열 때 똑같은 쿼리를 한 번 더** 날렸다(스레드·수정표시·삭제 자리표시자에
 * `prnt_id`·`edit_yn`·`del_yn`·`crt_at`·`upd_at`이 필요해서). 그 두 번째 왕복이 곧
 * "댓글이 0건인데도 뜨는 `댓글 불러오는 중...`"의 정체였다 — 개수는 이미 알고 있으면서
 * 0건을 재확인하느라 스피너를 띄운 셈이다.
 *
 * 한 번 읽어 둘이 나눠 쓴다: 티커·개수는 필요한 필드만 골라 보고, 시트는 통째로
 * `initialComments`로 받아 조회 없이 즉시 그린다(모임 상세가 SSR로 내려주는 것과 같은 분기).
 */
export type PostComment = CmntRow;

/**
 * 운동기록 한 건의 댓글 목록 — 말풍선 티커와 하단 입력줄(개수)이 **함께** 쓴다.
 *
 * 두 컴포넌트가 각자 조회하면 같은 장에서 쿼리가 두 번 나가고, 더 나쁘게는 Realtime이
 * 한쪽에만 닿아 "말풍선엔 새 댓글이 뜨는데 숫자는 그대로"인 어긋남이 생긴다. 한 곳에서
 * 읽고 내려보낸다.
 *
 * **보이는 장만 읽는다**(`active`): 릴스는 전 장이 한꺼번에 마운트돼 있어(scroll-snap
 * 목록) 이게 없으면 화면에 없는 수백 장이 동시에 댓글을 조회한다.
 *
 * ⚠️ **비로그인일 때는 `active`를 false로 넘긴다**(호출부 책임). `cmnt_mst`의 SELECT 정책이
 * `authenticated` 전용이라 익명 세션은 **에러 없이 0행**을 받는다 — 실패가 아니라 빈 목록으로
 * 보여서 "댓글이 없는 사진"과 구분되지 않는다. 여기서 막지 않으면 쿼리와 Realtime 구독이
 * 헛돌기만 한다. 못 읽는다는 사실은 화면(하단 줄)이 로그인 안내로 밝힌다.
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
        "cmnt_id, prnt_id, mem_id, cont_txt, edit_yn, del_yn, crt_at, upd_at, mem_mst!cmnt_mst_mem_id_fkey(mem_nm, avatar_url)",
      )
      .eq("entity_type", "post")
      .eq("entity_id", postId)
      .eq("team_id", teamId)
      // 삭제된 댓글도 **받아 둔다**. "삭제된 댓글입니다" 자리표시자는 스레드 맥락을 지키는
      // 장치라 시트 안에서 뜻이 있고, 흐르는 말풍선·개수에는 섞이면 안 된다 — 거르는 건
      // 여기가 아니라 쓰는 쪽(`visiblePostComments`)이다. 여기서 미리 지우면 시트가
      // 이 결과를 못 쓰고 다시 조회해야 한다(그게 예전 스피너의 원인).
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
              prnt_id: row.prnt_id,
              mem_id: row.mem_id,
              mem_nm: (mem as { mem_nm?: string | null })?.mem_nm ?? "멤버",
              avatar_url: (mem as { avatar_url?: string | null })?.avatar_url ?? null,
              cont_txt: row.cont_txt,
              edit_yn: row.edit_yn,
              del_yn: row.del_yn,
              crt_at: row.crt_at,
              upd_at: row.upd_at,
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
              prnt_id: string | null;
              mem_id: string;
              cont_txt: string;
              edit_yn: boolean;
              del_yn: boolean;
              crt_at: string;
              upd_at: string;
            };
            if (incoming.del_yn) return;
            setComments((prev) => {
              const list = prev ?? [];
              if (list.some((c) => c.cmnt_id === incoming.cmnt_id)) return list;
              return [
                ...list,
                {
                  cmnt_id: incoming.cmnt_id,
                  prnt_id: incoming.prnt_id ?? null,
                  mem_id: incoming.mem_id,
                  // Realtime payload엔 조인이 안 실린다 — 이름·프사는 다음 진입 조회에서 채워진다.
                  mem_nm: "멤버",
                  avatar_url: null,
                  cont_txt: incoming.cont_txt,
                  edit_yn: incoming.edit_yn ?? false,
                  del_yn: false,
                  crt_at: incoming.crt_at,
                  upd_at: incoming.upd_at,
                },
              ];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as {
              cmnt_id: string;
              cont_txt: string;
              edit_yn: boolean;
              del_yn: boolean;
              upd_at: string;
            };
            setComments((prev) => {
              const list = prev ?? [];
              // 삭제(soft)여도 **목록에서 빼지 않는다** — del_yn만 세워 둔다. 말풍선·개수는
              // 쓰는 쪽에서 걸러지고, 시트는 이 행이 있어야 "삭제된 댓글입니다" 자리표시자로
              // 스레드 맥락을 지킨다.
              return list.map((c) =>
                c.cmnt_id === updated.cmnt_id
                  ? {
                      ...c,
                      cont_txt: updated.cont_txt,
                      edit_yn: updated.edit_yn ?? c.edit_yn,
                      del_yn: updated.del_yn,
                      upd_at: updated.upd_at ?? c.upd_at,
                    }
                  : c,
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

/**
 * 사진 위에 **보일** 댓글만 — 흐르는 말풍선과 하단 개수가 쓴다.
 *
 * 훅은 시트가 그대로 쓸 수 있도록 삭제된 댓글까지 담아 두므로(스레드 자리표시자용),
 * 표시 쪽은 여기서 한 번 걸러 낸다. "3개"라고 적혀 있는데 열어 보니 삭제 안내만 있는
 * 어긋남을 막는 곳이 여기다.
 */
export function visiblePostComments(
  comments: PostComment[] | null,
): PostComment[] | null {
  if (comments === null) return null;
  return comments.filter((c) => !c.del_yn);
}
