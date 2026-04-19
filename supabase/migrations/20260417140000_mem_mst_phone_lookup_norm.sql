-- 온보딩 전화번호 확인: mem_mst.phone_no 가 하이픈/+82 등으로 저장돼도
-- migration_v2_norm_phone(백필 P1)과 동일 규칙으로 매칭한다.
-- 주의: migration_v2_norm_phone 은 백필 완료 후 P6-P8 에서 DROP 되므로 여기서 재생성

CREATE OR REPLACE FUNCTION public.migration_v2_norm_phone(p_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  s text;
  d text;
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;
  s := replace(replace(replace(replace(replace(replace(btrim(p_input), chr(12288), ' '), ' ', ''), '(', ''), ')', ''), '-', ''), '.', '');
  IF s LIKE '+%' THEN
    s := substring(s FROM 2);
  END IF;
  d := regexp_replace(s, '[^0-9]', '', 'g');
  IF d = '' THEN
    RETURN NULL;
  END IF;
  IF length(d) >= 11 AND left(d, 2) = '82' AND substring(d FROM 3 FOR 1) <> '0' THEN
    d := '0' || substring(d FROM 3);
  END IF;
  RETURN d;
END;
$fn$;

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
