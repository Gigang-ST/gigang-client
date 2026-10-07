-- 겨울 10K PB 클래스 2·3단계(팀·목표·기록·점수판) — GitHub #577
-- 설계 정본: docs/design/2026-10-07-겨울10K-PB클래스.md
--
-- 점수는 저장하지 않는다 — 벙·참석·기록·미션 판정에서 매번 다시 계산한다(lib/pb-class-score.ts).
-- 그래서 장부 테이블 없이 「원천」만 둔다: 게임팀·측정 기록·팀 미션과 그 성공 여부.
-- 이 파일엔 인덱스를 넣지 않는다(CONCURRENTLY 는 트랜잭션 밖 — 20261007130100_evt_pb_class_game_idx.sql).
SET lock_timeout = '3s';

-- 1. evt_pb_cfg.rule_json: 배점·목표 규칙 — 비어 있어도 앱이 기본값(PB_DEFAULT_RULE)으로 채운다
ALTER TABLE public.evt_pb_cfg
  ADD COLUMN IF NOT EXISTS rule_json jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.evt_pb_cfg.rule_json IS '배점·목표 규칙(JSON) — 빠진 키는 앱이 기본값으로 채운다(lib/pb-class-score.ts ruleFromJson)';

-- 2. evt_pb_grp_mst: 게임팀(점수를 겨루는 팀) — 훈련팀 A~E 와는 별개의 축이다
CREATE TABLE IF NOT EXISTS public.evt_pb_grp_mst (
  grp_id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evt_id     uuid        NOT NULL REFERENCES public.evt_team_mst(evt_id) ON DELETE CASCADE,
  grp_nm     varchar(30) NOT NULL,
  -- 팀 색은 디자인 토큰 번호만 저장한다(bg-chart-N). 색값을 DB 에 박지 않는다
  color_no   smallint    CHECK (color_no BETWEEN 1 AND 5),
  sort_ord   smallint    NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_evt_pb_grp_mst_nm UNIQUE (evt_id, grp_nm)
);
COMMENT ON TABLE  public.evt_pb_grp_mst IS '겨울 PB 클래스 게임팀(점수 겨루는 팀)';
COMMENT ON COLUMN public.evt_pb_grp_mst.color_no IS '팀 색 번호 1~5 (bg-chart-N 토큰). 미지정 가능';
COMMENT ON COLUMN public.evt_pb_grp_mst.sort_ord IS '표시 순서(작을수록 먼저)';

