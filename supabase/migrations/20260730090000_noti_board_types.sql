-- 공지·업데이트 게시글 알림 2종 — `brd_notice` / `brd_update`.
--
-- ⚠️ **이건 신규 기능이 아니라 버그 수정이다.** `createPost`(app/actions/create-post.ts)는
-- 처음부터 이 두 타입으로 팀 전원에게 알림을 넣으려 했고 딥링크(`/board/{id}`)·아이콘까지
-- 앱에 다 준비돼 있는데, **CHECK 제약에만 두 값이 빠져 있어** INSERT가 계속 터지고 있었다.
--
-- 증상이 안 보이던 이유(세 겹):
--   ① `insertNotiMany`가 INSERT 실패를 삼키고 `console.error`만 남긴다(알림은 부가 기능이라
--      본행동을 막지 않는다는 정책 — 다른 발송처와 동일).
--   ② 그마저 `after()` 안에서 돌아 응답이 나간 뒤라 화면에 아무 흔적이 없다.
--   ③ 게시글 자체는 정상 등록되므로 관리자는 알림도 나갔다고 믿는다.
-- 결과: prd 게시글 8건 전부 알림 0건, `noti_mst`에 두 타입이 **한 행도 없다**(2026-07-30 실측).
-- KNOWLEDGE.md의 "정보 등록 알림이 6주간 나가지 않던 문제"와 같은 계열이다.
--
-- 수신 설정은 opt-out(`noti_pref_cfg.enabled_yn = false`인 행만 제외)이라 pref 행이 없는
-- 지금은 제약만 풀면 전원에게 나간다. 소급 발송은 없다 — 제약 추가 이후 새로 쓰는 글부터다.
--
-- **NOT VALID → VALIDATE 2단계**(README의 위험 변경 절차). noti_mst는 체크리스트가 콕
-- 집어 둔 핫테이블이라, 제약을 즉시 검증하면 알림 전체를 훑는 동안 쓰기가 막힌다.
SET lock_timeout = '3s';

ALTER TABLE public.noti_mst DROP CONSTRAINT noti_mst_noti_type_enm_check;

ALTER TABLE public.noti_mst ADD CONSTRAINT noti_mst_noti_type_enm_check
  CHECK (noti_type_enm = ANY (ARRAY[
    'ttl_grnt'::text, 'adm_cust'::text, 'dues_check_req'::text, 'dues_notice'::text,
    'cmnt_reply'::text, 'cmnt_mention'::text, 'sch_post_cmnt'::text, 'sch_post_new'::text,
    'gthr_new'::text, 'gthr_upd'::text, 'gthr_del'::text, 'gthr_cmnt'::text,
    'gthr_reply'::text, 'gthr_mention'::text, 'gthr_cncl'::text, 'fdbk_new'::text,
    'fdbk_rspd'::text, 'newbie_nudge_14'::text, 'newbie_nudge_28'::text,
    'reactivate_req'::text,
    'post_cmnt'::text, 'post_reply'::text,
    'brd_notice'::text, 'brd_update'::text
  ])) NOT VALID;

-- 기존 행 검증 — 행 락을 잡지 않는다(SHARE UPDATE EXCLUSIVE).
ALTER TABLE public.noti_mst VALIDATE CONSTRAINT noti_mst_noti_type_enm_check;
