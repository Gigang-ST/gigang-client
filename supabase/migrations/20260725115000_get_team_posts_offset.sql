-- 기록 자랑 조회에 오프셋 추가 — 끝까지 밀면 더 불러오기
--
-- 배경: 기록 자랑이 가로 스크롤로 바뀌면서 "면 넘기기 + 진행 막대"가 사라졌다. 막대가 없으니
-- 화면상 면 수 제한은 없어졌지만, 한 번에 받아오는 양(`STORY_POST_LIMIT`)이 여전히 천장이라
-- 그 너머는 볼 방법이 없었다. 오프셋을 받아 이어붙일 수 있게 한다.
--
-- 정렬은 원본과 동일하다(act_dt DESC NULLS LAST, crt_at DESC). **정렬이 같아야 오프셋이
-- 의미를 갖는다** — 페이지마다 순서가 흔들리면 같은 기록이 두 번 나오거나 건너뛴다.
--
-- **구버전 DROP이 반드시 먼저다.** Postgres는 인자 시그니처로 함수를 구분하므로
-- CREATE OR REPLACE에 인자를 하나 더하면 기존 함수를 덮어쓰는 게 아니라 **오버로드가 하나
-- 더 생긴다**. 그러면 get_team_posts(uuid,int)와 (uuid,int,int)가 공존하고, PostgREST가
-- 2인자 호출(`getStoryPosts`)을 어디로 보낼지 모호해져 조회가 통째로 실패한다
-- — 화면에는 "아직 올라온 기록이 없어요"만 남는다(실제로 겪은 증상).
--
-- DROP 후 3인자 하나만 남기면 `p_offset DEFAULT 0` 덕에 2인자 호출도 그대로 받는다.
DROP FUNCTION IF EXISTS public.get_team_posts(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_team_posts(
  p_team_id uuid,
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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
    'crt_at',     r.crt_at
  ) ORDER BY r.rn), '[]'::jsonb)
  FROM (
    SELECT p.post_id, p.mem_id, mm.mem_nm, mm.avatar_url, p.photo_url,
           p.cmnt_txt, p.dst_km, p.sprt_enm, p.act_dt, p.src_enm, p.crt_at,
           row_number() OVER (ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC) AS rn
    FROM public.post_mst p
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = p.mem_id AND mm.vers = 0 AND mm.del_yn = false
    WHERE p.team_id = p_team_id
      AND p.del_yn = false
      AND p.post_type_enm = 'record_flex'
    ORDER BY p.act_dt DESC NULLS LAST, p.crt_at DESC
    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0)
  ) r;
$function$;
