-- v2 백필 P0–P5: 팀·회원·대회·종목·team_comp_plan_rel
-- 후행: 20260404102309_v2_backfill_p6_p8.sql
-- 기준: database-schema-v2-migration-map.md §3.0(컬럼 점검)·§3.1–3.3
-- v2 upd_at 매핑: member·competition 은 coalesce(updated_at, created_at) (NULL updated_at 방어)

-- 기강 단일 크루 고정 팀 UUID (dev/prd 공통)
-- c0ffee00-0000-4000-8000-000000000001

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

CREATE OR REPLACE FUNCTION public.migration_v2_map_evt_cd(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(btrim(coalesce(p_raw, '')))
    WHEN '5K' THEN '5k'
    WHEN '10K' THEN '10k'
    WHEN 'HALF' THEN 'half'
    WHEN 'FULL' THEN 'full'
    WHEN '50K' THEN '50k'
    WHEN '100K' THEN '100k'
    WHEN '100M' THEN '100m'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.migration_v2_map_mem_st_cd(p_status public.member_status)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status::text
    WHEN 'active' THEN 'active'
    WHEN 'inactive' THEN 'inactive'
    WHEN 'pending' THEN 'pending'
    WHEN 'banned' THEN 'banned'
    ELSE NULL
  END;
$$;

INSERT INTO public.team_mst (team_id, team_cd, team_nm, vers, del_yn, crt_at, upd_at)
VALUES (
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  'gigang',
  '기강',
  0,
  false,
  now(),
  now()
)
ON CONFLICT (team_cd, vers) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_mst
    WHERE team_cd = 'gigang'
      AND vers = 0
      AND del_yn = false
      AND team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
  ) THEN
    RAISE EXCEPTION
      'team_mst: gigang 정본(team_cd=gigang, vers=0)이 없거나 team_id가 백필 상수(c0ffee00-0000-4000-8000-000000000001)와 다릅니다. 수동 정리 후 재실행하세요.';
  END IF;
END;
$$;

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
INNER JOIN auth.users u ON u.id = m.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.mem_mst mm
  WHERE mm.mem_id = m.id
    AND mm.vers = 0
    AND mm.del_yn = false
);

INSERT INTO public.team_mem_rel (
  team_id,
  mem_id,
  team_role_cd,
  mem_st_cd,
  join_dt,
  leave_dt,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  m.id,
  CASE WHEN m.admin THEN 'admin'::text ELSE 'member'::text END,
  coalesce(
    public.migration_v2_map_mem_st_cd(m.status),
    'pending'
  ),
  m.joined_at,
  NULL::date,
  0,
  false,
  m.created_at,
  coalesce(m.updated_at, m.created_at)
FROM public.member m
INNER JOIN auth.users u ON u.id = m.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.team_mem_rel t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.mem_id = m.id
    AND t.vers = 0
    AND t.del_yn = false
);

DO $$
DECLARE
  v_team constant uuid := 'c0ffee00-0000-4000-8000-000000000001'::uuid;
  n_owner integer;
  tid uuid;
BEGIN
  SELECT count(*) INTO n_owner
  FROM public.team_mem_rel
  WHERE team_id = v_team
    AND vers = 0
    AND del_yn = false
    AND team_role_cd = 'owner';

  IF n_owner = 0 THEN
    SELECT team_mem_id INTO tid
    FROM public.team_mem_rel
    WHERE team_id = v_team
      AND vers = 0
      AND del_yn = false
    ORDER BY CASE WHEN team_role_cd = 'admin' THEN 0 ELSE 1 END, crt_at
    LIMIT 1;

    IF tid IS NOT NULL THEN
      UPDATE public.team_mem_rel
      SET team_role_cd = 'owner', upd_at = now()
      WHERE team_mem_id = tid;
    END IF;
  END IF;
END;
$$;

INSERT INTO public.comp_mst (
  comp_id,
  comp_sprt_cd,
  comp_nm,
  stt_dt,
  end_dt,
  loc_nm,
  src_url,
  ext_id,
  vers,
  del_yn,
  crt_at,
  upd_at
)
SELECT
  c.id,
  CASE lower(btrim(coalesce(c.sport, '')))
    WHEN 'road' THEN 'road_run'
    WHEN 'road_run' THEN 'road_run'
    WHEN 'trail' THEN 'trail_run'
    WHEN 'trail_run' THEN 'trail_run'
    WHEN 'triathlon' THEN 'triathlon'
    WHEN 'cycling' THEN 'cycling'
    ELSE NULL
  END,
  c.title,
  c.start_date,
  c.end_date,
  c.location,
  c.source_url,
  c.external_id,
  0,
  false,
  c.created_at,
  coalesce(c.updated_at, c.created_at)
FROM public.competition c
WHERE NOT EXISTS (
  SELECT 1 FROM public.comp_mst x WHERE x.comp_id = c.id AND x.vers = 0
);

INSERT INTO public.comp_evt_cfg (comp_id, evt_cd, vers, del_yn, crt_at, upd_at)
SELECT DISTINCT
  c.id,
  public.migration_v2_map_evt_cd(et.raw_evt),
  0,
  false,
  c.created_at,
  coalesce(c.updated_at, c.created_at)
FROM public.competition c
CROSS JOIN LATERAL unnest(coalesce(c.event_types, array[]::text[])) AS et(raw_evt)
WHERE public.migration_v2_map_evt_cd(et.raw_evt) IS NOT NULL
ON CONFLICT (comp_id, evt_cd, vers) DO NOTHING;

INSERT INTO public.team_comp_plan_rel (team_id, comp_id, vers, del_yn, crt_at, upd_at)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  c.id,
  0,
  false,
  c.created_at,
  coalesce(c.updated_at, c.created_at)
FROM public.competition c
ON CONFLICT (team_id, comp_id, vers) DO NOTHING;
