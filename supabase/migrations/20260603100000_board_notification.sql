-- ============================================================
-- 게시판 / 알림 시스템 마이그레이션
-- ============================================================

-- ── 1. team_mem_rel 게시 권한 컬럼 추가 ──────────────────────
ALTER TABLE team_mem_rel ADD COLUMN IF NOT EXISTS post_yn boolean DEFAULT false;

-- ── 2. brd_post_mst — 게시글 ────────────────────────────────
CREATE TABLE IF NOT EXISTS brd_post_mst (
  post_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES team_mst(team_id),
  post_type_enm text NOT NULL CHECK (post_type_enm IN ('notice', 'update')),
  post_nm       text NOT NULL,
  post_cont     text NOT NULL,
  writ_mem_id   uuid REFERENCES mem_mst(mem_id),
  pin_yn        boolean DEFAULT false,
  vers          integer DEFAULT 0,
  del_yn        boolean DEFAULT false,
  crt_at        timestamptz DEFAULT now(),
  upd_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brd_post_mst_active
  ON brd_post_mst(team_id, post_type_enm, crt_at DESC)
  WHERE del_yn = false;

-- ── 3. brd_post_read_hist — 게시글 읽음 이력 ─────────────────
CREATE TABLE IF NOT EXISTS brd_post_read_hist (
  post_id   uuid NOT NULL REFERENCES brd_post_mst(post_id),
  mem_id    uuid NOT NULL REFERENCES mem_mst(mem_id),
  read_at   timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, mem_id)
);

CREATE INDEX IF NOT EXISTS idx_brd_post_read_hist_mem
  ON brd_post_read_hist(mem_id, post_id);

-- ── 4. noti_mst — 알림 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS noti_mst (
  noti_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES team_mst(team_id),
  mem_id        uuid NOT NULL REFERENCES mem_mst(mem_id),
  noti_type_enm text NOT NULL,
  noti_nm       text NOT NULL,
  noti_cont     text,
  ref_id        uuid,
  ref_type_enm  text,
  read_yn       boolean DEFAULT false,
  vers          integer DEFAULT 0,
  del_yn        boolean DEFAULT false,
  crt_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_noti_mst_unread
  ON noti_mst(mem_id, crt_at DESC)
  WHERE del_yn = false AND read_yn = false;

CREATE INDEX IF NOT EXISTS idx_noti_mst_member
  ON noti_mst(mem_id, crt_at DESC)
  WHERE del_yn = false;

-- ── 5. noti_pref_cfg — 알림 수신 설정 ───────────────────────
CREATE TABLE IF NOT EXISTS noti_pref_cfg (
  pref_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mem_id        uuid NOT NULL REFERENCES mem_mst(mem_id),
  noti_type_enm text NOT NULL,
  enabled_yn    boolean DEFAULT true,
  UNIQUE (mem_id, noti_type_enm)
);

-- ── 6. RLS ──────────────────────────────────────────────────

-- brd_post_mst RLS
ALTER TABLE brd_post_mst ENABLE ROW LEVEL SECURITY;

-- SELECT: 팀 멤버 전체 (비로그인 포함 — 공개 읽기)
CREATE POLICY brd_post_mst_select ON brd_post_mst
  FOR SELECT USING (del_yn = false);

-- INSERT: admin=true 또는 post_yn=true 멤버
CREATE POLICY brd_post_mst_insert ON brd_post_mst
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_mem_rel tmr
      WHERE tmr.team_id = brd_post_mst.team_id
        AND tmr.mem_id = (SELECT mem_id FROM mem_mst WHERE auth_id = auth.uid() LIMIT 1)
        AND tmr.vers = 0
        AND tmr.del_yn = false
        AND (
          EXISTS (SELECT 1 FROM mem_mst WHERE mem_id = tmr.mem_id AND admin = true)
          OR tmr.post_yn = true
        )
    )
  );

