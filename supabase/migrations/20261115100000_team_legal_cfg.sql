-- 약관 3종 팀별 분리(#658) — 운영 주체·개인정보 보호 책임자(`legal.operator`)와 개인정보 문의 연락처(`legal.contact`)를 팀 설정으로.
-- 키 정의는 `lib/team-cfg/registry.ts`, 문서 본문은 `lib/legal-docs.ts`.
--
-- - 기강: 지금 문서에 적힌 값 그대로(이현근 (크루장) · team.gigang@gmail.com). 행이 없어도 기강 문서는 안 바뀐다 — 코드의 기강
--   기본값으로 물러난다. 이 행은 운영진이 팀 설정 화면에서 지금 값을 보고 고칠 수 있게 하는 것이다.
-- - 울산(모보브): 운영 주체·개인정보 책임자 = 송창준(2026-11-11 hglee 결정). **연락처는 아직 받지 못해 넣지 않는다** —
--   비어 있으면 문서가 「운영진에게 문의(앱의 건의하기)」로 안내한다. 받으면 owner 가 팀 설정 화면에서 넣는다.
-- 옛 코드는 이 키를 안 읽어 미리 넣어도 아무 일 없다. 배포 전·후 어느 쪽이든 되지만, 울산 문서에 이름이 바로 서도록 배포 전을 권한다.

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, v.cfg_cd, v.val
FROM public.team_mst t
JOIN (
  VALUES
    ('gigang', 'legal.operator', to_jsonb('이현근 (크루장)'::text)),
    ('gigang', 'legal.contact', to_jsonb('team.gigang@gmail.com'::text)),
    ('ulsan', 'legal.operator', to_jsonb('송창준'::text))
) AS v(team_cd, cfg_cd, val) ON v.team_cd = t.team_cd
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_cfg c
  WHERE c.team_id = t.team_id AND c.cfg_cd = v.cfg_cd AND c.vers = 0
);
