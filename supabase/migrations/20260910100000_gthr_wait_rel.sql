-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- gthr_wait_rel — 모임 대기열 (비승인제 모임 전용)
--   설계: docs/superpowers/specs/2026-09-10-모임-대기열-design.md §2
--
-- 왜 gthr_attd_rel 에 상태 컬럼을 얹지 않는가:
--   그 테이블에는 포인트 트리거(trg_pt_gthr_attd_rel)·칭호 엔진·월 활동량 집계·
--   유령회원 판정이 "행이 있으면 곧 참석 확정"이라는 불변식에 매달려 있다.
--   대기 상태를 얹으면 **대기만 걸어도 포인트가 붙는다.**
--   승인제 설계(20260825110000_gthr_aply_rel.sql)가 같은 이유로 이미 이 길을 막았다.
--
-- 왜 gthr_aply_rel(승인제 신청)을 재사용하지 않는가:
--   aply_st_cd='pending' 이 모임 종류에 따라 *심사 대기*와 *자리 대기* 두 뜻이 되어,
--   기존 승인제 쿼리 전부에 aprv_req_yn 분기가 붙는다. 특히
--   listPendingApplicationGatherings()(운영진 "심사 대기 남은 모임")가 비승인제
--   대기자까지 긁어와 "심사해라"로 보이는 조용한 회귀가 생긴다.
-- ============================================================

CREATE TABLE public.gthr_wait_rel (
  wait_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gthr_id    uuid        NOT NULL REFERENCES public.gthr_mst(gthr_id),
  mem_id     uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  wait_st_cd text        NOT NULL DEFAULT 'waiting'
                         CHECK (wait_st_cd IN ('waiting', 'promoted', 'canceled')),
  wait_at    timestamptz NOT NULL DEFAULT now(),
  crt_at     timestamptz NOT NULL DEFAULT now(),
  upd_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_gthr_wait_rel UNIQUE (gthr_id, mem_id)
);

COMMENT ON TABLE  public.gthr_wait_rel            IS '모임 대기열(비승인제 전용). 정원이 차면 여기 줄을 서고, 취소로 자리가 나면 promote_gthr_waitlist 가 선착순으로 올린다.';
COMMENT ON COLUMN public.gthr_wait_rel.wait_id    IS 'PK';
COMMENT ON COLUMN public.gthr_wait_rel.gthr_id    IS '모임 ID (gthr_mst FK)';
COMMENT ON COLUMN public.gthr_wait_rel.mem_id     IS '대기자 mem_id (mem_mst FK)';
COMMENT ON COLUMN public.gthr_wait_rel.wait_st_cd IS 'waiting(줄 서 있음) | promoted(참석으로 올라감) | canceled(본인이 대기 취소).';
COMMENT ON COLUMN public.gthr_wait_rel.wait_at    IS '순번의 정본. crt_at 이 아니다 — 참석→취소→(만석)→재신청이면 여기를 now() 로 갱신해 줄 맨 뒤로 보낸다. 이미 waiting 인 사람이 또 눌러도 갱신하지 않는다(연타로 자기 순번을 미는 사고 방지).';
COMMENT ON COLUMN public.gthr_wait_rel.crt_at     IS '최초 대기 등록 시각(참고용). 순번 판정에는 쓰지 않는다.';

-- 순번 조회(모임별 waiting 을 wait_at 순으로)가 유일한 뜨거운 경로다.
-- 신규 빈 테이블이라 CONCURRENTLY 없이 같은 파일에서 만든다(막을 쓰기가 없다).
CREATE INDEX ix_gthr_wait_rel_gthr_order
  ON public.gthr_wait_rel (gthr_id, wait_at)
  WHERE wait_st_cd = 'waiting';

-- 내 대기 상태 조회용
CREATE INDEX ix_gthr_wait_rel_mem ON public.gthr_wait_rel (mem_id);

-- ============================================================
-- RLS — SELECT 만 팀 멤버에게. 쓰기 정책 없음(= authenticated 직접 쓰기 불가).
--   쓰기는 SECURITY DEFINER RPC(service_role)만 한다. gthr_attd_hist 와 같은 태도.
-- ============================================================

ALTER TABLE public.gthr_wait_rel ENABLE ROW LEVEL SECURITY;

CREATE POLICY gthr_wait_rel_select ON public.gthr_wait_rel
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gthr_mst g
      WHERE g.gthr_id = gthr_wait_rel.gthr_id
        AND g.del_yn = false
        AND public.v2_rls_auth_in_team(g.team_id)
    )
  );

COMMENT ON POLICY gthr_wait_rel_select ON public.gthr_wait_rel
  IS '팀 멤버만 대기 명단 조회. 비멤버·anon 차단.';

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- DROP TABLE IF EXISTS public.gthr_wait_rel;
-- ============================================================
