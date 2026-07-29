-- get_team_posts에 올린 사람의 대표 호칭·배지 이펙트 추가
--
-- 배경: 전광판 리드 "운동 기록" 슬롯이 올린 사람 이름 옆에 대표 호칭 배지를 세운다. 기존
-- RPC는 mem_nm·avatar_url만 내려줘 호칭을 알 수 없었다. 새얼굴 슬롯이 쓰는 대표 호칭 조인
-- (mem_ttl_rel + ttl_mst, is_prmy_yn·미만료)을 그대로 가져오고, 배지 이펙트는
-- team_mem_rel.selected_badge_effect에서 읽는다.
--
-- 호칭·배지는 team_mem_rel(team_mem_id) 기준이라, post_mst의 (team_id, mem_id)로
-- team_mem_rel을 **LEFT JOIN**한다 — 탈퇴자·미가입자의 기록도 지면엔 남기되 호칭만 null.
-- (newbies는 INNER지만 저긴 "현재 활동 멤버"만 대상이라 다르다. 여긴 이미 올라온 기록이다.)
--
-- 정렬·필터·인자 시그니처(uuid,int,int)는 그대로다 — CREATE OR REPLACE로 덮어쓴다.
CREATE OR REPLACE FUNCTION public.get_team_posts(
  p_team_id uuid,
  p_limit integer DEFAULT 16,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'post_id',    r.post_id,
    'mem_id',     r.mem_id,
    'mem_nm',     r.mem_nm,
    'avatar_url', r.avatar_url,
    'photo_url',  r.photo_url,
    'cmnt_txt',   r.cmnt_txt,
    'dst_km',     r.dst_km,
    'sprt_enm',   r.sprt_enm,
    'act_dt',     r.act_dt,
    'src_enm',    r.src_enm,
    'crt_at',     r.crt_at,
    'badge_effect',   r.badge_effect,
    'primary_title',  r.primary_title
  ) ORDER BY r.rn), '[]'::jsonb)
  FROM (
    SELECT p.post_id, p.mem_id, mm.mem_nm, mm.avatar_url, p.photo_url,
           p.cmnt_txt, p.dst_km, p.sprt_enm, p.act_dt, p.src_enm, p.crt_at,
           COALESCE(tm.selected_badge_effect, 'none') AS badge_effect,
           (SELECT jsonb_build_object(
                     'ttl_nm', t.ttl_nm, 'ttl_desc', t.ttl_desc,
                     'desc_visibility', t.desc_visibility)
              FROM public.mem_ttl_rel mt
              INNER JOIN public.ttl_mst t
                ON t.ttl_id = mt.ttl_id AND t.vers = 0 AND t.del_yn = false AND t.use_yn = true
              WHERE mt.team_mem_id = tm.team_mem_id AND mt.vers = 0 AND mt.del_yn = false
                AND (mt.exp_at IS NULL OR mt.exp_at > now()) AND mt.is_prmy_yn
              LIMIT 1) AS primary_title,
           row_number() OVER (ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC, p.post_id DESC) AS rn
    FROM public.post_mst p
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = p.mem_id AND mm.vers = 0 AND mm.del_yn = false
    LEFT JOIN public.team_mem_rel tm
      ON tm.mem_id = p.mem_id AND tm.team_id = p.team_id
     AND tm.vers = 0 AND tm.del_yn = false AND tm.mem_st_cd = 'active'
    WHERE p.team_id = p_team_id
      AND p.del_yn = false
      AND p.post_type_enm = 'record_flex'
    ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC, p.post_id DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0)
  ) r;
$function$;

-- CREATE OR REPLACE는 GRANT를 유지하지만, 명시적으로 다시 잠가 둔다(전광판 공개 조회는 anon).
REVOKE ALL ON FUNCTION public.get_team_posts(uuid, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_posts(uuid, integer, integer) TO anon, authenticated, service_role;
