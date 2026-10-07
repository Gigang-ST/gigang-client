-- gthr_attd_rel: 회원 세션의 직접 INSERT 정책 제거
--
-- 왜: 이 정책은 "본인 행 · 같은 팀 · 삭제 안 된 모임"만 확인하고 **시각·정원·승인제·참여조건을
-- 보지 않는다.** 지난 모임 잠금(`isPastLockedFor`)·정원(`join_gthr_or_wait`)·승인제·참여조건은 전부
-- 서버 액션/RPC 쪽에만 있어서, 로그인한 회원이 브라우저의 Supabase 클라이언트로
-- `insert({ gthr_id, mem_id: 나 })`를 직접 부르면 그 검사를 모두 건너뛴다 — 몇 주 지난 모임에
-- 소급 참석을 넣을 수 있다.
--   지금까지는 포인트(`trg_pt_gthr_attd_rel`)·활동량이 오르는 정도였지만, PB 클래스(#577)부터는
--   **공식훈련 벙 참석이 곧 보증금 환급액**이라 행 하나가 약 3,333원이 된다.
--
-- 앱은 이 정책을 쓰지 않는다(2026-10-07 전수 확인): 참석 등록은 `join_gthr_or_wait`
-- (service_role 전용 SECURITY DEFINER) · `admin_add_gthr_attendance` · 모임 생성 시 작성자 자동 참석
-- (`createAdminClient`) · MCP(`createAdminClient`)로만 일어난다. 그래서 정책을 조이는 대신 **없앤다**
-- — 조건을 하나 덧대도 정원·승인제 같은 규칙을 RLS에 다시 복제하게 될 뿐이다.
--
-- DELETE 정책(`gthr_attd_rel_delete`, 본인 행)은 남긴다 — 앱의 취소도 RPC를 타지만, 본인 참석을
-- 지우는 건 본인 손해(포인트·환급 감소)라 돈이 새는 구멍이 아니다. 취소 이력(`gthr_attd_hist`)을
-- 건너뛰는 문제는 별건.
SET lock_timeout = '3s';

DROP POLICY IF EXISTS gthr_attd_rel_insert ON public.gthr_attd_rel;
