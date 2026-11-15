-- post_mst 의 옛 목표 한마디 잔재 걷기 (#654) — pldg_txt 칸 · 그 칸의 길이 제약 · enum post_type_enm 의 'pledge' 값.
-- 목표 한마디는 #649(20261110109000_drop_pledge_message)에서 pldg_mst 째 지웠고, 이건 그보다 더 예전에
-- post_mst 로 합치려던 설계(docs/design/2026-07-23-기록자랑-포스트확장.md)의 흔적이다. 2026-11-11 확인:
-- prd 790행·dev 86행 전부 record_flex, pldg_txt 값 0건, 앱 코드에서 이 칸·값을 쓰는 곳 없음.
--
-- ⚠️ prd 는 25번(20261110109000_drop_pledge_message) **뒤에** 적용한다. 그 전엔 홈 피드 함수(get_team_story_feed)·
-- get_team_pledges 가 아직 pldg_txt 를 읽는데, LANGUAGE sql 함수라 DB 가 칸 의존을 추적하지 않는다 — 칸이 조용히
-- 지워지고 홈 피드가 다음 호출에서 터진다. 그래서 1) 에서 먼저 확인하고 아니면 멈춘다.
--
-- enum 값은 바로 못 지워서 새 타입으로 갈아 끼운다. 이 타입에 매인 건 post_mst.post_type_enm 칸 하나와 아래에서 먼저
-- 지우는 길이 제약뿐이다(인덱스·정책·뷰·함수 인자 없음). 함수들은 'record_flex' 를 따옴표 리터럴로만 쓰므로
-- 새 타입에서 그대로 풀린다. 칸 타입 변경은 테이블을 다시 쓰지만 790행이라 순간이다.
-- 여러 번 돌려도 안전하다(이미 걷혀 있으면 건너뛴다).

SET lock_timeout = '3s';

-- 1) 먼저 확인 — 25번이 빠졌거나, pledge 행이 남았거나, 이 칸·값을 읽는 함수가 있으면 아무것도 안 바꾸고 멈춘다
DO $$
DECLARE
  leftover text;
BEGIN
  IF to_regclass('public.pldg_mst') IS NOT NULL THEN
    RAISE EXCEPTION 'pldg_mst 가 아직 있다 — 20261110109000_drop_pledge_message(롤아웃 25번)부터 적용한다';
  END IF;

  SELECT string_agg(p.proname, ', ') INTO leftover
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND (p.prosrc ILIKE '%pldg_txt%' OR p.prosrc ILIKE '%''pledge''%');
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '아직 pldg_txt 나 ''pledge'' 를 쓰는 함수가 있다: % — 지우지 않는다', leftover;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.post_mst'::regclass AND attname = 'pldg_txt' AND NOT attisdropped
  ) THEN
    EXECUTE 'SELECT string_agg(post_id::text, '', '') FROM public.post_mst
             WHERE post_type_enm::text = ''pledge'' OR pldg_txt IS NOT NULL'
      INTO leftover;
  ELSE
    SELECT string_agg(post_id::text, ', ') INTO leftover
    FROM public.post_mst WHERE post_type_enm::text = 'pledge';
  END IF;
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '목표 한마디 행이 남아 있다(post_id: %) — 지우지 않는다', leftover;
  END IF;
END $$;

-- 2) 길이 제약 → 칸 (제약이 'pledge' 값과 pldg_txt 를 둘 다 물고 있어 먼저 뗀다)
ALTER TABLE public.post_mst DROP CONSTRAINT IF EXISTS ck_post_mst_pldg_txt_len;
ALTER TABLE public.post_mst DROP COLUMN IF EXISTS pldg_txt;

-- 3) enum 에서 'pledge' 빼기 — 옛 타입 이름 바꾸기 → 새 타입 → 칸 갈아 끼우기 → 옛 타입 지우기
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumtypid = 'public.post_type_enm'::regtype AND enumlabel = 'pledge'
  ) THEN
    RAISE NOTICE 'post_type_enm: 이미 pledge 가 빠져 있어 건너뜀';
    RETURN;
  END IF;

  ALTER TYPE public.post_type_enm RENAME TO post_type_enm_old;
  CREATE TYPE public.post_type_enm AS ENUM ('record_flex');
  ALTER TABLE public.post_mst
    ALTER COLUMN post_type_enm TYPE public.post_type_enm USING post_type_enm::text::public.post_type_enm;
  DROP TYPE public.post_type_enm_old; -- 남은 의존이 있으면 여기서 에러로 멈추고 전부 되돌아간다
END $$;

-- 4) 설명 정리
COMMENT ON TABLE public.post_mst IS '깅스타그램 포스트(record_flex) — 직접 올린 것(manual)과 마일리지런 유입분(mlg_auto)';
