-- 울산지부는 회비를 쓰지 않는다(유저 결정 2026-11-09).
--
-- 1) 팀 설정 feature.dues = false — 회비 내역·미납 점·관리자 회비 메뉴·대시보드 카드를 숨긴다(키 정의는
--    lib/team-cfg/registry.ts, 기본값 true = 기강 동작).
--    (회비 면제 배치는 울산에 아예 만들지 않는다 — 20261109180000 참고.)

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'feature.dues', 'false'::jsonb
FROM public.team_mst t
WHERE t.team_cd = 'ulsan'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_cfg c
    WHERE c.team_id = t.team_id AND c.cfg_cd = 'feature.dues' AND c.vers = 0
  );

