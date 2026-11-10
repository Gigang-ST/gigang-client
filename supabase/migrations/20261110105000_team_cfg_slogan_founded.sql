-- 팀 설정(team_cfg) 슬로건·창설일 — 일정 탭 헤더 가운데(「Since 2024.04.23 / No time to be weak」)와 모임 공유 이미지(OG)
-- 맨 위 슬로건에 박혀 있던 기강 문구를 팀 설정으로 옮기고, 울산 값도 넣는다(2026-11-10 유저 요청).
--   - brand.slogan     : 기강 'No time to be weak'(예전 상수 그대로)
--                        울산 'Climb hard, run wild' — 트레일러닝 크루에 맞춰 넣은 임시 문구. 울산 운영진이 팀 설정 화면에서 바꾼다.
--   - brand.founded_dt : 기강 2024-04-23 / 울산 2026-11-28(창설 예정일 — 오기 전에도 그대로 찍는다)
--
-- 두 키 모두 **기본값이 없다**(행이 없으면 그 줄을 안 그린다) — 기본값을 기강 값으로 두면 울산 화면에 기강 문구가 뜬다.
-- 그래서 **행 없이 새 코드가 나가면** 기강 일정 탭 헤더 가운데가 비고 공유 카드 슬로건이 빠진다 — 배포 전에 넣는다.
-- 옛 코드는 이 행을 안 읽으므로 먼저 넣어도 안전하다. 키 정의는 `lib/team-cfg/registry.ts`.

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, v.cfg_cd, v.cfg_val_json
FROM (VALUES
  ('gigang', 'brand.slogan',     to_jsonb('No time to be weak'::text)),
  ('gigang', 'brand.founded_dt', to_jsonb('2024-04-23'::text)),
  ('ulsan',  'brand.slogan',     to_jsonb('Climb hard, run wild'::text)),
  ('ulsan',  'brand.founded_dt', to_jsonb('2026-11-28'::text))
) AS v(team_cd, cfg_cd, cfg_val_json)
JOIN public.team_mst t ON t.team_cd = v.team_cd
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_cfg c
  WHERE c.team_id = t.team_id AND c.cfg_cd = v.cfg_cd AND c.vers = 0
);
