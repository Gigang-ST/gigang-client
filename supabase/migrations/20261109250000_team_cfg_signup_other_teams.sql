-- 팀 설정(team_cfg) — 기강 가입 폼 첫 화면에 「울산지부 가입이세요? 여기로 →」를 띄운다.
--
-- 울산 사람이 기강 주소로 잘못 와서 기강에 가입하는 걸, 가입 전에 넘겨주려는 안내다(PR #649 남은 일 20번).
-- 주소는 넣지 않고 팀 코드만 둔다 — 링크는 접속 환경(운영·dev·로컬)에 맞는 울산 주소로 코드가 만든다
-- (`lib/team-host.ts` teamLinkOrigin). 키 정의는 `lib/team-cfg/registry.ts`, 기본값은 빈 목록(안내 없음).
-- 울산 쪽(기강으로 넘겨주기)은 필요하면 같은 INSERT 로 넣는다.

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'signup.other_teams', '[{"team_cd": "ulsan", "name": "울산지부"}]'::jsonb
FROM public.team_mst t
WHERE t.team_cd = 'gigang'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_cfg c
    WHERE c.team_id = t.team_id AND c.cfg_cd = 'signup.other_teams' AND c.vers = 0
  );
