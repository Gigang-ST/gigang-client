-- ============================================================
-- 모임 참여조건 · 운영진 승인제 — ④ get_gathering_detail 에 조건 필드
--   설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §8-9
--
-- ⚠️ 이 RPC 에는 **모임 속성인 조건 필드만** 싣는다. 신청자·대기·거절 정보는 절대 넣지 않는다.
--    이 함수는 SECURITY DEFINER 이고 GRANT EXECUTE ... TO anon 이라, 여기 실으면
--    gthr_aply_rel 의 RLS(본인·개설자·운영진만)를 통째로 우회해서 **비로그인 방문자에게까지
--    떨어진 사람 명단이 나간다.** 내 신청 상태와 신청 관리 목록은 RLS 클라이언트로 별도 조회한다.
--
--    조건 필드 자체는 anon 이 봐도 무방하다 — gthr_mst 는 이미 anon SELECT 를 허용하므로
--    (gthr_mst_select_anon) 새로 새는 정보가 아니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_gathering_detail(p_gthr_id uuid, p_team_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'max_prt_cnt',     g.max_prt_cnt,
    'sprt_cd',         g.sprt_cd,
    'aprv_req_yn',     g.aprv_req_yn,
    'req_attd_cnt',    g.req_attd_cnt,
    'req_attd_months', g.req_attd_months,
    'attendees',   COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'mem_id',    ar.mem_id,
            'mem_nm',    m.mem_nm,
            'avatar_url', m.avatar_url
          )
          ORDER BY ar.crt_at ASC
        )
        FROM   gthr_attd_rel ar
        LEFT JOIN mem_mst m ON m.mem_id = ar.mem_id
        WHERE  ar.gthr_id = p_gthr_id
      ),
      '[]'::json
    )
  )
  FROM  gthr_mst g
  WHERE g.gthr_id  = p_gthr_id
    AND g.team_id  = p_team_id
    AND g.del_yn   = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_gathering_detail(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- REVERT — 20260622200000_get_gathering_detail_rpc.sql 의 본문으로 되돌린다
--   (조건 3필드만 빼면 동일)
-- ============================================================
