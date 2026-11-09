-- 팀 설정 project.show_intro 를 걷어낸다(유저 결정 2026-11-09).
--
-- 진행 중인 프로젝트가 없을 때 마일리지런 소개를 띄울지 정하던 키다. 마일리지런은 기강 전용이고(ADR-0007)
-- 프로젝트는 할 때 만들면 되는 거라, 이제 모든 팀이 "진행 중인 프로젝트가 없어요"만 본다 — 키를 읽는 코드가 없다.
-- 20261109190000 이 넣은 울산 행(false)을 내린다(del_yn 소프트삭제 — 이력은 team_cfg 트리거가 남긴다).

UPDATE public.team_cfg
SET del_yn = true, upd_at = now()
WHERE cfg_cd = 'project.show_intro'
  AND vers = 0
  AND del_yn = false;
