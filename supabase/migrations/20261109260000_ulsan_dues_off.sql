-- 울산지부는 회비를 쓰지 않는다(유저 결정 2026-11-09).
--
-- 1) 팀 설정 feature.dues = false — 회비 내역·미납 점·관리자 회비 메뉴·대시보드 카드를 숨긴다(키 정의는
--    lib/team-cfg/registry.ts, 기본값 true = 기강 동작).
-- 2) 울산 회비 면제 배치(DUES_EXEMPTION_BATCH)를 끈다 — 새 팀 시작 준비(20261109180000) 때 기강 배치를
--    그대로 복사해 켜져 있었다. 회비를 안 쓰는 팀에서 매달 돌 이유가 없다.

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'feature.dues', 'false'::jsonb
FROM public.team_mst t
WHERE t.team_cd = 'ulsan'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_cfg c
    WHERE c.team_id = t.team_id AND c.cfg_cd = 'feature.dues' AND c.vers = 0
  );

UPDATE public.batch_job_mst b
SET use_yn = false
FROM public.team_mst t
WHERE b.team_id = t.team_id
  AND t.team_cd = 'ulsan'
  AND b.job_cd = 'DUES_EXEMPTION_BATCH';
