-- revalidate_records()를 net.http_post(pg_net, 비동기)로 통일.
-- 기존 dev는 extensions.http_post(http 확장, 동기)를 사용해 두 가지 문제가 있었다:
--   1. 트리거가 걸린 테이블의 모든 쓰기 트랜잭션이 HTTP 응답을 기다림 (수백 ms 지연)
--   2. pg_net만 설치된 환경(prd)에서는 함수가 조용히 실패 (EXCEPTION 핸들러가 삼킴)
-- prd는 이미 net.http_post를 사용 중이라 이 마이그레이션은 no-op.
-- pg_net은 요청을 큐에 쌓고 커밋 후 백그라운드 워커가 발송하므로 트랜잭션을 막지 않는다.

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
    body := '{}'::jsonb
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'revalidate_records failed: %', SQLERRM;
  RETURN NULL;
END;
$$;
