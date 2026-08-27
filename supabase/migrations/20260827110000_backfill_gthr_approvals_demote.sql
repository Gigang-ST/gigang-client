-- 락 대기만 짧게 끊는다(실행 자체는 끝까지). supabase/migrations/README.md 체크리스트.
SET lock_timeout = '3s';

-- ============================================================
-- backfill_gthr_approvals — 참석자가 사라진 `approved` 신청을 함께 정리한다.
--   설계: docs/superpowers/specs/2026-08-25-모임-참여조건-승인제-design.md §8-3
--
-- 원래 이 함수는 gthr_attd_rel → gthr_aply_rel 한 방향만 채웠다. 그래서 이 경로가 뚫렸다:
--   승인제 켬(백필로 approved 생성) → 승인제 끔 → 본인이 **참석 토글로** 취소
--   (승인제가 꺼져 있으니 토글이 열려 있고, 그 경로는 aply 를 안 건드린다)
--   → 승인제 다시 켬 → aply 는 여전히 approved
-- 결과: 참석자 목록엔 없는데 신청 관리엔 "참가 확정"으로 뜨는 유령이 남는다. 게다가
-- 그 사람은 다시 신청할 수도 없다(applyToGathering 이 already_applied 로 막는다).
--
-- 그래서 양방향으로 맞춘다: 참석 있는데 신청 없음 → approved / 신청 approved 인데 참석 없음 → canceled.
-- 여전히 멱등하다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.backfill_gthr_approvals(
  p_gthr_id      uuid,
  p_team_id      uuid,
  p_actor_mem_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_up   int;
  v_down int;
BEGIN
  PERFORM 1 FROM public.gthr_mst
  WHERE  gthr_id = p_gthr_id AND team_id = p_team_id AND del_yn = false
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- ① 참석 중인데 신청이 없거나 확정이 아닌 사람 → approved
  INSERT INTO public.gthr_aply_rel (gthr_id, mem_id, aply_st_cd, rvw_by, rvw_at)
  SELECT ar.gthr_id, ar.mem_id, 'approved', p_actor_mem_id, now()
  FROM   public.gthr_attd_rel ar
  WHERE  ar.gthr_id = p_gthr_id
  ON CONFLICT (gthr_id, mem_id) DO UPDATE
    SET aply_st_cd   = 'approved',
        rvw_by       = EXCLUDED.rvw_by,
        rvw_at       = EXCLUDED.rvw_at,
        rvw_memo_txt = NULL
    WHERE gthr_aply_rel.aply_st_cd <> 'approved';
  GET DIAGNOSTICS v_up = ROW_COUNT;

  -- ② 확정으로 남아 있는데 참석자에 없는 사람 → canceled (유령 정리)
  UPDATE public.gthr_aply_rel a
  SET    aply_st_cd = 'canceled',
         rvw_by     = p_actor_mem_id,
         rvw_at     = now()
  WHERE  a.gthr_id = p_gthr_id
    AND  a.aply_st_cd = 'approved'
    AND  NOT EXISTS (
      SELECT 1 FROM public.gthr_attd_rel ar
      WHERE ar.gthr_id = a.gthr_id AND ar.mem_id = a.mem_id
    );
  GET DIAGNOSTICS v_down = ROW_COUNT;

  RETURN v_up + v_down;
END;
$$;

COMMENT ON FUNCTION public.backfill_gthr_approvals(uuid, uuid, uuid)
  IS '모임의 gthr_attd_rel ↔ gthr_aply_rel 을 양방향으로 맞춘다(멱등): 참석 있으면 approved, 확정인데 참석 없으면 canceled. 승인제 켜기·개설자 자동참석 뒤에 호출. service_role 전용.';

REVOKE ALL ON FUNCTION public.backfill_gthr_approvals(uuid, uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.backfill_gthr_approvals(uuid, uuid, uuid) TO service_role;
