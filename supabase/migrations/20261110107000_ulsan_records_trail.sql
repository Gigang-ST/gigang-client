-- 울산 기강의 전당(랭킹탭) 종목 = 트레일러닝만(team_cfg `records.categories`) — 2026-11-10 유저 결정.
-- 울산은 트레일러닝 크루라 종목 탭 줄 없이 트레일러닝 판만 세운다. 기강은 행을 넣지 않는다(기본값 = 넷 다).
-- 행이 없으면 넷 다 보일 뿐 깨지지 않아 배포 전후 언제 넣어도 안전하다. 키 정의는 `lib/team-cfg/registry.ts`.

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'records.categories', '["trail"]'::jsonb
FROM public.team_mst t
WHERE t.team_cd = 'ulsan'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_cfg c
    WHERE c.team_id = t.team_id AND c.cfg_cd = 'records.categories' AND c.vers = 0
  );
