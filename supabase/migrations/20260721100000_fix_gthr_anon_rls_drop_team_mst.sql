-- 비로그인(anon) 모임 조회 버그 수정
--
-- 증상: 공유링크(gigang.team/?gthr=<short_id>)를 비로그인으로 열면 존재하는 모임도
--       "삭제되었거나 찾을 수 없는 모임입니다"로 실패. 로그인 시엔 정상.
--
-- 원인: gthr_mst_select_anon / gthr_attd_rel_select_anon 정책이 team_mst 존재를
--       EXISTS/JOIN 으로 확인했다. 그런데
--         (1) gthr_mst.team_id 는 NOT NULL + team_mst FK 라 그 존재 체크는 항상 참 → 무의미,
--         (2) anon 은 team_mst 에 SELECT 정책이 없어 그 서브쿼리가 0행이 된다
--             → 정책이 어떤 행도 통과시키지 못함 → 비로그인은 모든 모임을 못 읽는다.
--       (원래 의도는 "타 팀 모임 차단"이었으나 존재체크로는 테넌트 격리도 못 하고 anon만 깨뜨림.)
--       달력이 멀쩡한 건 get_public_team_gatherings 등이 SECURITY DEFINER 라 RLS 를 우회하기 때문.
--       공유링크 딥링크의 gthr_mst 직접 조회만 이 정책에 걸렸다.
--
-- 조치: sch_post_mst_select_anon 과 동일하게 del_yn=false 기준으로 정렬. team_mst 의존 제거.
--       gthr_attd_rel 은 team_mst JOIN 만 걷어내고 gthr_mst(비삭제) 스코프는 유지한다
--       (gthr_mst anon 정책이 위에서 del_yn=false 로 열리므로 이 서브쿼리도 정상 동작).

DROP POLICY IF EXISTS gthr_mst_select_anon ON public.gthr_mst;
CREATE POLICY gthr_mst_select_anon ON public.gthr_mst
  FOR SELECT TO anon
  USING (del_yn = false);

DROP POLICY IF EXISTS gthr_attd_rel_select_anon ON public.gthr_attd_rel;
CREATE POLICY gthr_attd_rel_select_anon ON public.gthr_attd_rel
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.gthr_mst g
      WHERE g.gthr_id = gthr_attd_rel.gthr_id
        AND g.del_yn = false
    )
  );
