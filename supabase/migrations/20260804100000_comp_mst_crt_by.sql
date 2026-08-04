-- comp_mst.crt_by — 대회를 만든 사람
--
-- 대회 등록(`createCompetition`)은 이미 활성 회원 전원에게 열려 있는데 수정은 관리자
-- 전용이라, 날짜를 잘못 넣은 사람이 **자기가 만든 대회조차** 못 고치고 운영진에게
-- 부탁해야 했다. "본인 것은 본인이"를 판정하려면 누가 만들었는지를 DB가 알아야 하는데,
-- comp_mst엔 회원을 가리키는 컬럼이 하나도 없었다(`ext_id`의 `manual:{uuid}`는 외부
-- 식별자 칸이고 그 uuid도 랜덤이라 사람과 무관하다).
--
-- **NULL 허용이 필수다.** 두 종류가 영영 비어 있다:
--   ① 이미 등록된 대회 — 작성자를 소급할 방법이 없다
--   ② 외부에서 수집된 대회 — 사람이 만든 게 아니다
-- 그리고 이건 사고가 아니라 원하는 동작이다: crt_by가 비면 관리자만 고칠 수 있으므로,
-- 크롤링으로 들어온 원본 대회를 아무나 고치는 일이 구조적으로 막힌다.
--
-- ON DELETE SET NULL — 회원 행이 사라져도 대회는 남아야 한다(ttl_mst.crt_by와 같은 규약).
-- 실제로 mem_mst를 지우는 경로는 없지만, 지웠을 때 대회가 딸려 사라지는 것보단 낫다.

ALTER TABLE public.comp_mst
  ADD COLUMN IF NOT EXISTS crt_by uuid;

ALTER TABLE public.comp_mst
  DROP CONSTRAINT IF EXISTS fk_comp_mst__crt_by;

ALTER TABLE public.comp_mst
  ADD CONSTRAINT fk_comp_mst__crt_by
  FOREIGN KEY (crt_by) REFERENCES public.mem_mst (mem_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.comp_mst.crt_by IS
  '대회를 만든 회원(mem_mst.mem_id). NULL = 외부 수집분 또는 컬럼 도입 이전 등록분 → 관리자만 수정 가능';
