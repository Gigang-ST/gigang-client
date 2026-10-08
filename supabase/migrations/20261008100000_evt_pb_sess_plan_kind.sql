-- 겨울 10K PB 클래스 훈련표 v2 — 단계/목적 대신 훈련 종류, 주차별 개인 훈련 안내 (오너 지시 2026-10-08)
--
-- 1. trn_kind_cd  : 훈련 종류(기록 측정·스피드·업힐·역치·VO2max·레이스 페이스·파틀렉·테이퍼).
--                   회원 화면이 「단계」 배지 대신 종류 이름과 그 종류가 기르는 것을 보여 준다.
-- 2. self_trn_txt : 그 주 공식훈련 밖에서 각자 하는 개인 훈련 안내(읽기 전용 — 체크·기록 없음).
-- 3. phase_nm · purp_txt 삭제 : 목적 문장이 전부 "10K 단축"으로 읽혀 정보가 없었고, 종류 사전이 대신한다.
--
-- evt_pb_sess_plan 은 어제(20261007140000) 만든 테이블이라 prd 에는 아직 없다 — 컬럼 삭제로 잃는 운영 데이터가 없다.
-- (dev 에만 있고, 아래 백필 뒤 앱의 기본 훈련표로 다시 채운다.)
SET lock_timeout = '3s';

-- 1. 새 컬럼 — 기존 행 때문에 NOT NULL 은 백필 뒤에 건다
ALTER TABLE public.evt_pb_sess_plan
  ADD COLUMN IF NOT EXISTS trn_kind_cd  varchar(8),
  ADD COLUMN IF NOT EXISTS self_trn_txt text;

-- 2. 백필 — 기본 훈련표(lib/pb-class-plan.ts)의 회차별 종류. 목록 밖 회차(운영진이 늘린 경우)는 기록 측정으로 둔다
UPDATE public.evt_pb_sess_plan
SET trn_kind_cd = CASE sess_no
  WHEN 1  THEN 'TT'
  WHEN 2  THEN 'FART'
  WHEN 3  THEN 'HILL'
  WHEN 4  THEN 'SPD'
  WHEN 5  THEN 'THR'
  WHEN 6  THEN 'TT'
  WHEN 7  THEN 'VO2'
  WHEN 8  THEN 'THR'
  WHEN 9  THEN 'VO2'
  WHEN 10 THEN 'RACE'
  WHEN 11 THEN 'RACE'
  WHEN 12 THEN 'TAPER'
  WHEN 13 THEN 'TT'
  ELSE 'TT'
END
WHERE trn_kind_cd IS NULL;

ALTER TABLE public.evt_pb_sess_plan ALTER COLUMN trn_kind_cd SET NOT NULL;

-- 종류 코드는 앱 상수(PB_TRN_KIND_CDS)와 같은 목록 — 쓰기가 전부 service role 이라 DB 가 마지막 방어선이다
ALTER TABLE public.evt_pb_sess_plan
  ADD CONSTRAINT ck_evt_pb_sess_plan_kind
  CHECK (trn_kind_cd IN ('TT', 'SPD', 'HILL', 'THR', 'VO2', 'RACE', 'FART', 'TAPER'));

-- 3. 글자 수 제약 재작성 — 옛 제약이 purp_txt 를 참조하므로 컬럼을 지우기 전에 먼저 내린다
ALTER TABLE public.evt_pb_sess_plan DROP CONSTRAINT IF EXISTS ck_evt_pb_sess_plan_len;

ALTER TABLE public.evt_pb_sess_plan
  DROP COLUMN phase_nm,
  DROP COLUMN purp_txt;

ALTER TABLE public.evt_pb_sess_plan
  ADD CONSTRAINT ck_evt_pb_sess_plan_len CHECK (
    char_length(main_txt) <= 1000
    AND (easy_txt IS NULL OR char_length(easy_txt) <= 1000)
    AND (self_trn_txt IS NULL OR char_length(self_trn_txt) <= 1000)
    AND (note_txt IS NULL OR char_length(note_txt) <= 1000)
  );

COMMENT ON COLUMN public.evt_pb_sess_plan.trn_kind_cd  IS '훈련 종류 — TT 기록 측정 · SPD 스피드 · HILL 업힐 · THR 역치 · VO2 VO2max · RACE 레이스 페이스 · FART 파틀렉 · TAPER 테이퍼';
COMMENT ON COLUMN public.evt_pb_sess_plan.self_trn_txt IS '개인 훈련 안내 — 그 주 공식훈련 밖에서 각자 하는 훈련. 읽기 전용(출석으로 인정하지 않는다)';
COMMENT ON COLUMN public.evt_pb_sess_plan.main_txt     IS '38~50분 그룹 세션(훈련팀 A~D)';
COMMENT ON COLUMN public.evt_pb_sess_plan.easy_txt     IS '첫 10K 그룹 세션 — 같은 세션을 개수만 줄인 것. NULL 이면 다른 그룹과 같다';
COMMENT ON COLUMN public.evt_pb_sess_plan.note_txt     IS '비고(행사·주의사항 등)';
