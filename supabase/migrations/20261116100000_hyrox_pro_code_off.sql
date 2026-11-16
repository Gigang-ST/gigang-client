-- 하이록스 프로 부문을 끈다 (#671)
SET lock_timeout = '3s';

-- 크루(기강·울산)에 프로 참가자가 없어 싱글은 전부 OPEN 으로 받기로 했다(2026-11-16 결정).
-- 전당 판·기록 입력·대회 등록 검사·운영 MCP 에서 PRO 를 뺐고(lib/hyrox.ts 의 HYROX_DIVISIONS ·
-- HYROX_RECORD_DIVISIONS), 여기선 공통코드만 끈다 — 대회 등록·기록 입력의 코스 선택지가 이 그룹에서 나온다.
--
-- 지우지 않고 use_yn=false 로 둔다: 되살릴 때 한 줄이면 된다(comp_evt_cfg.comp_evt_type 은 자유 문자열이라
-- 이 코드 행을 참조하는 FK 는 없다). 공통코드 조회(cmm-cd-cached)가 use_yn=true 만 읽어 선택지에서 빠진다.
-- 앱도 선택지에서 PRO 를 한 번 더 거른다(lib/queries/cmm-cd-cached.ts) — 이 파일이 늦게 들어가도 화면은 같다.
-- 공통코드 캐시(unstable_cache, 24시간)가 남아 있어도 위 앱 필터 때문에 PRO 는 안 뜬다.
UPDATE public.cmm_cd_mst c
SET use_yn = false
FROM public.cmm_cd_grp_mst g
WHERE c.cd_grp_id = g.cd_grp_id
  AND g.cd_grp_cd = 'HYROX_EVT_CD'
  AND g.vers = 0
  AND g.del_yn = false
  AND c.cd = 'PRO'
  AND c.vers = 0
  AND c.use_yn = true;