-- 3. evt_pb_prt_rel: 훈련팀·게임팀·개인 목표
ALTER TABLE public.evt_pb_prt_rel
  ADD COLUMN IF NOT EXISTS trn_grp_cd varchar(10),
  ADD COLUMN IF NOT EXISTS grp_id     uuid REFERENCES public.evt_pb_grp_mst(grp_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goal_sec   integer CHECK (goal_sec BETWEEN 1200 AND 7200);
COMMENT ON COLUMN public.evt_pb_prt_rel.trn_grp_cd IS '훈련팀 코드(A~E 등 짧은 문자) — 훈련 편성용, 점수와 무관';
COMMENT ON COLUMN public.evt_pb_prt_rel.grp_id     IS '게임팀 — 팀이 지워지면 미배정으로 돌아간다';
COMMENT ON COLUMN public.evt_pb_prt_rel.goal_sec   IS '개인 10K 목표(초). 20분~120분 — 실제 상한은 규칙(rule_json goalMaxSec)이 더 좁힌다';

-- 4. evt_pb_rec_hist: 측정 기록(5K 기준·5K 중간·10K 최종·대구 10K) — 종류당 1건
CREATE TABLE IF NOT EXISTS public.evt_pb_rec_hist (
  rec_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prt_id      uuid        NOT NULL REFERENCES public.evt_pb_prt_rel(prt_id) ON DELETE CASCADE,
  rec_type_cd varchar(12) NOT NULL CHECK (rec_type_cd IN ('BASE_5K', 'MID_5K', 'FINAL_10K', 'DAEGU_10K')),
  rec_sec     integer     NOT NULL CHECK (rec_sec > 0 AND rec_sec < 21600),
  -- 관리자가 넣은 기록은 true. 본인이 올린 대구 기록은 false 로 들어와 관리자가 확인해야 점수에 반영된다
  cnfm_yn     boolean     NOT NULL DEFAULT true,
  crt_by      uuid        REFERENCES public.mem_mst(mem_id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_evt_pb_rec_hist UNIQUE (prt_id, rec_type_cd)
);
COMMENT ON TABLE  public.evt_pb_rec_hist IS '겨울 PB 클래스 측정 기록 — 참가자당 종류별 1건';
COMMENT ON COLUMN public.evt_pb_rec_hist.rec_type_cd IS 'BASE_5K(W1 기준) | MID_5K(중간점검) | FINAL_10K(최종 측정) | DAEGU_10K(대구마라톤 10K)';
COMMENT ON COLUMN public.evt_pb_rec_hist.rec_sec IS '기록(초). 6시간 미만';
COMMENT ON COLUMN public.evt_pb_rec_hist.cnfm_yn IS '운영진 확인 여부 — false 면 점수·달성 판정에 쓰지 않는다';
COMMENT ON COLUMN public.evt_pb_rec_hist.crt_by IS '입력한 사람(본인 또는 관리자)';

-- 5. evt_pb_msn_mst: 팀 미션 — 관리자가 정의하고 팀별 성공 여부를 체크한다
CREATE TABLE IF NOT EXISTS public.evt_pb_msn_mst (
  msn_id     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  evt_id     uuid         NOT NULL REFERENCES public.evt_team_mst(evt_id) ON DELETE CASCADE,
  wk_no      smallint     CHECK (wk_no >= 1),
  msn_nm     varchar(100) NOT NULL,
  pt         integer      NOT NULL CHECK (pt >= 0),
  sort_ord   smallint     NOT NULL DEFAULT 0,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE  public.evt_pb_msn_mst IS '겨울 PB 클래스 팀 미션';
COMMENT ON COLUMN public.evt_pb_msn_mst.wk_no IS '미션 주차. NULL 이면 주차 없는 미션(예: 측정 일정 전원 완주)';

-- 6. evt_pb_msn_rslt_rel: 미션 성공 — 행이 있으면 성공, 없으면 미달성
CREATE TABLE IF NOT EXISTS public.evt_pb_msn_rslt_rel (
  msn_id     uuid        NOT NULL REFERENCES public.evt_pb_msn_mst(msn_id) ON DELETE CASCADE,
  grp_id     uuid        NOT NULL REFERENCES public.evt_pb_grp_mst(grp_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (msn_id, grp_id)
);
COMMENT ON TABLE public.evt_pb_msn_rslt_rel IS '팀 미션 성공 기록 — 행 = 성공(실패는 행이 없다)';

-- RLS — SELECT 는 같은 팀 멤버만, 쓰기 정책은 두지 않는다(모든 쓰기는 서버 액션의 service role)
ALTER TABLE public.evt_pb_grp_mst      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_pb_rec_hist     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_pb_msn_mst      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evt_pb_msn_rslt_rel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evt_pb_grp_mst_select" ON public.evt_pb_grp_mst
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evt_team_mst e
    WHERE e.evt_id = evt_pb_grp_mst.evt_id AND public.v2_rls_auth_in_team(e.team_id)
  ));

CREATE POLICY "evt_pb_rec_hist_select" ON public.evt_pb_rec_hist
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.evt_pb_prt_rel p
    JOIN public.evt_team_mst e ON e.evt_id = p.evt_id
    WHERE p.prt_id = evt_pb_rec_hist.prt_id AND public.v2_rls_auth_in_team(e.team_id)
  ));

CREATE POLICY "evt_pb_msn_mst_select" ON public.evt_pb_msn_mst
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evt_team_mst e
    WHERE e.evt_id = evt_pb_msn_mst.evt_id AND public.v2_rls_auth_in_team(e.team_id)
  ));

CREATE POLICY "evt_pb_msn_rslt_rel_select" ON public.evt_pb_msn_rslt_rel
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.evt_pb_msn_mst m
    JOIN public.evt_team_mst e ON e.evt_id = m.evt_id
    WHERE m.msn_id = evt_pb_msn_rslt_rel.msn_id AND public.v2_rls_auth_in_team(e.team_id)
  ));
