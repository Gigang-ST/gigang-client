-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- 알림 타입 reactivated (다시 활동할 수 있게 됨) — 이슈 #571
--
-- 지금까지 회원 상태 변경은 **본인에게 아무 통보도 가지 않았다**(manage-member.ts 에
-- 알림 코드가 한 줄도 없다). 비활성·탈퇴는 본인이 참여를 시도할 때 차단 화면이 사유를
-- 말해 주므로 그걸로 족하지만, **재활성화만은 다르다** — 본인이 재가입을 요청해 놓고
-- 기다리는 소식인데, 통보가 없으면 앱을 다시 열어 뭔가 해봐야 풀린 걸 안다.
-- 요청(reactivate_req, 관리자행)과 짝을 이뤄 고리를 닫는 알림이다.
--
-- ⚠️ 직전 마이그레이션 목록을 복사하지 않고 prd 의 실제 정의를 읽어 그 상위집합으로 적었다
--    (20260911110000 의 경고 — batch_failed 가 복사 과정에서 유실됐던 사고).
--    2026-10-15 확인: prd 정의 = 아래 배열에서 'reactivated' 만 뺀 것과 동일.
--
-- VALIDATE 는 20261015120100 에서 **별도 트랜잭션**으로 한다. 같은 트랜잭션이면
-- DROP CONSTRAINT 가 잡은 ACCESS EXCLUSIVE 가 검증 스캔 끝까지 유지돼 NOT VALID 로
-- 나눈 의미가 없다.
--
-- 딥링크 맵(lib/notifications/deep-link.ts)과 알림 아이콘(notification-item.tsx)도 함께
-- 갱신했다 — 여기만 열고 맵을 빼먹으면 알림을 눌러도 아무 데도 안 간다.
-- ============================================================

ALTER TABLE public.noti_mst DROP CONSTRAINT IF EXISTS noti_mst_noti_type_enm_check;

ALTER TABLE public.noti_mst ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm = ANY (ARRAY[
    'ttl_grnt'::text, 'adm_cust'::text, 'dues_check_req'::text, 'dues_notice'::text,
    'cmnt_reply'::text, 'cmnt_mention'::text, 'sch_post_cmnt'::text, 'sch_post_new'::text,
    'gthr_new'::text, 'gthr_upd'::text, 'gthr_del'::text, 'gthr_cmnt'::text,
    'gthr_reply'::text, 'gthr_mention'::text, 'gthr_cncl'::text, 'fdbk_new'::text,
    'fdbk_rspd'::text, 'newbie_nudge_14'::text, 'newbie_nudge_28'::text,
    'reactivate_req'::text,
    'post_cmnt'::text, 'post_reply'::text,
    'brd_notice'::text, 'brd_update'::text,
    -- 모임 참가 신청·승인·반려
    'gthr_aply'::text, 'gthr_aprv'::text, 'gthr_rjct'::text,
    -- 모임 대기열 승급
    'gthr_promo'::text,
    -- 모임 선착순 구간 빈 자리 발생
    'gthr_seat'::text,
    -- 자동 배치 실패(운영진)
    'batch_failed'::text,
    -- 재활성화 완료(본인) — reactivate_req 의 짝
    'reactivated'::text
  ])) NOT VALID;

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- 'reactivated' 만 뺀 배열로 되돌린다. 다른 값은 **빼지 않는다** — 목록을 손으로 줄이면
-- 20260825140000 이 batch_failed 를 유실했던 사고가 되풀이된다.
-- ============================================================
