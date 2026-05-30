-- batch_job_mst: 배치 정의 테이블
CREATE TABLE batch_job_mst (
  job_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_nm             VARCHAR NOT NULL,
  job_cd             VARCHAR NOT NULL UNIQUE,
  job_desc           TEXT,
  cron_expr          VARCHAR,         -- 자동화 예정용 cron 표현식 (현재 null)
  param_schema_json  JSONB,           -- UI 폼 동적 렌더링용 파라미터 스키마
  use_yn             BOOLEAN NOT NULL DEFAULT true,
  crt_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  upd_at             TIMESTAMPTZ
);

-- batch_run_hist: 배치 실행 이력 테이블
CREATE TABLE batch_run_hist (
  run_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES batch_job_mst(job_id),
  trig_type    VARCHAR NOT NULL CHECK (trig_type IN ('manual', 'auto')),
  trig_by      VARCHAR REFERENCES mem_mst(mem_id),
  param_json   JSONB,
  status       VARCHAR NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  result_msg   TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INTEGER
);

CREATE INDEX idx_batch_run_hist_job_id ON batch_run_hist(job_id, started_at DESC);

-- RLS
ALTER TABLE batch_job_mst ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_run_hist ENABLE ROW LEVEL SECURITY;

-- 관리자만 읽기/쓰기 (service_role은 RLS 우회)
CREATE POLICY "admin_all_batch_job_mst" ON batch_job_mst
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM team_mem_rel tmr
      JOIN mem_mst m ON m.mem_id = tmr.mem_id
      WHERE tmr.mem_id = (SELECT mem_id FROM mem_mst WHERE auth_uid = auth.uid() LIMIT 1)
        AND tmr.role_cd = 'ADMIN'
        AND tmr.vers = 0 AND tmr.del_yn = false
    )
  );

CREATE POLICY "admin_all_batch_run_hist" ON batch_run_hist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM team_mem_rel tmr
      WHERE tmr.mem_id = (SELECT mem_id FROM mem_mst WHERE auth_uid = auth.uid() LIMIT 1)
        AND tmr.role_cd = 'ADMIN'
        AND tmr.vers = 0 AND tmr.del_yn = false
    )
  );

-- 초기 데이터: 마일리지런 칭호 배치
INSERT INTO batch_job_mst (job_nm, job_cd, job_desc, cron_expr, param_schema_json)
VALUES (
  '마일리지런 칭호 배치',
  'MILEAGE_TITLE_BATCH',
  '전월 마감 후 확정되는 마일리지런 칭호를 평가하고 부여합니다. 월초(1일) 수동 또는 자동 실행.',
  '0 15 1 * *',
  '[
    {
      "key": "base_month",
      "label": "기준 월",
      "type": "month",
      "required": true,
      "default": "prev_month",
      "description": "칭호를 평가할 기준 월입니다. 기본값은 전월."
    }
  ]'::jsonb
);
