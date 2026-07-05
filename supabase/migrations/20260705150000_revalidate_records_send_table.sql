-- revalidate_records() 웹훅 body에 변경 테이블명(TG_TABLE_NAME)을 포함.
-- /api/revalidate가 테이블 → 캐시 태그 매핑으로 관련 캐시만 무효화할 수 있게 한다.
-- (기존: 어느 테이블이 바뀌든 모든 태그 전체 무효화 → 참석 토글 1건에 랭킹 캐시까지 재구축)
-- 구버전 라우트는 body를 무시하므로 배포 순서와 무관하게 안전하다.

CREATE OR REPLACE FUNCTION public.revalidate_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'vault'
AS $$
DECLARE
  _secret text;
  _revalidate_url text;
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

  PERFORM net.http_post(
    url := _revalidate_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _secret
    ),
    body := jsonb_build_object('table', TG_TABLE_NAME)
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'revalidate_records failed: %', SQLERRM;
  RETURN NULL;
END;
$$;
