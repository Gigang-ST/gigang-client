-- 전광판 응원을 무한 누적으로 — 1인 1항목 99회 상한을 없앤다.
--
-- 배경: 응원 버튼은 "누른 만큼 오른다"(취소 없음)인데, 실제로는 세 계층에 99 상한이 박혀
-- 있어 광클하면 99에서 멈추고 그 위로 누르면 CHECK 위반으로 INSERT가 터졌다(버튼이 "락"처럼
-- 보이던 원인). 상한을 없애 진짜 무한 누적으로 만든다. 화면 표시는 클라이언트가 mod 10000으로
-- 감고(9999 다음 0), 한 바퀴 돈 순간부터 빨강으로 바꾼다 — 실제 누적치는 줄지 않는다.
--
-- 두 가지를 함께 푼다:
--   (1) 테이블 CHECK ck_rctn_mst_rctn_cnt: 1~99 → 하한(≥1)만 남기고 상한 제거.
--   (2) RPC bump_story_rctn: LEAST(...,99) 포화 제거, 그냥 + delta 누적.
-- delta(한 번의 증분)는 서버 액션이 1~20으로 이미 검증하므로 GREATEST(...,1) 방어만 남긴다.

-- (1) 상한 제거 — 하한만 남긴다(0/음수 방어).
ALTER TABLE public.rctn_mst DROP CONSTRAINT ck_rctn_mst_rctn_cnt;
ALTER TABLE public.rctn_mst ADD CONSTRAINT ck_rctn_mst_rctn_cnt CHECK (rctn_cnt >= 1);

-- (2) RPC — 99 포화(LEAST) 제거, 무한 누적.
CREATE OR REPLACE FUNCTION public.bump_story_rctn(
  p_team_id uuid, p_entity_type text, p_entity_id text,
  p_mem_id uuid, p_rctn_cd text, p_delta integer
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.rctn_mst (team_id, entity_type, entity_id, mem_id, rctn_cd, rctn_cnt)
  VALUES (p_team_id, p_entity_type, p_entity_id, p_mem_id, p_rctn_cd,
          GREATEST(p_delta, 1))
  ON CONFLICT (team_id, entity_type, entity_id, mem_id)
  DO UPDATE SET rctn_cnt = public.rctn_mst.rctn_cnt + GREATEST(EXCLUDED.rctn_cnt, 1),
                rctn_cd  = EXCLUDED.rctn_cd
  RETURNING rctn_cnt;
$function$;
