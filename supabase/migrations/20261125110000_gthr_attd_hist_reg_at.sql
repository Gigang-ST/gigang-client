-- gthr_attd_hist.reg_at — 취소 이력에 "언제 신청했는지"를 함께 남긴다 (#758)
--
-- 배경: 참석 취소는 gthr_attd_rel 행을 지우고 gthr_attd_hist(cancel)를 append 한다. 취소 시각(evt_at)은
--   이미 남지만, 지운 행의 신청 시각(crt_at)은 같이 사라져 "언제 신청하고 언제 취소했는지"를 알 수 없었다.
--   노쇼 판단(모임 시작 전 취소 vs 시작 뒤 취소)에는 취소 시각이면 충분하고, 신청 시각은 보조 정보다.
--
-- 방식: cancel_gthr_attendance / cancel_gthr_application 두 RPC 를 다시 쓰지 않는다(여러 마이그레이션에
--   걸쳐 고쳐진 본문이라 복사하다 어긋나기 쉽다). 대신 rel DELETE 직전 트리거가 지울 행의 신청 시각을
--   **트랜잭션 로컬 설정**에 적어 두고, hist INSERT 직전 트리거가 같은 (모임, 회원)이면 reg_at 으로 옮긴다.
--   두 RPC 모두 "DELETE → INSERT" 순서라 같은 트랜잭션 안에서 맞물린다.
--   기존 행은 신청 시각을 복원할 수 없어 reg_at 이 NULL 로 남는다.

ALTER TABLE public.gthr_attd_hist ADD COLUMN IF NOT EXISTS reg_at timestamptz;

COMMENT ON COLUMN public.gthr_attd_hist.reg_at IS '취소된 참석의 원래 신청(참석 확정) 시각 — 취소 때 지워진 gthr_attd_rel.crt_at. 이 컬럼 도입 전 이력은 NULL.';

CREATE OR REPLACE FUNCTION public.gthr_attd_rel_stash_reg_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'app.gthr_attd_reg',
    OLD.gthr_id::text || '|' || OLD.mem_id::text || '|' || OLD.crt_at::text,
    true
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_gthr_attd_rel_stash_reg_at ON public.gthr_attd_rel;
CREATE TRIGGER trg_gthr_attd_rel_stash_reg_at
  BEFORE DELETE ON public.gthr_attd_rel
  FOR EACH ROW EXECUTE FUNCTION public.gthr_attd_rel_stash_reg_at();

CREATE OR REPLACE FUNCTION public.gthr_attd_hist_fill_reg_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_stash text := current_setting('app.gthr_attd_reg', true);
  v_parts text[];
BEGIN
  IF NEW.evt_cd = 'cancel' AND NEW.reg_at IS NULL AND v_stash IS NOT NULL AND v_stash <> '' THEN
    v_parts := string_to_array(v_stash, '|');
    IF array_length(v_parts, 1) = 3
       AND v_parts[1] = NEW.gthr_id::text
       AND v_parts[2] = NEW.mem_id::text THEN
      NEW.reg_at := v_parts[3]::timestamptz;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gthr_attd_hist_fill_reg_at ON public.gthr_attd_hist;
CREATE TRIGGER trg_gthr_attd_hist_fill_reg_at
  BEFORE INSERT ON public.gthr_attd_hist
  FOR EACH ROW EXECUTE FUNCTION public.gthr_attd_hist_fill_reg_at();

-- REVERT: DROP TRIGGER trg_gthr_attd_hist_fill_reg_at ON public.gthr_attd_hist;
--         DROP TRIGGER trg_gthr_attd_rel_stash_reg_at ON public.gthr_attd_rel;
--         DROP FUNCTION public.gthr_attd_hist_fill_reg_at(); DROP FUNCTION public.gthr_attd_rel_stash_reg_at();
--         ALTER TABLE public.gthr_attd_hist DROP COLUMN reg_at;
