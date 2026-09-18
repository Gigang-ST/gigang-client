-- 현상수배 RPC의 구버전 오버로드 제거.
--
-- `get_team_ghost_members`가 둘이었다:
--   (uuid)        ← 구버전. 상한 8명 · 오래된 순 · 활동 이력 없는 신입 제외 · never_actv 없음
--   (uuid, text)  ← 현행. 상한 30명 · 시드 랜덤 · LEFT JOIN · never_actv 있음
--
-- 아무도 1-인자로 부르지 않지만, 부르는 순간 조용히 구버전이 걸린다. 그러면 화면이
-- `never_actv`를 못 받아 **가입일을 "최종 목격"이라고 찍는다** — 앱 주석이
-- "가입일을 최종 목격이라 적으면 거짓말이 된다"고 경계하던 바로 그 상태다.
-- 오버로드가 있는 한 인자 하나만 실수로 빠져도 이 함정에 빠지므로 없앤다.
--
-- 앱은 이 마이그레이션과 무관하게 안전하다 — `getGhostCandidates`가 `p_seed: ""`를
-- 명시해 항상 2-인자 쪽으로 해석되게 해 뒀다(배포 순서 무관).
SET lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.get_team_ghost_members(uuid);
