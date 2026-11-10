-- 회원 호칭을 팀 설정으로(`brand.member_noun`) — 「기강인만 볼 수 있어요」「기강인 42명의 이번 주 심박」의 「기강인」 자리.
-- 화면 문구의 크루 이름·호칭을 팀 문구(`lib/team-copy.ts`)로 옮기면서 생겼다(2026-11-10). 키 정의는 `lib/team-cfg/registry.ts`.
--
-- ⚠ **배포 전에** 넣는다. 기본값이 없어서(다른 팀에 기강 호칭이 새지 않게) 행 없이 새 코드가 나가면 기강 화면의
-- 「기강인」이 전부 「크루원」으로 바뀐다. 옛 코드는 이 키를 안 읽어 미리 넣어도 아무 일 없다.
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
