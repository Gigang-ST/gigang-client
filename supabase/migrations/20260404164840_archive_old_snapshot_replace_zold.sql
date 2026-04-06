-- public.zold_* 제거 → 스키마 archive + 테이블 old_* 로 v1 시점 스냅샷 재배치
-- 파일명 타임스탬프는 supabase-gigang-dev `schema_migrations`(MCP 적용 시각)와 맞춤.
-- 선행: 20260404163840 (zold) 가 적용된 DB 에서 본 파일이 zold 를 DROP 하고 archive 로 복제한다.
--       zold 가 없는 환경(신규 prd 등)에서도 DROP IF EXISTS 후 archive 만 생성·채움.
--
-- 네이밍: 스키마 archive = 보관 구역, 테이블 접두 old_ = v1 동일 엔터티의 스냅샷.
-- FK: archive.old_* 끼리만 참조(public v1 DROP 대비).
-- 멱등: CREATE IF NOT EXISTS, INSERT ON CONFLICT, FK 는 DROP IF EXISTS 후 ADD.

-- 기존 public 스냅샷(이전 방식) 제거
DROP TABLE IF EXISTS public.zold_utmb_profile CASCADE;
DROP TABLE IF EXISTS public.zold_personal_best CASCADE;
DROP TABLE IF EXISTS public.zold_competition_registration CASCADE;
DROP TABLE IF EXISTS public.zold_race_result CASCADE;
DROP TABLE IF EXISTS public.zold_member CASCADE;
DROP TABLE IF EXISTS public.zold_competition CASCADE;

CREATE SCHEMA IF NOT EXISTS archive;

COMMENT ON SCHEMA archive IS 'v1 public 테이블 시점 스냅샷. 앱은 기본적으로 사용하지 않음. 테이블명 old_*';

CREATE TABLE IF NOT EXISTS archive.old_competition (LIKE public.competition INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.old_member (LIKE public.member INCLUDING ALL);

CREATE TABLE IF NOT EXISTS archive.old_race_result (LIKE public.race_result INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.old_competition_registration (LIKE public.competition_registration INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.old_personal_best (LIKE public.personal_best INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.old_utmb_profile (LIKE public.utmb_profile INCLUDING ALL);

INSERT INTO archive.old_competition SELECT * FROM public.competition ON CONFLICT (id) DO NOTHING;
INSERT INTO archive.old_member SELECT * FROM public.member ON CONFLICT (id) DO NOTHING;

INSERT INTO archive.old_race_result SELECT * FROM public.race_result ON CONFLICT (id) DO NOTHING;
INSERT INTO archive.old_competition_registration SELECT * FROM public.competition_registration ON CONFLICT (id) DO NOTHING;
INSERT INTO archive.old_personal_best SELECT * FROM public.personal_best ON CONFLICT (id) DO NOTHING;
INSERT INTO archive.old_utmb_profile SELECT * FROM public.utmb_profile ON CONFLICT (id) DO NOTHING;

ALTER TABLE archive.old_race_result
  DROP CONSTRAINT IF EXISTS fk_archive_old_race_result__old_member,
  DROP CONSTRAINT IF EXISTS race_result_member_id_fkey;

ALTER TABLE archive.old_competition_registration
  DROP CONSTRAINT IF EXISTS fk_archive_old_comp_reg__old_competition,
  DROP CONSTRAINT IF EXISTS fk_archive_old_comp_reg__old_member,
  DROP CONSTRAINT IF EXISTS competition_registration_competition_id_fkey,
  DROP CONSTRAINT IF EXISTS competition_registration_member_id_fkey;

ALTER TABLE archive.old_personal_best
  DROP CONSTRAINT IF EXISTS fk_archive_old_personal_best__old_member,
  DROP CONSTRAINT IF EXISTS personal_best_member_id_fkey;

ALTER TABLE archive.old_utmb_profile
  DROP CONSTRAINT IF EXISTS fk_archive_old_utmb_profile__old_member,
  DROP CONSTRAINT IF EXISTS utmb_profile_member_id_fkey;

ALTER TABLE archive.old_race_result
  ADD CONSTRAINT fk_archive_old_race_result__old_member
  FOREIGN KEY (member_id) REFERENCES archive.old_member (id) ON DELETE RESTRICT;

ALTER TABLE archive.old_competition_registration
  ADD CONSTRAINT fk_archive_old_comp_reg__old_competition
  FOREIGN KEY (competition_id) REFERENCES archive.old_competition (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_archive_old_comp_reg__old_member
  FOREIGN KEY (member_id) REFERENCES archive.old_member (id) ON DELETE RESTRICT;

ALTER TABLE archive.old_personal_best
  ADD CONSTRAINT fk_archive_old_personal_best__old_member
  FOREIGN KEY (member_id) REFERENCES archive.old_member (id) ON DELETE RESTRICT;

ALTER TABLE archive.old_utmb_profile
  ADD CONSTRAINT fk_archive_old_utmb_profile__old_member
  FOREIGN KEY (member_id) REFERENCES archive.old_member (id) ON DELETE RESTRICT;

ALTER TABLE archive.old_competition ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.old_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.old_race_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.old_competition_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.old_personal_best ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive.old_utmb_profile ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA archive FROM PUBLIC;
GRANT USAGE ON SCHEMA archive TO service_role;

REVOKE ALL ON TABLE archive.old_competition FROM PUBLIC;
REVOKE ALL ON TABLE archive.old_member FROM PUBLIC;
REVOKE ALL ON TABLE archive.old_race_result FROM PUBLIC;
REVOKE ALL ON TABLE archive.old_competition_registration FROM PUBLIC;
REVOKE ALL ON TABLE archive.old_personal_best FROM PUBLIC;
REVOKE ALL ON TABLE archive.old_utmb_profile FROM PUBLIC;

REVOKE ALL ON TABLE archive.old_competition FROM anon, authenticated;
REVOKE ALL ON TABLE archive.old_member FROM anon, authenticated;
REVOKE ALL ON TABLE archive.old_race_result FROM anon, authenticated;
REVOKE ALL ON TABLE archive.old_competition_registration FROM anon, authenticated;
REVOKE ALL ON TABLE archive.old_personal_best FROM anon, authenticated;
REVOKE ALL ON TABLE archive.old_utmb_profile FROM anon, authenticated;

GRANT ALL ON TABLE archive.old_competition TO service_role;
GRANT ALL ON TABLE archive.old_member TO service_role;
GRANT ALL ON TABLE archive.old_race_result TO service_role;
GRANT ALL ON TABLE archive.old_competition_registration TO service_role;
GRANT ALL ON TABLE archive.old_personal_best TO service_role;
GRANT ALL ON TABLE archive.old_utmb_profile TO service_role;

COMMENT ON TABLE archive.old_competition IS 'v1 competition 시점 스냅샷 (archive 스키마).';
COMMENT ON TABLE archive.old_member IS 'v1 member 시점 스냅샷 (archive 스키마).';
COMMENT ON TABLE archive.old_race_result IS 'v1 race_result 시점 스냅샷.';
COMMENT ON TABLE archive.old_competition_registration IS 'v1 competition_registration 시점 스냅샷.';
COMMENT ON TABLE archive.old_personal_best IS 'v1 personal_best 시점 스냅샷.';
COMMENT ON TABLE archive.old_utmb_profile IS 'v1 utmb_profile 시점 스냅샷.';
