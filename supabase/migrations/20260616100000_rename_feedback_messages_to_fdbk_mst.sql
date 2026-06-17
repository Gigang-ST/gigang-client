-- 잔여 타입 정리 (이전 실패 시도로 생성된 것)
DROP TYPE IF EXISTS public.fdbk_stts_enm CASCADE;

-- 기존 테이블 의존성 제거 후 재생성
DROP TABLE IF EXISTS public.feedback_messages CASCADE;

-- enum 타입 생성
CREATE TYPE public.fdbk_stts_enm AS ENUM ('open', 'in_review', 'resolved', 'closed');

-- 테이블 재생성
CREATE TABLE public.fdbk_mst (
  fdbk_id     uuid                    NOT NULL DEFAULT gen_random_uuid(),
  mem_id      uuid                    NOT NULL,
  cont_txt    text                    NOT NULL,
  stts_enm    public.fdbk_stts_enm   NOT NULL DEFAULT 'open',
  adm_note_txt text,
  rspd_at     timestamptz,
  crt_at      timestamptz             NOT NULL DEFAULT now(),
  upd_at      timestamptz             NOT NULL DEFAULT now(),
  vers        integer                 NOT NULL DEFAULT 0,
  del_yn      boolean                 NOT NULL DEFAULT false,
  CONSTRAINT fdbk_mst_pkey PRIMARY KEY (fdbk_id)
);

-- 인덱스
CREATE INDEX idx_fdbk_mst_mem_crt
  ON public.fdbk_mst (mem_id, crt_at DESC)
  WHERE del_yn = false;

-- RLS
ALTER TABLE public.fdbk_mst ENABLE ROW LEVEL SECURITY;

CREATE POLICY fdbk_mst_select_own ON public.fdbk_mst
  FOR SELECT USING (mem_id = v2_rls_resolve_mem_id());

CREATE POLICY fdbk_mst_insert_self ON public.fdbk_mst
  FOR INSERT WITH CHECK (mem_id = v2_rls_resolve_mem_id());

-- upd_at 트리거
CREATE TRIGGER fdbk_mst_set_upd_at
  BEFORE UPDATE ON public.fdbk_mst
  FOR EACH ROW EXECUTE FUNCTION set_v2_upd_at();
