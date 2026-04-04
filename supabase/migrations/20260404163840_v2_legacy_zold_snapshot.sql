-- 레거시(v1) 시점 스냅샷 (이전 방식): public.zold_*
-- 후속: `20260404164840_archive_old_snapshot_replace_zold.sql` 가 zold 를 제거하고 `archive.old_*` 로 이전한다.
-- 파일명 타임스탬프는 supabase-gigang-dev `schema_migrations`(MCP/대시보드 적용 시각)와 맞춤.
--
-- 네이밍: z → 객체 목록에서 이름순 하단으로 모으기, old → 과거 데이터 보존용.
-- FK: LIKE 로 복제 시 public.member / public.competition 을 가리키는 FK 가 그대로 붙는다.
--      원본 v1 테이블을 나중에 DROP 할 예정이므로, 데이터 적재 후 해당 FK 를 제거하고
--      zold_* 끼리만 참조하도록 재부착한다(원본 삭제 후에도 스냅샷이 자립).
--
-- 멱등: 테이블 IF NOT EXISTS, 행은 PK 기준 ON CONFLICT DO NOTHING.
--       FK 구간은 zold 전용 이름을 DROP IF EXISTS 후 ADD 로 재실행 안전.
-- RLS: 활성화 + 정책 없음 → anon/authenticated 차단(Supabase 에서 service_role 은 RLS 우회).

-- 의존 없는 테이블 먼저
CREATE TABLE IF NOT EXISTS public.zold_competition (LIKE public.competition INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.zold_member (LIKE public.member INCLUDING ALL);

CREATE TABLE IF NOT EXISTS public.zold_race_result (LIKE public.race_result INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.zold_competition_registration (LIKE public.competition_registration INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.zold_personal_best (LIKE public.personal_best INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.zold_utmb_profile (LIKE public.utmb_profile INCLUDING ALL);

INSERT INTO public.zold_competition SELECT * FROM public.competition ON CONFLICT (id) DO NOTHING;
INSERT INTO public.zold_member SELECT * FROM public.member ON CONFLICT (id) DO NOTHING;

INSERT INTO public.zold_race_result SELECT * FROM public.race_result ON CONFLICT (id) DO NOTHING;
INSERT INTO public.zold_competition_registration SELECT * FROM public.competition_registration ON CONFLICT (id) DO NOTHING;
INSERT INTO public.zold_personal_best SELECT * FROM public.personal_best ON CONFLICT (id) DO NOTHING;
INSERT INTO public.zold_utmb_profile SELECT * FROM public.utmb_profile ON CONFLICT (id) DO NOTHING;

-- LIKE 가 복사한 FK(→ public.member / public.competition) 제거 후 zold 간만 참조
-- 재실행: 우리가 붙인 제약도 먼저 제거한 뒤 다시 ADD
ALTER TABLE public.zold_race_result
  DROP CONSTRAINT IF EXISTS fk_zold_race_result__zold_member,
  DROP CONSTRAINT IF EXISTS race_result_member_id_fkey;

ALTER TABLE public.zold_competition_registration
  DROP CONSTRAINT IF EXISTS fk_zold_competition_registration__zold_competition,
  DROP CONSTRAINT IF EXISTS fk_zold_competition_registration__zold_member,
  DROP CONSTRAINT IF EXISTS competition_registration_competition_id_fkey,
  DROP CONSTRAINT IF EXISTS competition_registration_member_id_fkey;

ALTER TABLE public.zold_personal_best
  DROP CONSTRAINT IF EXISTS fk_zold_personal_best__zold_member,
  DROP CONSTRAINT IF EXISTS personal_best_member_id_fkey;

ALTER TABLE public.zold_utmb_profile
  DROP CONSTRAINT IF EXISTS fk_zold_utmb_profile__zold_member,
  DROP CONSTRAINT IF EXISTS utmb_profile_member_id_fkey;

ALTER TABLE public.zold_race_result
  ADD CONSTRAINT fk_zold_race_result__zold_member
  FOREIGN KEY (member_id) REFERENCES public.zold_member (id) ON DELETE RESTRICT;

ALTER TABLE public.zold_competition_registration
  ADD CONSTRAINT fk_zold_competition_registration__zold_competition
  FOREIGN KEY (competition_id) REFERENCES public.zold_competition (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_zold_competition_registration__zold_member
  FOREIGN KEY (member_id) REFERENCES public.zold_member (id) ON DELETE RESTRICT;

ALTER TABLE public.zold_personal_best
  ADD CONSTRAINT fk_zold_personal_best__zold_member
  FOREIGN KEY (member_id) REFERENCES public.zold_member (id) ON DELETE RESTRICT;

ALTER TABLE public.zold_utmb_profile
  ADD CONSTRAINT fk_zold_utmb_profile__zold_member
  FOREIGN KEY (member_id) REFERENCES public.zold_member (id) ON DELETE RESTRICT;

ALTER TABLE public.zold_competition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zold_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zold_race_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zold_competition_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zold_personal_best ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zold_utmb_profile ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.zold_competition FROM PUBLIC;
REVOKE ALL ON TABLE public.zold_member FROM PUBLIC;
REVOKE ALL ON TABLE public.zold_race_result FROM PUBLIC;
REVOKE ALL ON TABLE public.zold_competition_registration FROM PUBLIC;
REVOKE ALL ON TABLE public.zold_personal_best FROM PUBLIC;
REVOKE ALL ON TABLE public.zold_utmb_profile FROM PUBLIC;

REVOKE ALL ON TABLE public.zold_competition FROM anon, authenticated;
REVOKE ALL ON TABLE public.zold_member FROM anon, authenticated;
REVOKE ALL ON TABLE public.zold_race_result FROM anon, authenticated;
REVOKE ALL ON TABLE public.zold_competition_registration FROM anon, authenticated;
REVOKE ALL ON TABLE public.zold_personal_best FROM anon, authenticated;
REVOKE ALL ON TABLE public.zold_utmb_profile FROM anon, authenticated;

GRANT ALL ON TABLE public.zold_competition TO service_role;
GRANT ALL ON TABLE public.zold_member TO service_role;
GRANT ALL ON TABLE public.zold_race_result TO service_role;
GRANT ALL ON TABLE public.zold_competition_registration TO service_role;
GRANT ALL ON TABLE public.zold_personal_best TO service_role;
GRANT ALL ON TABLE public.zold_utmb_profile TO service_role;

COMMENT ON TABLE public.zold_competition IS 'v1 competition 시점 스냅샷. FK 는 zold_* 간만 참조(원본 v1 DROP 대비).';
COMMENT ON TABLE public.zold_member IS 'v1 member 시점 스냅샷. FK 는 zold_* 간만 참조(원본 v1 DROP 대비).';
COMMENT ON TABLE public.zold_race_result IS 'v1 race_result 시점 스냅샷.';
COMMENT ON TABLE public.zold_competition_registration IS 'v1 competition_registration 시점 스냅샷.';
COMMENT ON TABLE public.zold_personal_best IS 'v1 personal_best 시점 스냅샷.';
COMMENT ON TABLE public.zold_utmb_profile IS 'v1 utmb_profile 시점 스냅샷.';
