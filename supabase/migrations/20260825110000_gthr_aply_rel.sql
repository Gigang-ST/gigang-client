-- ============================================================
-- 모임 참여조건 · 운영진 승인제 — ② gthr_aply_rel (참가 신청)
--   설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §3.2 · §3.3
--
-- 왜 gthr_attd_rel 에 상태 컬럼을 넣지 않는가:
--   gthr_attd_rel 은 "행이 있으면 곧 참석 확정"이고, 그 불변식에 포인트 적립 트리거
--   (trg_pt_gthr_attd_rel, AFTER INSERT)·칭호 엔진·월 활동량·팀 펄스·전광판·유령회원
--   판정·MCP·크론이 매달려 있다. 대기 상태를 그 테이블에 담으면 **신청만 해도 포인트가
--   붙고 참석자 수에 잡힌다.** 그래서 대기·거절은 여기 담고, 승인되는 순간에만
--   gthr_attd_rel 에 INSERT 한다(approve_gthr_application RPC).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gthr_aply_rel (
  aply_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gthr_id       uuid        NOT NULL REFERENCES public.gthr_mst(gthr_id),
  mem_id        uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  aply_st_cd    text        NOT NULL CHECK (aply_st_cd IN ('pending', 'approved', 'rejected', 'canceled')),
  aply_memo_txt text,
  rvw_by        uuid        REFERENCES public.mem_mst(mem_id),
  rvw_at        timestamptz,
  rvw_memo_txt  text,
  crt_at        timestamptz NOT NULL DEFAULT now(),
  upd_at        timestamptz NOT NULL DEFAULT now(),
  -- 한 사람당 한 행. 재신청(rejected/canceled → pending)은 이 행의 UPDATE 다.
  CONSTRAINT uk_gthr_aply_rel_gthr_mem UNIQUE (gthr_id, mem_id),
  -- 길이 상한을 DB 에서도 강제한다 — "use server" 엔드포인트가 임의 인자로 대용량
  -- 텍스트를 저장하는 것을 이중 차단(gthr_attd_hist.reason_txt 와 같은 태도).
  CONSTRAINT ck_gthr_aply_memo_len     CHECK (char_length(aply_memo_txt) <= 200),
  CONSTRAINT ck_gthr_aply_rvw_memo_len CHECK (char_length(rvw_memo_txt)  <= 500)
);

COMMENT ON TABLE  public.gthr_aply_rel               IS '모임 참가 신청. 승인(approved) 시에만 gthr_attd_rel 에 행이 생긴다.';
COMMENT ON COLUMN public.gthr_aply_rel.aply_st_cd    IS 'pending(대기) | approved(확정) | rejected(반려) | canceled(신청 취소·참가 취소)';
COMMENT ON COLUMN public.gthr_aply_rel.aply_memo_txt IS '신청자 한마디(입금자명 등, 선택, 200자 이내)';
COMMENT ON COLUMN public.gthr_aply_rel.rvw_by        IS '승인·반려를 처리한 사람(mem_mst FK)';
COMMENT ON COLUMN public.gthr_aply_rel.rvw_memo_txt  IS '반려 사유(선택, 500자 이내)';

-- 신청 관리 목록(모임별 · 상태별)
CREATE INDEX IF NOT EXISTS ix_gthr_aply_rel_gthr_st ON public.gthr_aply_rel(gthr_id, aply_st_cd);
-- 내 신청 조회
CREATE INDEX IF NOT EXISTS ix_gthr_aply_rel_mem     ON public.gthr_aply_rel(mem_id);

DROP TRIGGER IF EXISTS gthr_aply_rel_set_upd_at ON public.gthr_aply_rel;
CREATE TRIGGER gthr_aply_rel_set_upd_at
  BEFORE UPDATE ON public.gthr_aply_rel
  FOR EACH ROW EXECUTE FUNCTION public.set_v2_upd_at();

-- ============================================================
-- RLS — "떨어진 사람"이 공개되지 않게
--   SELECT: 본인 행 / 모임 개설자 / 팀 owner·admin 만.
--   그 외 팀원과 anon 은 차단한다. 확정 참가자 명단(gthr_attd_rel)은 지금처럼
--   팀 전체 공개 그대로다 — 비공개로 돌리는 건 대기·거절뿐이다.
--
--   INSERT/UPDATE/DELETE 정책은 두지 않는다. 쓰기는 전부 SECURITY DEFINER RPC 와
--   서버 액션(service_role)만 한다 — 참여조건 게이트를 PostgREST 직접 호출로
--   우회할 수 없게 하려는 것이다(gthr_attd_hist 와 같은 패턴).
-- ============================================================
ALTER TABLE public.gthr_aply_rel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gthr_aply_rel_select ON public.gthr_aply_rel;
CREATE POLICY gthr_aply_rel_select ON public.gthr_aply_rel
  FOR SELECT TO authenticated
  USING (
    mem_id = public.v2_rls_resolve_mem_id()
    OR EXISTS (
      SELECT 1
      FROM   public.gthr_mst g
      WHERE  g.gthr_id = gthr_aply_rel.gthr_id
        AND  g.del_yn  = false
        AND  (
          g.crt_by = public.v2_rls_resolve_mem_id()
          OR public.v2_rls_auth_team_owner_or_admin(g.team_id)
        )
    )
  );

-- ============================================================
-- REVERT (수동 롤백용)
-- ------------------------------------------------------------
-- DROP TABLE IF EXISTS public.gthr_aply_rel;
-- ============================================================
