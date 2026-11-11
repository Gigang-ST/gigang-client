-- 회원 호칭을 팀 설정으로(`brand.member_noun`) — 「기강인만 볼 수 있어요」「기강인 42명의 이번 주 심박」의 「기강인」 자리.
-- 화면 문구의 크루 이름·호칭을 팀 문구(`lib/team-copy.ts`)로 옮기면서 생겼다(2026-11-10). 키 정의는 `lib/team-cfg/registry.ts`.
--
-- 배포 전에 넣는 걸 권한다. 행이 없어도 기강 화면은 깨지지 않는다 — 코드의 팀 기본 이름(`lib/team-copy.ts` TEAM_VOICE,
-- 기강 「기강인」)으로 물러난다(리뷰 2026-11-11 반영). 이 행은 운영진이 팀 설정 화면에서 지금 값을 보고 고칠 수 있게 하는 것이다.
-- 옛 코드는 이 키를 안 읽어 미리 넣어도 아무 일 없다.
-- 울산(모보브)은 넣지 않는다 — 비어 있으면 「크루원」이고, 호칭이 정해지면 팀 설정 화면에서 넣는다.

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'brand.member_noun', to_jsonb('기강인'::text)
FROM public.team_mst t
WHERE t.team_cd = 'gigang'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_cfg c
    WHERE c.team_id = t.team_id AND c.cfg_cd = 'brand.member_noun' AND c.vers = 0
  );
