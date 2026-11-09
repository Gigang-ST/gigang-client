-- 회원 정보·팀 소속 행의 "권한·식별 칸"을 일반 로그인 세션이 바꾸지 못하게 막는다 (defense in depth).
--
-- 배경
--   · mem_mst_update_own 정책은 본인 행 UPDATE 를 칸 제한 없이 열어 둔다. 그래서 로그인 세션(authenticated)이
--     PostgREST 로 직접 자기 행의 로그인 연결 칸(oauth_*_id)·식별 칸(mem_id, phone_no)·버전/삭제 칸을
--     바꿀 수 있었다. 로그인은 oauth_*_id 로도 회원을 찾으므로 연결 칸은 로그인 신원과 직결된다.
--   · team_mem_rel 은 20261109100000 에서 본인 갈래가 제거됐다. 남은 관리자 갈래도 owner 승격/강등과
--     키 칸(team_id, mem_id) 변경은 막아 둔다(관리자가 스스로 owner 가 되는 경로 차단).
--
-- 방침
--   · BEFORE UPDATE 트리거. current_user 가 authenticated/anon(= PostgREST 로 들어온 사용자 세션)일 때만 검사한다.
--     service_role(서버 액션)·SECURITY DEFINER RPC·마이그레이션은 current_user 가 달라 그대로 통과한다.
--   · 앱이 본인 세션으로 바꾸는 칸은 유지한다: mem_nm, gdr_enm, birth_dt, email_addr, avatar_url,
--     bank_nm, bank_acct_no (update-profile / update-avatar / bank-info-form).
SET lock_timeout = '3s';

-- ── mem_mst ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mem_mst_guard_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.mem_id         IS DISTINCT FROM OLD.mem_id
     OR NEW.oauth_kakao_id  IS DISTINCT FROM OLD.oauth_kakao_id
     OR NEW.oauth_google_id IS DISTINCT FROM OLD.oauth_google_id
     OR NEW.phone_no        IS DISTINCT FROM OLD.phone_no
     OR NEW.vers            IS DISTINCT FROM OLD.vers
     OR NEW.del_yn          IS DISTINCT FROM OLD.del_yn
     OR NEW.crt_at          IS DISTINCT FROM OLD.crt_at
  THEN
    RAISE EXCEPTION 'mem_mst: 보호된 칸은 직접 수정할 수 없습니다'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mem_mst_guard_protected_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS mem_mst_guard_protected_columns ON public.mem_mst;
CREATE TRIGGER mem_mst_guard_protected_columns
  BEFORE UPDATE ON public.mem_mst
  FOR EACH ROW
  EXECUTE FUNCTION public.mem_mst_guard_protected_columns();

COMMENT ON FUNCTION public.mem_mst_guard_protected_columns() IS
  '사용자 세션(authenticated/anon)의 mem_mst UPDATE 에서 mem_id·oauth_*_id·phone_no·vers·del_yn·crt_at 변경을 막는다. service_role/RPC 는 통과.';

-- ── team_mem_rel ──────────────────────────────────────────────
-- 같은 팀 owner 인지 (v2_rls_auth_team_owner_or_admin 과 같은 패턴, owner 만)
CREATE OR REPLACE FUNCTION public.v2_rls_auth_team_owner(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_mem_rel r
    WHERE r.team_id = p_team_id
      AND r.mem_id = v2_rls_resolve_mem_id()
      AND r.team_role_cd = 'owner'
      AND r.vers = 0
      AND r.del_yn = false
  );
$$;

REVOKE ALL ON FUNCTION public.v2_rls_auth_team_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v2_rls_auth_team_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.team_mem_rel_guard_owner_and_keys()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- 소속 키는 사용자 세션에서 옮길 수 없다
  IF NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.mem_id IS DISTINCT FROM OLD.mem_id
  THEN
    RAISE EXCEPTION 'team_mem_rel: 소속 키는 직접 수정할 수 없습니다'
      USING ERRCODE = '42501';
  END IF;

  -- owner 가 걸린 등급·상태·삭제 변경은 같은 팀 owner 만
  IF (OLD.team_role_cd = 'owner' OR NEW.team_role_cd = 'owner')
     AND (NEW.team_role_cd IS DISTINCT FROM OLD.team_role_cd
          OR NEW.mem_st_cd IS DISTINCT FROM OLD.mem_st_cd
          OR NEW.del_yn IS DISTINCT FROM OLD.del_yn)
     AND NOT public.v2_rls_auth_team_owner(OLD.team_id)
  THEN
    RAISE EXCEPTION 'team_mem_rel: owner 관련 변경은 owner 만 할 수 있습니다'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.team_mem_rel_guard_owner_and_keys() FROM PUBLIC;

DROP TRIGGER IF EXISTS team_mem_rel_guard_owner_and_keys ON public.team_mem_rel;
CREATE TRIGGER team_mem_rel_guard_owner_and_keys
  BEFORE UPDATE ON public.team_mem_rel
  FOR EACH ROW
  EXECUTE FUNCTION public.team_mem_rel_guard_owner_and_keys();

COMMENT ON FUNCTION public.team_mem_rel_guard_owner_and_keys() IS
  '사용자 세션의 team_mem_rel UPDATE 에서 team_id/mem_id 변경, owner 승격·강등·상태 변경(owner 아닌 호출자)을 막는다. service_role/RPC 는 통과.';
