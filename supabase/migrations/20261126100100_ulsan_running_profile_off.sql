-- 러닝 프로필 사용 여부를 팀 설정으로 — 울산(모비)은 끈다(2026-11-26 유저 결정, PR #745).
-- 키 정의는 `lib/team-cfg/registry.ts` 의 `feature.running_profile`(기본값 켬 = 지금 기강 동작). 기강은 행을 넣지 않는다.
--
-- 끈 팀은 가입 단계(「러닝 프로필」 단계째 없음)·신입 안내·프로필 카드·간단 카드·홈 리드·프로필 수정·관리자 회원 목록·
-- 개인정보처리방침·운영 MCP 어디서도 가까운 역·평균 페이스·거리·시작 정보를 받지도 보이지도 않는다. 가입 목적은 남는다.
-- 값은 사람 것이라 지우지 않는다(다른 팀 주소에선 그대로 보인다).
--
-- ⚠️ **배포 전 필수.** 행 없이 새 코드가 나가면 울산이 기본값(켬)으로 돌아 가입에 러닝 프로필 단계가 다시 생긴다
-- (수도권 지하철역 목록이 울산 가입자에게 나간다). 여러 번 돌려도 같은 결과다.

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'feature.running_profile', to_jsonb(false)
FROM public.team_mst t
WHERE t.team_cd = 'ulsan'
ON CONFLICT (team_id, cfg_cd, vers) DO UPDATE
  SET cfg_val_json = EXCLUDED.cfg_val_json, del_yn = false, upd_at = now()
  WHERE team_cfg.cfg_val_json IS DISTINCT FROM EXCLUDED.cfg_val_json OR team_cfg.del_yn;
