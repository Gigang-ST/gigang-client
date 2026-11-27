-- 가입 마지막 「참석 약속」 단계의 정기 모임 안내를 팀 설정으로(`gathering.regular_intro` — 이름 + 일정, 2026-11-27).
-- 예전엔 「정기런(격주 수요일)」이 화면에 박혀 울산 가입자에게도 떴다. 키 정의는 `lib/team-cfg/registry.ts`, 문장은 `lib/regular-intro.ts`.
--
-- - 기강: 지금 화면 문구 그대로(정기런 · 격주 수요일 저녁)
-- - 울산(모비): 송창준 회신(2026-11-23) 「2째주 금요일, 장소 미정」 → 정기 모임 · 매달 둘째 주 금요일. owner 가 팀 설정에서 고칠 수 있다
-- 이미 살아 있는 행이 있으면(운영진이 먼저 고쳤으면) 건드리지 않고, 지워진 정본 행만 되살린다. 여러 번 돌려도 같은 결과다.
-- 배포 전 권장 — 빠져도 깨지지 않고 요일 없는 중립 문장(「가까운 모임에 한 번 나와 보세요」)으로 나온다.

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'gathering.regular_intro', v.val
FROM public.team_mst t
JOIN (
  VALUES
    ('gigang', '{"name": "정기런", "when": "격주 수요일 저녁"}'::jsonb),
    ('ulsan', '{"name": "정기 모임", "when": "매달 둘째 주 금요일"}'::jsonb)
) AS v(team_cd, val) ON v.team_cd = t.team_cd
ON CONFLICT (team_id, cfg_cd, vers) DO UPDATE
  SET cfg_val_json = EXCLUDED.cfg_val_json, del_yn = false, upd_at = now()
  WHERE team_cfg.del_yn;
