-- 회원별 intervals.icu 연결(#760) — 개인 API 키로 활동 요약을 받아 DB에 저장한다.
--
-- 목적: 기록을 올리고·인증하고·서로 보여 주며 대화가 생기는지 보는 시험(게이미피케이션).
-- 이번 범위는 연결·저장·조회뿐이다 — 프로젝트(마일리지 등)·대회 기록 자동 반영은 없다.
--
-- 두 테이블:
--   mem_icu_cnn_rel  연결 한 건(회원당 1행). API 키는 **앱에서 AES-256-GCM 으로 암호화한 값만** 담는다.
--                    authenticated/anon 에는 아무 권한도 안 준다 — 키(암호문 포함)는 서버(service_role)만 읽는다.
--   mem_icu_act_hist 활동 요약. 날짜·종목·거리·시간·평균 속도만 — 경로·심박 원본은 가져오지도 저장하지도 않는다.
--
-- 연결 해제 = 두 테이블의 행을 지운다(키 폐기 + 가져온 요약 삭제). 소프트 삭제를 쓰지 않는 이유다.
-- 적용 순서: 이 마이그레이션 → 앱 배포(환경변수 INTERVALS_KEY_SECRET 먼저 설정). 옛 앱은 이 테이블을 모른다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.mem_icu_cnn_rel (
  mem_id         uuid        NOT NULL,
  team_id        uuid        NOT NULL,
  api_key_enc    text        NOT NULL,                 -- 암호문 v1:<iv>:<tag>:<ct> (base64). 평문 키는 어디에도 없다
  cnn_stts_cd    varchar     NOT NULL DEFAULT 'ok',    -- ok 정상 / auth_failed 키 거부(다시 연결 필요) / error 일시 오류
  last_sync_at   timestamptz,                          -- 마지막으로 동기화를 시도한 시각
  last_ok_at     timestamptz,                          -- 마지막으로 성공한 시각
  crt_at         timestamptz NOT NULL DEFAULT now(),
  upd_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_mem_icu_cnn_rel PRIMARY KEY (mem_id),
  CONSTRAINT fk_mem_icu_cnn_rel__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE CASCADE,
  CONSTRAINT fk_mem_icu_cnn_rel__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT ck_mem_icu_cnn_rel_stts CHECK (cnn_stts_cd IN ('ok', 'auth_failed', 'error'))
);

CREATE INDEX IF NOT EXISTS ix_mem_icu_cnn_rel_team ON public.mem_icu_cnn_rel (team_id);

CREATE TRIGGER mem_icu_cnn_rel_set_upd_at
  BEFORE UPDATE ON public.mem_icu_cnn_rel
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.mem_icu_cnn_rel IS 'intervals.icu 연결(#760) — 회원당 1행. api_key_enc 는 앱에서 암호화한 값이며 화면·로그·MCP 로 나가지 않는다';
COMMENT ON COLUMN public.mem_icu_cnn_rel.api_key_enc IS '개인 API 키 암호문(AES-256-GCM). 서버 전용 — authenticated 권한 없음';

ALTER TABLE public.mem_icu_cnn_rel ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mem_icu_cnn_rel FROM anon, authenticated;
GRANT ALL ON TABLE public.mem_icu_cnn_rel TO service_role;

CREATE TABLE IF NOT EXISTS public.mem_icu_act_hist (
  icu_act_id   varchar     NOT NULL,                   -- intervals.icu 활동 id (회원 안에서 유일)
  mem_id       uuid        NOT NULL,
  team_id      uuid        NOT NULL,
  act_dt       date        NOT NULL,                   -- 활동 날짜(intervals.icu 가 준 현지 날짜 그대로)
  sprt_type_nm varchar     NOT NULL,                   -- intervals.icu 종목 (Run·TrailRun·Ride·Swim …)
  dst_m        numeric,                                -- 거리(m). 거리 없는 운동은 NULL
  mov_sec      integer,                                -- 움직인 시간(초)
  avg_spd_mps  numeric,                                -- 평균 속도(m/s). 페이스는 앱이 계산한다
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_mem_icu_act_hist PRIMARY KEY (mem_id, icu_act_id),
  CONSTRAINT fk_mem_icu_act_hist__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE CASCADE,
  CONSTRAINT fk_mem_icu_act_hist__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_mem_icu_act_hist_team_dt ON public.mem_icu_act_hist (team_id, act_dt DESC);
CREATE INDEX IF NOT EXISTS ix_mem_icu_act_hist_mem_dt ON public.mem_icu_act_hist (mem_id, act_dt DESC);

CREATE TRIGGER mem_icu_act_hist_set_upd_at
  BEFORE UPDATE ON public.mem_icu_act_hist
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_upd_at();

COMMENT ON TABLE public.mem_icu_act_hist IS 'intervals.icu 활동 요약(#760) — 날짜·종목·거리·시간·평균 속도만. 경로·심박 원본은 저장하지 않는다';

ALTER TABLE public.mem_icu_act_hist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mem_icu_act_hist FROM anon, authenticated;

-- 쓰기·운영진 조회는 서버(service_role: 크론·서버 액션·운영 MCP)만. 본인은 자기 요약만 읽는다.
DROP POLICY IF EXISTS mem_icu_act_hist_select_own ON public.mem_icu_act_hist;
CREATE POLICY mem_icu_act_hist_select_own ON public.mem_icu_act_hist
  FOR SELECT TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id());

GRANT ALL ON TABLE public.mem_icu_act_hist TO service_role;
GRANT SELECT ON TABLE public.mem_icu_act_hist TO authenticated;

-- 하루 한 번 동기화 — 배치 레지스트리에 등록한다(핸들러 INTERVALS_SYNC 는 lib/batch/execute.ts 에 같이 들어간다).
INSERT INTO batch_job_mst (job_nm, job_cd, job_desc, freq_cd, team_id, param_schema_json)
SELECT
  'intervals.icu 활동 동기화 (일 배치)',
  'INTERVALS_SYNC',
  '연결한 회원의 intervals.icu 활동 요약(날짜·종목·거리·시간·페이스)을 최근 60일 범위로 다시 받아 저장합니다. 경로·심박 원본은 받지 않습니다.',
  'daily',
  (SELECT team_id FROM team_mst WHERE team_cd = 'gigang' AND del_yn = false LIMIT 1),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM batch_job_mst WHERE job_cd = 'INTERVALS_SYNC');
