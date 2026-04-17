-- 온보딩 전화번호 확인: mem_mst.phone_no 가 하이픈/+82 등으로 저장돼도
-- migration_v2_norm_phone(백필 P1)과 동일 규칙으로 매칭한다.
-- 선행: public.migration_v2_norm_phone (20260404102201_v2_backfill_p1_mem_mst.sql)

CREATE OR REPLACE FUNCTION public.mem_mst_mem_ids_by_norm_phone(p_input text)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    array_agg(mem_id ORDER BY mem_id),
    '{}'::uuid[]
  )
  FROM (
    SELECT mm.mem_id
    FROM public.mem_mst mm
    WHERE mm.vers = 0
      AND mm.del_yn = false
      AND public.migration_v2_norm_phone(p_input) IS NOT NULL
      AND public.migration_v2_norm_phone(mm.phone_no) = public.migration_v2_norm_phone(p_input)
    LIMIT 3
  ) s;
$$;

COMMENT ON FUNCTION public.mem_mst_mem_ids_by_norm_phone(text) IS
  '온보딩: 전화번호 정규화 기준 mem_mst 정본 mem_id 목록(최대 3건, 중복·이상치 탐지용)';

REVOKE ALL ON FUNCTION public.mem_mst_mem_ids_by_norm_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mem_mst_mem_ids_by_norm_phone(text) TO service_role;
