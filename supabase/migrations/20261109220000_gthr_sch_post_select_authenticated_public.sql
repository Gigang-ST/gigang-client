-- 모임(gthr_mst)·일정(sch_post_mst) 읽기 — 로그인한 사람도 비로그인과 같은 조건으로 읽는다.
--
-- 왜: 모임·일정은 비로그인에게 공개다(`*_select_anon` = del_yn=false). 그런데 로그인 정책은
-- "그 팀 회원"까지 요구해서, 울산 주소에 로그인한 기강 회원(= 울산 비회원)이 비로그인보다 못 봤다
-- — 울산 모임 상세가 "없는 모임"·404 로 떨어졌다. 로그인했다고 덜 보일 이유가 없다.
--
-- 새로 열리는 데이터는 없다: 같은 행을 비로그인(anon 키)이 이미 읽을 수 있다.
-- "어느 팀 것을 보여줄지"는 DB 가 아니라 접속 주소가 정한다 — DB 는 주소를 모르므로, 조회하는 쪽이
-- 접속 팀으로 `team_id` 를 건다(울산 모임은 울산 주소에서만 열린다). 2026-11-09 전수 확인: 앱의
-- gthr_mst·sch_post_mst 조회는 전부 `team_id` 를 직접 걸거나, 이미 팀을 확인한 id 로만 읽는다.
--
-- 쓰기(INSERT·UPDATE·DELETE) 정책은 그대로다 — 참석·댓글·수정은 여전히 그 팀 회원만.

ALTER POLICY gthr_mst_select ON public.gthr_mst
  USING (del_yn = false);

ALTER POLICY sch_post_select ON public.sch_post_mst
  USING (del_yn = false);
