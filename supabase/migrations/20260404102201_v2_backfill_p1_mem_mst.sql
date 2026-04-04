-- v2 백필 P1 전용: public.member → public.mem_mst (team_mem_rel 제외 → P2)
-- 적용 순서: 20260404102200 직후, 20260404102309 이전 (버전 번호로 정렬)
-- 기준: database-schema-v2-migration-map.md §3.1 A), §3.0
--
-- auth.users FK 해제 이유 (백필 정책):
-- - 웨이브2에서 mem_mst.mem_id → auth.users(id) FK 가 있으면, 로그인 계정이 없는 member 행은 mem_mst 에 넣을 수 없음.
-- - 운영(prd)에서는 가입 완료 회원 대부분이 auth 와 1:1이지만, dev 는 시드/레거시 member 만 있고 auth 행이 거의 없는 경우가 많음.
-- - 백필 단계에서는 **member 전원을 mem_mst 로 옮기고**, prd 컷오버 시점에 auth 정합·검증을 단계적으로 하는 것을 허용한다.
-- - 운영 안정화 후 필요하면 `ALTER TABLE mem_mst ADD CONSTRAINT fk_mem_mst__auth_users ... NOT VALID` → 검증 후 VALIDATE 로 FK 재부착 검토.
--
-- 멱등: 이미 정본(vers=0, del_yn=false)이 있으면 스킵
-- 주의: uk_mem_mst_email_addr_vers 등으로 동일 이메일 정본 충돌 시 INSERT 가 실패할 수 있음 → 데이터 정리 후 재실행

ALTER TABLE public.mem_mst
  DROP CONSTRAINT IF EXISTS fk_mem_mst__auth_users;

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

CREATE OR REPLACE FUNCTION public.migration_v2_norm_email(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    lower(btrim(replace(coalesce(p_input, ''), chr(12288), ' '))),
    ''
  );
$$;

COMMENT ON FUNCTION public.migration_v2_norm_phone(text) IS 'v2 백필: 전화번호 정규화 (migration-map §3.1)';
COMMENT ON FUNCTION public.migration_v2_norm_email(text) IS 'v2 백필: 이메일 정규화 lower(trim) (migration-map §3.1)';

INSERT INTO public.mem_mst (
  mem_id,
  mem_nm,
  gdr_enm,
  birth_dt,
  phone_no,
  email_addr,
  bank_nm,
  bank_acct_no,
  avatar_url,
  oauth_kakao_id,
  oauth_google_id,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  m.id,
  m.full_name::text,
  m.gender,
  m.birthday,
  public.migration_v2_norm_phone(m.phone::text),
  public.migration_v2_norm_email(m.email::text),
  nullif(btrim(coalesce(m.bank_name, '')), ''),
  nullif(
    regexp_replace(nullif(btrim(coalesce(m.bank_account, '')), ''), '[^0-9]', '', 'g'),
    ''
  ),
  m.avatar_url,
  m.kakao_user_id,
  m.google_user_id,
  0,
  false,
  m.created_at,
  coalesce(m.updated_at, m.created_at)
FROM public.member m
WHERE NOT EXISTS (
  SELECT 1
  FROM public.mem_mst mm
  WHERE mm.mem_id = m.id
    AND mm.vers = 0
    AND mm.del_yn = false
);

DO $$
DECLARE
  n_member bigint;
  n_auth bigint;
  n_mst bigint;
BEGIN
  SELECT count(*) INTO n_member FROM public.member;
  SELECT count(*) INTO n_auth FROM auth.users;
  SELECT count(*) INTO n_mst
  FROM public.mem_mst
  WHERE vers = 0 AND del_yn = false;

  RAISE NOTICE 'v2_backfill_p1: member_cnt=%, auth_users_cnt=%, mem_mst_canonical=%', n_member, n_auth, n_mst;
END;
$$;
