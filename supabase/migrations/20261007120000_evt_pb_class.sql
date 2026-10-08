-- 겨울 10K PB 클래스 1단계(모집·출석·환급) — GitHub #577
-- 설계 정본: docs/design/2026-10-07-겨울10K-PB클래스.md
--
-- 프로젝트 자체(evt_team_mst)는 마일리지런과 공유하고, 참가자는 evt_pb_prt_rel 로 가른다.
-- evt_team_prt_rel 을 타입 구분 없이 읽는 곳(칭호 mileage_joined·칭호 스냅샷·MCP 참가 해석)이
-- 이미 여럿이라, 같은 테이블에 PB 행을 섞으면 그 전부가 타입 필터를 기억해야 한다.
-- 이 파일엔 인덱스를 넣지 않는다(CONCURRENTLY 는 트랜잭션 밖 — 20261007120100_evt_pb_class_idx.sql).
SET lock_timeout = '3s';

-- 1. evt_pb_cfg: 프로젝트별 설정 — 숫자는 전부 관리자 설정값이고 기본값은 이슈 확정 규칙
CREATE TABLE IF NOT EXISTS public.evt_pb_cfg (
  evt_id             uuid        PRIMARY KEY REFERENCES public.evt_team_mst(evt_id) ON DELETE CASCADE,
  tot_sess_cnt       smallint    NOT NULL DEFAULT 13    CHECK (tot_sess_cnt BETWEEN 1 AND 52),
  full_rfnd_attd_cnt smallint    NOT NULL DEFAULT 9     CHECK (full_rfnd_attd_cnt >= 1),
  late_join_wk_no    smallint    NOT NULL DEFAULT 6     CHECK (late_join_wk_no >= 2),
  deposit_amt        integer     NOT NULL DEFAULT 30000 CHECK (deposit_amt >= 0),
  entry_fee_amt      integer     NOT NULL DEFAULT 10000 CHECK (entry_fee_amt >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- 전액 환급 기준이 총 회차보다 크면 아무도 전액을 못 받는다
  CONSTRAINT ck_evt_pb_cfg_full_le_tot CHECK (full_rfnd_attd_cnt <= tot_sess_cnt)
);
COMMENT ON TABLE  public.evt_pb_cfg IS '겨울 PB 클래스 프로젝트별 설정(환급 규칙 숫자)';
COMMENT ON COLUMN public.evt_pb_cfg.tot_sess_cnt       IS '보증금 출석 총 회차 (공식훈련 12 + 측정 1 = 13)';
COMMENT ON COLUMN public.evt_pb_cfg.full_rfnd_attd_cnt IS '정식 참가자의 전액 환급 기준 출석 수 (총 회차 이하)';
COMMENT ON COLUMN public.evt_pb_cfg.late_join_wk_no    IS '이 주차부터 합류하면 보증금 없이 참가비만 납부 (환급 없음)';
COMMENT ON COLUMN public.evt_pb_cfg.deposit_amt        IS '정식·늦지 않은 합류자의 보증금(원)';
COMMENT ON COLUMN public.evt_pb_cfg.entry_fee_amt      IS '참가비(원) — 돌려주지 않는다';

-- 2. evt_pb_prt_rel: 참가자 — 환급 계산은 이 행의 deposit_amt(실제 낸 금액)로 한다
CREATE TABLE IF NOT EXISTS public.evt_pb_prt_rel (
  prt_id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evt_id        uuid        NOT NULL REFERENCES public.evt_team_mst(evt_id) ON DELETE CASCADE,
  mem_id        uuid        NOT NULL REFERENCES public.mem_mst(mem_id),
  join_wk_no    smallint    NOT NULL DEFAULT 1 CHECK (join_wk_no >= 1),
  deposit_amt   integer     NOT NULL CHECK (deposit_amt >= 0),
  entry_fee_amt integer     NOT NULL CHECK (entry_fee_amt >= 0),
  aprv_yn       boolean     NOT NULL DEFAULT false,
  aprv_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_evt_pb_prt_rel UNIQUE (evt_id, mem_id)
);
COMMENT ON TABLE  public.evt_pb_prt_rel IS '겨울 PB 클래스 참가자 (마일리지 evt_team_prt_rel 과 분리)';
COMMENT ON COLUMN public.evt_pb_prt_rel.join_wk_no    IS '합류 주차 (1 = 정식 참가). 합류 전 주차 출석은 환급에 세지 않는다';
COMMENT ON COLUMN public.evt_pb_prt_rel.deposit_amt   IS '실제 낸 보증금(원) — 늦은 합류자는 0';
COMMENT ON COLUMN public.evt_pb_prt_rel.entry_fee_amt IS '실제 낸 참가비(원)';
COMMENT ON COLUMN public.evt_pb_prt_rel.aprv_yn       IS '운영진 입금확인 승인 여부';
COMMENT ON COLUMN public.evt_pb_prt_rel.aprv_at       IS '승인 시각';

-- 3. evt_gthr_rel: 공식훈련·측정 벙 연결 — 출석은 그 벙의 gthr_attd_rel 을 세서 낸다
CREATE TABLE IF NOT EXISTS public.evt_gthr_rel (
  gthr_id      uuid        PRIMARY KEY REFERENCES public.gthr_mst(gthr_id) ON DELETE CASCADE,
  evt_id       uuid        NOT NULL REFERENCES public.evt_team_mst(evt_id) ON DELETE CASCADE,
  wk_no        smallint    NOT NULL CHECK (wk_no >= 1),
  sess_type_cd varchar(10) NOT NULL CHECK (sess_type_cd IN ('TRAINING', 'MEASURE')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_evt_gthr_rel_evt_wk UNIQUE (evt_id, wk_no)
);
COMMENT ON TABLE  public.evt_gthr_rel IS '프로젝트에 공식훈련·측정으로 연결된 벙 (벙 하나는 프로젝트 하나에만)';
COMMENT ON COLUMN public.evt_gthr_rel.gthr_id      IS '연결된 벙 — PK라 한 벙이 두 프로젝트에 걸리지 않는다';
COMMENT ON COLUMN public.evt_gthr_rel.wk_no        IS '주차(서버가 벙 stt_at 에서 계산해 저장). 회차가 아니다 — 측정을 W14에 하면 13번째 회차가 wk_no=14';
COMMENT ON COLUMN public.evt_gthr_rel.sess_type_cd IS 'TRAINING(공식훈련) | MEASURE(10K 측정)';

-- RLS — SELECT 는 같은 팀 멤버만, 쓰기 정책은 두지 않는다(모든 쓰기는 서버 액션의 service role).
-- 마일리지 테이블의 USING (true)(전 팀 공개)는 따르지 않는다.
ALTER TABLE public.evt_pb_cfg     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_pb_prt_rel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_gthr_rel   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evt_pb_cfg_select" ON public.evt_pb_cfg
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evt_team_mst e
    WHERE e.evt_id = evt_pb_cfg.evt_id AND public.v2_rls_auth_in_team(e.team_id)
  ));

CREATE POLICY "evt_pb_prt_rel_select" ON public.evt_pb_prt_rel
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evt_team_mst e
    WHERE e.evt_id = evt_pb_prt_rel.evt_id AND public.v2_rls_auth_in_team(e.team_id)
  ));

CREATE POLICY "evt_gthr_rel_select" ON public.evt_gthr_rel
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evt_team_mst e
    WHERE e.evt_id = evt_gthr_rel.evt_id AND public.v2_rls_auth_in_team(e.team_id)
  ));
