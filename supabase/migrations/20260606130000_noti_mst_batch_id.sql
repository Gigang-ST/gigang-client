-- 1. batch_id 컬럼 추가
ALTER TABLE noti_mst ADD COLUMN IF NOT EXISTS batch_id uuid;

-- 2. 기존 데이터: crt_at 초단위 기준으로 같은 팀+타입+초에 들어온 row들을 같은 batch_id로 묶기
WITH grp AS (
  SELECT
    team_id,
    noti_type_enm,
    date_trunc('second', crt_at) AS sec,
    gen_random_uuid() AS gid
  FROM noti_mst
  WHERE batch_id IS NULL
  GROUP BY team_id, noti_type_enm, date_trunc('second', crt_at)
)
UPDATE noti_mst n
SET batch_id = grp.gid
FROM grp
WHERE n.team_id = grp.team_id
  AND n.noti_type_enm = grp.noti_type_enm
  AND date_trunc('second', n.crt_at) = grp.sec
  AND n.batch_id IS NULL;

-- 3. create_noti_for_team RPC 수정 (p_batch_id 파라미터 추가, COALESCE로 항상 batch_id 보장)
CREATE OR REPLACE FUNCTION public.create_noti_for_team(
  p_team_id        uuid,
  p_noti_type_enm  text,
  p_noti_nm        text,
  p_noti_cont      text DEFAULT NULL,
  p_ref_id         uuid DEFAULT NULL,
  p_ref_type_enm   text DEFAULT NULL,
  p_batch_id       uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO noti_mst (team_id, mem_id, noti_type_enm, noti_nm, noti_cont, ref_id, ref_type_enm, batch_id)
  SELECT
    p_team_id,
    tmr.mem_id,
    p_noti_type_enm,
    p_noti_nm,
    p_noti_cont,
    p_ref_id,
    p_ref_type_enm,
    COALESCE(p_batch_id, gen_random_uuid())
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

-- 4. 권한 재설정
REVOKE EXECUTE ON FUNCTION public.create_noti_for_team(uuid,text,text,text,uuid,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_noti_for_team(uuid,text,text,text,uuid,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_noti_for_team(uuid,text,text,text,uuid,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_noti_for_team(uuid,text,text,text,uuid,text,uuid) TO service_role;
