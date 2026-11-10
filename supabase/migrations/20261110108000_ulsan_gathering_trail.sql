-- 울산 모임 기본 종목 = 트레일러닝(team_cfg `gathering.default_sport`) — 2026-11-10 유저 결정.
-- 모임 만들기를 열면 트레일러닝이 먼저 골라져 있다. 기강은 행을 넣지 않는다(기본값 = 러닝).
-- 행이 없으면 러닝으로 열릴 뿐이라 배포 전후 언제 넣어도 안전하다. 키 정의는 `lib/team-cfg/registry.ts`.

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'gathering.default_sport', to_jsonb('trail_run'::text)
FROM public.team_mst t
WHERE t.team_cd = 'ulsan'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_cfg c
    WHERE c.team_id = t.team_id AND c.cfg_cd = 'gathering.default_sport' AND c.vers = 0
  );
