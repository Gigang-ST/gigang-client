-- 새로 받은 칭호를 **자동으로 대표 칭호로** 세운다.
--
-- 예전 규칙은 "대표가 하나도 없을 때만 첫 수여분을 대표로"였다(본인 선택이 항상 이김).
-- 지금은 뒤집는다 — **칭호를 새로 따면 그게 대표가 된다.** 마음에 들지 않으면 본인이
-- 프로필에서 다시 고르면 되고(그 경로는 UPDATE라 이 트리거에 안 걸린다), 그 편이
-- "방금 딴 걸 자랑한다"는 이 기능의 목적에 맞는다.
--
-- **왜 앱 코드가 아니라 DB 트리거인가**: 수여 경로가 넷이다(트리거 평가 engine.ts ·
-- 일괄 sweep · 마일리지 배치 · 관리자 수동수여). 앱에서 각자 처리하면 새 경로를 추가할
-- 때마다 조용히 빠진다 — 기강 포인트(pt_txn_hist)를 원천 테이블 트리거로 적립하는 것과
-- 같은 이유다. 여기 걸어 두면 **어떤 경로로 INSERT되든 대표 승격이 따라온다.**
--
-- **AFTER INSERT인 이유**: BEFORE로 하면 한 statement에 여러 행을 넣는 bulk INSERT
-- (sweep·배치)에서 각 행의 트리거가 서로를 못 본다(같은 명령 안에서는 아직 안 보인다).
-- 그러면 세 행이 전부 is_prmy_yn=true로 들어가 대표 단일성 인덱스
-- (uk_mem_ttl_rel_team_mem_primary_current)를 위반한다. AFTER는 행이 들어간 뒤 순서대로
-- 돌므로 **한 번에 여러 개를 따면 마지막 행이 대표로 남는다**(그 안의 순서는 정하지
-- 않는다 — 어느 걸 자랑할지는 본인이 다시 고르면 된다).
--
-- **단 하나 좁히는 것: 같은 그룹의 하위 등급은 승격하지 않는다.**
-- 컬렉션 시트(`isBlockedByHigher`)가 "같은 ttl_group_cd에 더 높은 rarity를 보유 중이면
-- 그 칭호는 대표로 고를 수 없다"를 이미 강제한다. 트리거만 예외를 만들면 **본인이 고를
-- 수도 없는 칭호가 대표로 박히는** 모순이 생긴다.
--
-- 정상 진행(런린이 → 러너 → 마라토너)에선 하위를 나중에 받을 일이 없다. 그런데 실제로
-- 생기는 경로가 둘 있다(dev 실측):
--   · **칭호를 새로 만들고 sweep을 돌릴 때** — 19쌍/7명이 여기 해당했고 전부
--     `manual_sweep`이 런린이·초보를 이미 마라토너·서브현근을 단 고인물에게 뒤늦게
--     채운 것이었다. 신규 칭호를 대량 추가하면 이 일이 그대로 대규모로 벌어진다.
--   · **한 그룹이 동시에 들어올 때**(30명·64쌍) — bulk INSERT는 grnt_at이 같아
--     "마지막 행"이 임의로 정해진다. 이 규칙이 있어야 **그 그룹의 최고 등급**이 대표가 된다.
-- 하위 칭호를 대표로 세우는 건 자랑이 아니라 강등이라는 점에서도 맞다.
-- 판정 기준을 UI와 정확히 맞춘다: `vers=0 AND del_yn=false`만 보고 `exp_at`은 안 본다
-- (컬렉션의 보유 판정이 그렇다 — 한쪽만 만료를 따지면 두 규칙이 어긋난다).
--
-- 해제를 먼저, 승격을 나중에 한다 — 순서가 뒤집히면 잠깐 대표가 둘이 되어 인덱스에 걸린다.
CREATE OR REPLACE FUNCTION public.mem_ttl_rel_promote_latest_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grp integer;
  v_lvl integer;
BEGIN
  -- 활성 수여만 대상. 회수분(vers<>0)·소프트삭제분이 대표를 빼앗지 않게 한다.
  IF NEW.vers <> 0 OR NEW.del_yn THEN
    RETURN NULL;
  END IF;

  -- 이미 만료된 칭호는 승격하지 않는다 — 화면은 만료분을 걸러 읽으므로
  -- (§get_public_member_card 등 exp_at 필터) 대표 자리만 비어 보이게 된다.
  IF NEW.exp_at IS NOT NULL AND NEW.exp_at <= now() THEN
    RETURN NULL;
  END IF;

  SELECT t.ttl_group_cd, t.rarity_level
    INTO v_grp, v_lvl
    FROM public.ttl_mst t
   WHERE t.team_id = NEW.team_id AND t.ttl_id = NEW.ttl_id
     AND t.vers = 0 AND NOT t.del_yn;

  -- 그룹이 없는 칭호(수여 칭호·기강킹 등)는 독립이라 항상 승격한다.
  IF v_grp IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.mem_ttl_rel m
      JOIN public.ttl_mst t
        ON t.team_id = m.team_id AND t.ttl_id = m.ttl_id
       AND t.vers = 0 AND NOT t.del_yn
     WHERE m.team_mem_id = NEW.team_mem_id
       AND m.vers = 0 AND NOT m.del_yn
       AND m.mem_ttl_id <> NEW.mem_ttl_id
       AND t.ttl_group_cd = v_grp
       AND t.rarity_level > COALESCE(v_lvl, 1)
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.mem_ttl_rel
     SET is_prmy_yn = false,
         upd_at = now()
   WHERE team_mem_id = NEW.team_mem_id
     AND is_prmy_yn
     AND vers = 0
     AND del_yn = false
     AND mem_ttl_id <> NEW.mem_ttl_id;

  UPDATE public.mem_ttl_rel
     SET is_prmy_yn = true,
         upd_at = now()
   WHERE mem_ttl_id = NEW.mem_ttl_id
     AND NOT is_prmy_yn;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.mem_ttl_rel_promote_latest_primary() IS
  '칭호 수여(INSERT) 시 그 칭호를 대표로 승격하고 이전 대표를 내린다. 수여 경로(engine·sweep·배치·관리자수동)와 무관하게 동작. 같은 ttl_group_cd에 더 높은 rarity를 보유 중이면 승격하지 않는다(컬렉션의 선택 규칙과 일치). 본인이 프로필에서 고르는 경로는 UPDATE라 여기 안 걸린다.';

DROP TRIGGER IF EXISTS trg_mem_ttl_rel_promote_latest_primary ON public.mem_ttl_rel;

CREATE TRIGGER trg_mem_ttl_rel_promote_latest_primary
AFTER INSERT ON public.mem_ttl_rel
FOR EACH ROW
EXECUTE FUNCTION public.mem_ttl_rel_promote_latest_primary();
