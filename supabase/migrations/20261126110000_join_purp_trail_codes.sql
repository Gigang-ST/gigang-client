-- 가입 목적 공통코드에 트레일러닝 크루 칩 3개를 덧붙인다(#748 — 모비 가입 목적). 앱의 정본은 `lib/validations/member.ts`
-- `JOIN_PURP_CODES`·라벨이고, 어느 팀이 어떤 칩을 보이는지는 `lib/team-signup.ts` 다. 공통코드는 관리 도구·SQL 보고가 코드 이름을
-- 찾을 수 있게 같이 둔다 — 지난번 칩 추가(`20261120150000_member_start_info.sql` §3)와 같은 방식. 기존 코드·순서는 그대로.
-- 배포 전·후 무관(앱은 이 행을 읽지 않는다). 여러 번 돌려도 같은 결과다.

SET lock_timeout = '3s';

INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, false, 0, false
FROM public.cmm_cd_grp_mst g
CROSS JOIN LATERAL (
  VALUES
    ('JOIN_PURP', 'MT_MATE', '같이 산에 갈 사람이 필요해요', '가입 목적: 산 메이트', 11),
    ('JOIN_PURP', 'TRAIL_START', '트레일러닝을 시작해 보고 싶어요', '가입 목적: 트레일 입문', 12),
    ('JOIN_PURP', 'TRAIL_FINISH', '첫 트레일 대회를 완주하고 싶어요', '가입 목적: 첫 트레일 완주', 13)
) AS v(grp_cd, cd, cd_nm, cd_desc, sort_ord)
WHERE g.cd_grp_cd = v.grp_cd
  AND g.vers = 0
  AND g.del_yn = false
ON CONFLICT (cd_grp_id, cd, vers) DO NOTHING;
