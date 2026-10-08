-- 겨울 10K PB 클래스 다듬기 — GitHub #577 (오너 지시 2026-10-07)
-- 설계 정본: docs/design/2026-10-07-겨울10K-PB클래스.md
--
-- 1. 마일리지런 참가자 보증금 할인 — 설정(evt_pb_cfg.mlg_dc_amt) + 신청 때 적용된 할인(evt_pb_prt_rel.deposit_dc_amt)
-- 2. 회차별 훈련표 — evt_pb_sess_plan (회원 화면이 「오늘 뭘 하나·왜 하나」를 보여 준다)
--
-- 이 파일엔 인덱스를 넣지 않는다 — evt_pb_sess_plan 은 PK (evt_id, sess_no) 하나로 읽고(프로젝트당 13행),
-- 할인 컬럼은 읽기 조건에 쓰이지 않는다.
SET lock_timeout = '3s';

-- 1-a. 설정: 마일리지런 참가자 보증금 할인액. 기본 5,000원 — 정식 신청이 4만 원이면 3.5만 원 보증금 + 1만 원 참가비.
ALTER TABLE public.evt_pb_cfg
  ADD COLUMN IF NOT EXISTS mlg_dc_amt integer NOT NULL DEFAULT 5000
    CONSTRAINT ck_evt_pb_cfg_mlg_dc_amt CHECK (mlg_dc_amt >= 0);
COMMENT ON COLUMN public.evt_pb_cfg.mlg_dc_amt IS
  '마일리지런 참가자 보증금 할인액(원) — 같은 팀 MILEAGE_RUN 에 승인 참가한 적 있는 멤버의 신청 보증금에서 깎는다';

-- 1-b. 참가자: 신청 때 적용된 할인. deposit_amt 는 할인 **뒤** 실제 보증금이라 환급 계산은 그대로 deposit_amt 를 쓴다.
--      이 컬럼은 화면 표시("5,000원 할인")와 감사용 — 환급 공식에는 들어가지 않는다.
ALTER TABLE public.evt_pb_prt_rel
  ADD COLUMN IF NOT EXISTS deposit_dc_amt integer NOT NULL DEFAULT 0
    CONSTRAINT ck_evt_pb_prt_rel_deposit_dc_amt CHECK (deposit_dc_amt >= 0);
COMMENT ON COLUMN public.evt_pb_prt_rel.deposit_dc_amt IS
  '신청 때 적용된 보증금 할인액(원, 마일리지런 참가자 할인). deposit_amt 는 할인 뒤 실제 보증금이다 — 표시·감사용';

-- 2. 회차별 훈련표 — sess_no 1..N-1 = 그 주차 공식훈련, N(= evt_pb_cfg.tot_sess_cnt) = 10K 측정
CREATE TABLE IF NOT EXISTS public.evt_pb_sess_plan (
  evt_id     uuid         NOT NULL REFERENCES public.evt_team_mst(evt_id) ON DELETE CASCADE,
  sess_no    smallint     NOT NULL CHECK (sess_no BETWEEN 1 AND 52),
  phase_nm   varchar(10)  NOT NULL,
  ttl        varchar(60)  NOT NULL,
  main_txt   text         NOT NULL,
  easy_txt   text,
  purp_txt   text         NOT NULL,
  note_txt   text,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (evt_id, sess_no),
  -- 서버 액션(zod)이 먼저 막지만 쓰기가 전부 service role 이라 DB 가 마지막 방어선이다 — 본문 폭주만 막는다
  CONSTRAINT ck_evt_pb_sess_plan_len CHECK (
    char_length(main_txt) <= 1000
    AND char_length(purp_txt) <= 1000
    AND (easy_txt IS NULL OR char_length(easy_txt) <= 1000)
    AND (note_txt IS NULL OR char_length(note_txt) <= 1000)
  )
);
COMMENT ON TABLE  public.evt_pb_sess_plan IS '겨울 PB 클래스 회차별 훈련표 — 프로젝트마다 관리자가 고친다(기본값은 앱 lib/pb-class-plan.ts)';
COMMENT ON COLUMN public.evt_pb_sess_plan.sess_no  IS '회차 번호. 1..N-1 = 그 주차 공식훈련, N(= tot_sess_cnt) = 10K 측정. 주차(wk_no)가 아니라 회차다';
COMMENT ON COLUMN public.evt_pb_sess_plan.phase_nm IS '단계 — 측정 · 기초 · 점검 · 강화 · 특화 · 마무리';
COMMENT ON COLUMN public.evt_pb_sess_plan.ttl      IS '제목 한 줄';
COMMENT ON COLUMN public.evt_pb_sess_plan.main_txt IS 'A~D 훈련팀 세션';
COMMENT ON COLUMN public.evt_pb_sess_plan.easy_txt IS 'E(첫 10K) 세션 — 같은 세션을 개수만 줄인 것. NULL 이면 A~D 와 같다';
COMMENT ON COLUMN public.evt_pb_sess_plan.purp_txt IS '이 훈련을 하는 이유';
COMMENT ON COLUMN public.evt_pb_sess_plan.note_txt IS '비고(팀 미션·행사 등)';

-- RLS — SELECT 는 같은 팀 멤버만, 쓰기 정책은 두지 않는다(모든 쓰기는 서버 액션의 service role).
ALTER TABLE public.evt_pb_sess_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evt_pb_sess_plan_select" ON public.evt_pb_sess_plan
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evt_team_mst e
    WHERE e.evt_id = evt_pb_sess_plan.evt_id AND public.v2_rls_auth_in_team(e.team_id)
  ));