-- UPDATE: 작성자 또는 관리자
CREATE POLICY brd_post_mst_update ON brd_post_mst
  FOR UPDATE USING (
    writ_mem_id = (SELECT mem_id FROM mem_mst WHERE auth_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM mem_mst WHERE auth_id = auth.uid() AND admin = true
    )
  );

-- DELETE: 관리자만 (소프트 삭제 사용하므로 실제 DELETE 불필요)
CREATE POLICY brd_post_mst_delete ON brd_post_mst
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM mem_mst WHERE auth_id = auth.uid() AND admin = true)
  );

-- brd_post_read_hist RLS
ALTER TABLE brd_post_read_hist ENABLE ROW LEVEL SECURITY;

CREATE POLICY brd_post_read_hist_select ON brd_post_read_hist
  FOR SELECT USING (
    mem_id = (SELECT mem_id FROM mem_mst WHERE auth_id = auth.uid() LIMIT 1)
  );

CREATE POLICY brd_post_read_hist_insert ON brd_post_read_hist
  FOR INSERT WITH CHECK (
    mem_id = (SELECT mem_id FROM mem_mst WHERE auth_id = auth.uid() LIMIT 1)
  );

-- noti_mst RLS
ALTER TABLE noti_mst ENABLE ROW LEVEL SECURITY;

CREATE POLICY noti_mst_select ON noti_mst
  FOR SELECT USING (
    mem_id = (SELECT mem_id FROM mem_mst WHERE auth_id = auth.uid() LIMIT 1)
  );

-- INSERT: service role만 허용 (create_noti_for_team 함수가 SECURITY DEFINER로 처리)
-- UPDATE: 본인 알림만 (read_yn, del_yn 업데이트)
CREATE POLICY noti_mst_update ON noti_mst
  FOR UPDATE USING (
    mem_id = (SELECT mem_id FROM mem_mst WHERE auth_id = auth.uid() LIMIT 1)
  );

-- noti_pref_cfg RLS
ALTER TABLE noti_pref_cfg ENABLE ROW LEVEL SECURITY;

CREATE POLICY noti_pref_cfg_all ON noti_pref_cfg
  FOR ALL USING (
    mem_id = (SELECT mem_id FROM mem_mst WHERE auth_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    mem_id = (SELECT mem_id FROM mem_mst WHERE auth_id = auth.uid() LIMIT 1)
  );

-- ── 7. create_noti_for_team — 팀 전체 알림 생성 함수 ─────────
CREATE OR REPLACE FUNCTION create_noti_for_team(
  p_team_id        uuid,
  p_noti_type_enm  text,
  p_noti_nm        text,
  p_noti_cont      text DEFAULT NULL,
  p_ref_id         uuid DEFAULT NULL,
  p_ref_type_enm   text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO noti_mst (team_id, mem_id, noti_type_enm, noti_nm, noti_cont, ref_id, ref_type_enm)
  SELECT
    p_team_id,
    tmr.mem_id,
    p_noti_type_enm,
    p_noti_nm,
    p_noti_cont,
    p_ref_id,
    p_ref_type_enm
  FROM team_mem_rel tmr
  WHERE tmr.team_id = p_team_id
    AND tmr.vers = 0
    AND tmr.del_yn = false
    AND NOT EXISTS (
      SELECT 1 FROM noti_pref_cfg npc
      WHERE npc.mem_id = tmr.mem_id
        AND npc.noti_type_enm = p_noti_type_enm
        AND npc.enabled_yn = false
    );
END;
$$;

-- ── 8. 알림 90일 자동 삭제 (pg_cron) ────────────────────────
-- pg_cron 활성화된 경우에만 동작. 비활성화 환경에서는 무시됨.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'delete-old-noti-mst',
      '0 18 * * *',
      $cron$
        DELETE FROM noti_mst
        WHERE crt_at < now() - interval '90 days';
      $cron$
    );
  END IF;
END $$;
