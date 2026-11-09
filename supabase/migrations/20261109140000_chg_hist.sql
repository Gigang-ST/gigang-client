-- 공용·사람 단위 데이터 변경 이력(chg_hist).
--
-- 멀티팀이 되면서 "사람 것"(이름·대회 기록·UTMB)과 "공용"(대회 원본)은 **여러 팀 관리자가 고칠 수 있다**
-- (2026-11-09 결정: 사람 데이터는 그 사람이 속한 팀의 관리자, 대회 원본은 등록자 + 아무 팀 관리자).
-- 한 팀의 수정이 다른 팀 화면에도 바로 반영되므로 **누가·어느 팀 관리자로·언제·무엇을** 바꿨는지 남긴다.
--
-- 방식
-- - 대상 테이블에 AFTER UPDATE/DELETE 트리거 — 코드가 빼먹을 수 없게. INSERT 는 원본 행 자체가 기록이라 안 남긴다.
-- - UPDATE 는 **바뀐 칸만** 전/후 값, DELETE 는 **지운 행 전체**(복구용). 대회 기록은 실제 삭제를 유지하고
--   이 이력으로 복구한다(소프트삭제로 바꾸면 기록을 읽는 앱 14곳·RPC 7개·포인트 트리거가 전부 바뀌어야 한다).
-- - 개인정보(전화·계좌·생일·이메일·로그인 연결)는 값 대신 {"masked": true} — 이력이 개인정보 사본이 되지 않게.
-- - 행위자: 서버(service_role)는 요청 헤더 x-gg-actor-mem-id / x-gg-actor-team-id(앱의 createAdminClientAs 가 싣는다),
--   회원 세션(authenticated)은 로그인 정보로, 그 밖(SQL 편집기 등)은 'sql'. 헤더를 빠뜨려도 이력은 행위자 없이 남는다.
-- - 읽기: service_role 전용(RLS on, 정책 없음).
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.chg_hist (
  chg_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tbl_nm         text        NOT NULL,
  row_id         text        NOT NULL,
  chg_tp_cd      text        NOT NULL CHECK (chg_tp_cd IN ('UPDATE', 'DELETE')),
  chg_cols_json  jsonb       NOT NULL,
  actor_mem_id   uuid,
  actor_team_id  uuid,
  actor_src_cd   text        NOT NULL CHECK (actor_src_cd IN ('server', 'user', 'sql')),
  crt_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chg_hist IS
  '공용·사람 단위 데이터 변경 이력(트리거가 쌓는다). UPDATE=바뀐 칸 전후, DELETE=지운 행 전체. 개인정보 칸은 masked. service_role 전용.';
COMMENT ON COLUMN public.chg_hist.actor_team_id IS '어느 팀 관리자(접속 팀)로 바꿨나. 회원 본인 수정·SQL 직접 수정은 null';

-- 새 빈 테이블이라 일반 CREATE INDEX 로 둔다(락을 잡을 행이 없다 — CONCURRENTLY 규약은 기존 테이블용).
CREATE INDEX IF NOT EXISTS ix_chg_hist_tbl_row ON public.chg_hist (tbl_nm, row_id);
CREATE INDEX IF NOT EXISTS ix_chg_hist_team_crt ON public.chg_hist (actor_team_id, crt_at);

ALTER TABLE public.chg_hist ENABLE ROW LEVEL SECURITY;

-- TG_ARGV[0] = PK 칸 이름, TG_ARGV[1] = 값을 가릴 칸 목록(text[] 리터럴, 선택)
CREATE OR REPLACE FUNCTION public.chg_hist_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk     text   := TG_ARGV[0];
  v_mask   text[] := CASE WHEN TG_NARGS > 1 THEN TG_ARGV[1]::text[] ELSE '{}'::text[] END;
  v_old    jsonb  := to_jsonb(OLD);
  v_new    jsonb  := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END;
  v_cols   jsonb  := '{}'::jsonb;
  v_key    text;
  v_claims jsonb;
  v_hdr    jsonb;
  v_role   text;
  v_actor  uuid;
  v_team   uuid;
  v_src    text;
  c_uuid   constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(v_old) LOOP
    CONTINUE WHEN v_key = 'upd_at';
    IF TG_OP = 'DELETE' OR (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
      v_cols := v_cols || jsonb_build_object(
        v_key,
        CASE
          WHEN v_key = ANY (v_mask) THEN jsonb_build_object('masked', true)
          WHEN TG_OP = 'DELETE' THEN jsonb_build_object('before', v_old -> v_key)
          ELSE jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key)
        END
      );
    END IF;
  END LOOP;

  -- 실제로 바뀐 게 없으면(같은 값으로 덮어쓴 upsert 등) 남기지 않는다
  IF v_cols = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_claims := NULL;
  END;
  BEGIN
    v_hdr := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_hdr := NULL;
  END;
  v_role := v_claims ->> 'role';

  IF v_role = 'service_role' THEN
    v_src := 'server';
    IF (v_hdr ->> 'x-gg-actor-mem-id') ~ c_uuid THEN
      v_actor := (v_hdr ->> 'x-gg-actor-mem-id')::uuid;
    END IF;
    IF (v_hdr ->> 'x-gg-actor-team-id') ~ c_uuid THEN
      v_team := (v_hdr ->> 'x-gg-actor-team-id')::uuid;
    END IF;
  ELSIF v_role = 'authenticated' THEN
    -- 회원 본인 세션 — 헤더는 브라우저가 꾸밀 수 있으니 믿지 않고 로그인 정보로만 정한다
    v_src := 'user';
    v_actor := public.v2_rls_resolve_mem_id();
  ELSE
    v_src := 'sql';
  END IF;

  INSERT INTO public.chg_hist (tbl_nm, row_id, chg_tp_cd, chg_cols_json, actor_mem_id, actor_team_id, actor_src_cd)
  VALUES (TG_TABLE_NAME, v_old ->> v_pk, TG_OP, v_cols, v_actor, v_team, v_src);

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.chg_hist_capture() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS chg_hist_capture ON public.mem_mst;
CREATE TRIGGER chg_hist_capture
  AFTER UPDATE OR DELETE ON public.mem_mst
  FOR EACH ROW EXECUTE FUNCTION public.chg_hist_capture(
    'mem_id', '{phone_no,bank_acct_no,birth_dt,email_addr,oauth_kakao_id,oauth_google_id}'
  );

DROP TRIGGER IF EXISTS chg_hist_capture ON public.rec_race_hist;
CREATE TRIGGER chg_hist_capture
  AFTER UPDATE OR DELETE ON public.rec_race_hist
  FOR EACH ROW EXECUTE FUNCTION public.chg_hist_capture('race_result_id');

DROP TRIGGER IF EXISTS chg_hist_capture ON public.comp_mst;
CREATE TRIGGER chg_hist_capture
  AFTER UPDATE OR DELETE ON public.comp_mst
  FOR EACH ROW EXECUTE FUNCTION public.chg_hist_capture('comp_id');

DROP TRIGGER IF EXISTS chg_hist_capture ON public.comp_evt_cfg;
CREATE TRIGGER chg_hist_capture
  AFTER UPDATE OR DELETE ON public.comp_evt_cfg
  FOR EACH ROW EXECUTE FUNCTION public.chg_hist_capture('comp_evt_id');

DROP TRIGGER IF EXISTS chg_hist_capture ON public.mem_utmb_prf;
CREATE TRIGGER chg_hist_capture
  AFTER UPDATE OR DELETE ON public.mem_utmb_prf
  FOR EACH ROW EXECUTE FUNCTION public.chg_hist_capture('utmb_prf_id');
