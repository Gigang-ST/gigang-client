"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
 * 두 컴포넌트가 각자 조회하면 같은 장에서 쿼리가 두 번 나가고, 더 나쁘게는 갱신이
 * 한쪽에만 닿아 "말풍선엔 새 댓글이 뜨는데 숫자는 그대로"인 어긋남이 생긴다. 한 곳에서
 * 읽고 내려보낸다.
 *
 * **실시간 구독은 없다**(2026-09-18, §성능 점검 C). 남이 쓴 댓글은 다음 진입 조회에서
 * 들어오고, **내가 쓴 것은 시트가 `syncComments`로 올려보낸다.** 그 배선이 빠지면 방금 쓴
 * 댓글이 시트 안에만 보이고 말풍선·개수·격자 배지엔 안 뜬다.
 *
 * **보이는 장만 읽는다**(`active`): 릴스는 전 장이 한꺼번에 마운트돼 있어(scroll-snap
 * 목록) 이게 없으면 화면에 없는 수백 장이 동시에 댓글을 조회한다.
 *
 * ⚠️ **비로그인일 때는 `active`를 false로 넘긴다**(호출부 책임). `cmnt_mst`의 SELECT 정책이
 * `authenticated` 전용이라 익명 세션은 **에러 없이 0행**을 받는다 — 실패가 아니라 빈 목록으로
 * 보여서 "댓글이 없는 사진"과 구분되지 않는다. 여기서 막지 않으면 쿼리가 헛돌기만 한다.
 * 못 읽는다는 사실은 화면(하단 줄)이 로그인 안내로 밝힌다.
 */
export function usePostComments(postId: string, teamId: string, active: boolean) {
  /**
   * **목록과 "어느 글의 것인지"를 함께** 들고 있는다.
   *
   * 예전엔 목록만 들었다. 그래서 장을 넘겨 `postId`가 바뀌어도 새 쿼리가 끝날 때까지
   * **이전 글의 댓글이 그대로 남았고**, 쓰는 쪽은 그게 남의 것인지 알 방법이 없었다 —
   * B 사진 위에 A의 말풍선이 뜨고, 하단 개수도 A의 것이었다.
   *
   * 격자 배지가 생기면서 그 어긋남이 **남게** 됐다: 전환 중 값이
   * `commentCounts[B] = A의 개수`로 저장되고, B의 쿼리가 실패하거나 영영 안 끝나면
   * 그 상태로 굳는다(릴스는 다음 응답에 저절로 고쳐지지만 오버레이 맵은 아니다).
   *
   * id를 같이 들면 "지금 글의 것"만 내보낼 수 있어 그 창이 **구조적으로** 사라진다.
   */
  const [loaded, setLoaded] = useState<{
    postId: string;
    list: PostComment[];
  } | null>(null);
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
          //
          // **빈 배열로도 두지 않는다.** 예전엔 `setComments([])`였는데, 그건 "이 글엔 댓글이
          // 없다"는 **적극적인 주장**이라 격자 배지가 그걸 받아 0으로 덮어쓴다 — 서버가 준
          // 맞는 개수(캐시)가 조회 한 번 실패했다고 지워진다. 모르면 모른다고 두는 게 맞다.
          // 화면상 차이는 없다: 릴스 하단 바는 `?? 0`이라 어느 쪽이든 0으로 보인다.
          console.error("[usePostComments] 댓글 조회 실패", error);
          return;
        }
        // **성공한 뒤에** 읽음 표시. 이 순서가 핵심이다(위 loadedForRef 주석 참조).
        loadedForRef.current = postId;
        setLoaded({
          postId,
          list: (data ?? []).map((row) => {
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
        });
      });

    return () => {
      cancelled = true;
    };
  }, [active, postId, teamId, supabase]);

  /**
   * **시트에서 일어난 변경을 이 목록에 반영한다** — 작성·수정·삭제 전부.
   *
   * 예전엔 `cmnt_mst` Realtime이 시트와 여기를 각각 갱신해 줘서 배선이 필요 없었다.
   * 구독을 걷어낸 뒤로는(§성능 점검 C) 시트가 유일한 변경 지점이므로, 그 결과를 여기로
   * 흘려보내지 않으면 **내가 방금 쓴 댓글이 말풍선·하단 개수·격자 배지에 안 뜬다.**
   *
   * **내용 서명으로 걸러 낸다.** `CommentSection`은 자기 목록이 바뀔 때마다 부르는데,
   * 마운트 직후 한 번은 우리가 넘긴 `initialComments`와 같은 내용으로 돌아온다. 그대로
   * 받으면 매번 새 객체라 리렌더가 한 바퀴 더 돈다.
   *
   * **어느 글의 것인지는 부르는 쪽이 같이 준다**(`fromPostId`). 장을 넘긴 직후 닫히는 시트가
   * 늦게 부를 수 있어 그건 버려야 하는데, **우리 `loaded`를 기준으로 판단하면 안 된다** —
   * 아직 안 읽었거나(전환 중) 조회가 실패해 `loaded`가 `null`이면 **시트가 제대로 가져온
   * 목록까지 통째로 버리게 된다**(그 경우 시트는 `initialComments`를 못 받아 스스로 읽는다).
   * 그러면 말풍선·개수가 영영 안 채워진다. 그래서 `null`이어도 **글이 맞으면 받아 둔다.**
   */
  const syncComments = useCallback(
    (fromPostId: string, list: PostComment[]) => {
      if (fromPostId !== postId) return;
      setLoaded((prev) => {
        if (prev?.postId === postId && signature(prev.list) === signature(list)) return prev;
        return { postId, list };
      });
    },
    [postId],
  );

  return {
    /**
     * **지금 글의 것만 내보낸다.** 아직 안 읽었거나(전환 중·로딩) 들고 있는 게 다른 글의
     * 목록이면 `null`이다 — 쓰는 쪽은 그걸 "모른다"로 받아 자기 판단을 미룬다
     * (격자 배지는 서버 값을 그대로 두고, 말풍선은 아무것도 안 그린다).
     *
     * 옛 목록을 잠깐 보여 주는 것보다 안 보여 주는 게 낫다: 남의 글 댓글이 뜨는 건
     * 비어 보이는 것과 달리 **틀린 정보**다.
     */
    comments: loaded && loaded.postId === postId ? loaded.list : null,
    syncComments,
  };
}

/**
 * 목록이 실제로 달라졌는지 가리는 값 — 표시에 쓰이는 것만 담는다.
 * `optimistic` 댓글은 id가 임시(`optimistic-…`)였다가 진짜 id로 바뀌므로 그 전환도 잡힌다.
 */
function signature(list: PostComment[]): string {
  return list
    .map((c) => `${c.cmnt_id}:${c.del_yn ? 1 : 0}:${c.edit_yn ? 1 : 0}:${c.cont_txt}`)
    .join("|");
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
