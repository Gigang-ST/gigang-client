-- 개인 일정 — team_id·mem_id 를 API 로 바꾸지 못하게 UPDATE 권한을 컬럼 단위로 좁힌다 (PR #596 리뷰)
--
-- mem_sch_mst_update_own 정책은 "주인인가"만 본다. 그래서 테이블 단위 UPDATE 권한이 열린 채면
-- 본인이 REST 를 직접 불러 자기 일정의 team_id 를 다른 팀으로 옮길 수 있었다. 남에게 새지는 않지만
-- (SELECT 가 본인 전용) 일정이 자기 달력·리스트에서 조용히 사라진다.
--
-- 정책에 팀 소속 검사(v2_rls_auth_in_team)를 더하는 대신 **바꿀 수 있는 컬럼 자체를 좁힌다**:
-- - 정책에 걸면 비활성 회원이 자기 일정을 못 고친다(수정·삭제는 일부러 비활성에게도 열어 뒀다)
-- - 팀 이동은 지원할 이유가 없다 — 못 바꾸게 하는 게 가장 단순하다
-- mem_id 는 WITH CHECK 가 이미 막지만 같이 닫는다(주인을 바꾸는 UPDATE 는 의미가 없다).
--
-- 허용 목록은 앱 수정·삭제 액션(app/actions/schedule/manage-personal-schedule.ts)이 쓰는 컬럼과
-- 정확히 같다. 액션에서 새 컬럼을 고치게 되면 여기에도 GRANT 를 더해야 한다(안 하면 권한 오류).
SET lock_timeout = '3s';

REVOKE UPDATE ON public.mem_sch_mst FROM anon, authenticated;
GRANT UPDATE (sch_nm, sch_dt, stt_tm, end_tm, cont_txt, del_yn, upd_at) ON public.mem_sch_mst TO authenticated;
