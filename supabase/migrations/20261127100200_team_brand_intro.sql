-- 로그인 화면 로고 아래·더보기 맨 아래의 크루 소개 한 줄을 팀 설정으로(`brand.intro`, 2026-11-27).
-- 예전엔 두 화면에 기강 문구가 따로 박혀 있어(「모여 만든 스포츠 팀」 / 「함께 만드는 팀」) 모비 화면에도 기강 소개가 떴다.
-- 키 정의는 `lib/team-cfg/registry.ts`.
--
-- - 기강: 운동을 좋아하는 사람들이 모여 만든 스포츠 팀(로그인 화면 문구 그대로 — 더보기 맨 아래도 이 문장으로 맞춘다)
-- - 울산(모비): 산을 좋아하는 사람들이 모여 만든 트레일러닝 팀
-- 이미 살아 있는 행이 있으면(운영진이 먼저 고쳤으면) 건드리지 않고, 지워진 정본 행만 되살린다. 여러 번 돌려도 같은 결과다.
-- ⚠ **배포 전에** 넣는다 — 기본값이 없어서 행 없이 새 코드가 나가면 두 화면의 소개 줄이 비어 버린다.
-- 행만 먼저 있으면 옛 코드는 이 키를 안 읽어 아무 일도 없다.

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'brand.intro', v.val
FROM public.team_mst t
JOIN (
  VALUES
    ('gigang', to_jsonb('운동을 좋아하는 사람들이 모여 만든 스포츠 팀'::text)),
    ('ulsan', to_jsonb('산을 좋아하는 사람들이 모여 만든 트레일러닝 팀'::text))
) AS v(team_cd, val) ON v.team_cd = t.team_cd
ON CONFLICT (team_id, cfg_cd, vers) DO UPDATE
  SET cfg_val_json = EXCLUDED.cfg_val_json, del_yn = false, upd_at = now()
  WHERE team_cfg.del_yn;
