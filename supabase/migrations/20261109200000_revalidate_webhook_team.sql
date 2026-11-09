-- 멀티팀 — 캐시 무효화 웹훅에 팀을 싣는다.
--
-- 모임·참석·일정·댓글·게시글·대회 테이블에 쓰기가 일어나면 트리거(revalidate_records)가 앱 웹훅
-- (`/api/revalidate`)을 불러 캐시를 턴다. 지금까지는 **테이블 이름만** 보내서, 앱이 어느 팀 것인지 몰라
-- **모든 팀의** 캘린더·게시판 캐시를 털었다(울산에서 참석 한 번 → 기강 캘린더도 다시 계산).
-- 이제 그 행의 팀(`team_id`)을 같이 보내고, 앱은 그 팀 태그(`home-calendar:<팀>` 등)만 턴다.
--
-- 팀을 행에서 바로 못 읽는 테이블은 부모에서 찾는다:
--   gthr_attd_rel → gthr_mst.team_id,  comp_reg_rel → team_comp_plan_rel.team_id
-- 대회 원본(comp_mst)은 공용이라 팀이 없다 → 앱이 전부 턴다(지금과 같음).
-- 팀을 못 찾으면(부모가 이미 지워짐 등) team_id 없이 보내고, 앱은 전부 턴다 — 덜 터는 것보다 낫다.
--
-- 옛 앱 코드는 body 의 team_id 를 무시하고 지금처럼 전부 턴다 — 배포 순서와 무관하게 안전하다.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.revalidate_records()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions', 'vault'
AS $function$
DECLARE
  _secret text;
  _revalidate_url text;
  _row jsonb;
  _team_id uuid;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'revalidate_secret'
  LIMIT 1;

  SELECT decrypted_secret INTO _revalidate_url
  FROM vault.decrypted_secrets
  WHERE name = 'revalidate_url'
  LIMIT 1;

  IF _revalidate_url IS NULL THEN
    RAISE WARNING 'revalidate_records: revalidate_url not found in vault';
    RETURN NULL;
  END IF;

  -- 시크릿 누락 시 웹훅이 401로 조용히 실패하므로 원인 추적용 경고를 남기고 중단
  IF _secret IS NULL THEN
    RAISE WARNING 'revalidate_records: revalidate_secret not found in vault';
    RETURN NULL;
  END IF;

  -- 행 단위 트리거면 그 행의 팀을 찾는다(문장 단위 — archive 테이블 — 는 행이 없다)
  IF TG_LEVEL = 'ROW' THEN
    _row := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
    IF TG_TABLE_NAME = 'gthr_attd_rel' THEN
      SELECT g.team_id INTO _team_id FROM public.gthr_mst g WHERE g.gthr_id = (_row ->> 'gthr_id')::uuid;
    ELSIF TG_TABLE_NAME = 'comp_reg_rel' THEN
      SELECT t.team_id INTO _team_id FROM public.team_comp_plan_rel t WHERE t.team_comp_id = (_row ->> 'team_comp_id')::uuid;
    ELSIF _row ? 'team_id' THEN
      _team_id := (_row ->> 'team_id')::uuid;
    END IF;
  END IF;

  PERFORM net.http_post(
    url := _revalidate_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _secret
    ),
    body := jsonb_strip_nulls(jsonb_build_object('table', TG_TABLE_NAME, 'team_id', _team_id))
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'revalidate_records failed: %', SQLERRM;
  RETURN NULL;
END;
$function$;
