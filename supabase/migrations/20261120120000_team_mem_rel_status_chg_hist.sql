-- 회원 상태·역할 변경에도 "누가·언제·무엇을" 남긴다 (#720)
--
-- 배경: 2026-07-16 01:13 에 비활성 → 탈퇴 일괄 변경이 있었는데 처리자를 알 수 없었다. 상태 변경은
-- apply_team_mem_rel_change RPC 가 정본(vers=0)을 UPDATE 하는 것인데, team_mem_rel 에는 처리자 칸이 없고
-- chg_hist(20261109140000) 트리거도 안 걸려 있었다. 사유(inact_rsn_txt)는 칸이 있지만 SQL 로 직접 바꾸면 비어 있었다.
--
-- 고치는 것: chg_hist 트리거를 team_mem_rel 에 건다.
-- - 정본 행 UPDATE 중 **상태·역할·사유·탈퇴일·삭제 표시가 바뀐 때만** 남긴다(배지·프레임·한마디 같은 자주 바뀌는 칸은 제외 —
--   WHEN 절). 바뀐 칸만 전/후 값으로 쌓인다(사유 포함).
-- - 처리자: 앱(createAdminClientAs)이 싣는 헤더로 서버 경로는 관리자 id·팀 id, SQL 직접 수정은 'sql'.
-- - 이력 스냅샷 행(vers>0)은 INSERT 라 안 남긴다 — 변경 자체는 정본 UPDATE 한 건이 대표한다.
SET lock_timeout = '3s';

DROP TRIGGER IF EXISTS chg_hist_capture ON public.team_mem_rel;
CREATE TRIGGER chg_hist_capture
  AFTER UPDATE ON public.team_mem_rel
  FOR EACH ROW
  WHEN (
    OLD.mem_st_cd     IS DISTINCT FROM NEW.mem_st_cd
    OR OLD.team_role_cd  IS DISTINCT FROM NEW.team_role_cd
    OR OLD.inact_rsn_txt IS DISTINCT FROM NEW.inact_rsn_txt
    OR OLD.leave_dt      IS DISTINCT FROM NEW.leave_dt
    OR OLD.del_yn        IS DISTINCT FROM NEW.del_yn
  )
  EXECUTE FUNCTION public.chg_hist_capture('team_mem_id');
