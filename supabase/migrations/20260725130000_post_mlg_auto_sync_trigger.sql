-- 마일리지런 기록(review 있는 것) → 전광판 기록자랑(post_mst) 자동 복제
--   ① sync 함수 — evt_mlg_act_hist 한 행을 post_mst의 mlg_auto 행과 맞춘다
--   ② AFTER INSERT/UPDATE/DELETE 트리거
--   ③ 기존 기록 백필(일회성)
--
-- 설계: docs/design/2026-07-23-기록자랑-포스트확장.md §3(자동 유입 방식 A — 트리거 동기화).
--
-- 왜 조회 UNION이 아니라 복제인가(§3.3): 마일리지런 원본을 조회 시점에 UNION하면 그 행엔
-- 안정적인 post_id가 없어, 훗날 기록자랑에 좋아요/댓글(rctn_mst.entity_id)을 붙일 수 없다.
-- 복제하면 post_mst.post_id가 실제 PK라 그 확장이 열린다. 또 마일리지런 쓰기 경로가 이미
-- 여러 갈래(app/actions/mileage-run.ts의 INSERT 2·UPDATE·DELETE)라, 앱 훅으로 두 테이블에
-- 쓰면 한 곳만 빠뜨려도 유령 기록이 남는다 — 기강포인트(pt_txn_hist)를 트리거로 푼 것과 같은 결.
--
-- 트리거 함수는 SECURITY DEFINER + search_path 고정으로 RLS 잠긴 post_mst에 쓴다
-- (post_mst_insert 정책은 src_enm='manual'만 통과시키므로 mlg_auto는 정책을 우회해야 한다).
--
-- 멱등성: uq_post_mst_ref UNIQUE(ref_type_txt, ref_id)가 같은 마일리지런 기록의 중복 유입을
-- 막는다. ref_type_txt는 'mlg_act' 고정, ref_id는 evt_mlg_act_hist.act_id.

-- ─────────────────────────────────────────────
-- ① sync 함수 — 원본 한 행을 post_mst와 맞춘다
-- ─────────────────────────────────────────────
-- 규칙(설계 §3.4):
--   review 있음  → post_mst 행이 없으면 INSERT, 있으면 표시값(cmnt/dst/sprt/act_dt) UPDATE(살림)
--   review 없음  → 대응 post_mst 행을 soft delete(del_yn=true)
-- INSERT/UPDATE 트리거가 공유한다. DELETE는 아래 별도(원본 행 자체가 사라짐).
--
-- act_dt/crt_at은 원본 값을 그대로 옮긴다 — 백필분이 "지금 몰려 올라온" 걸로 보이지 않고
-- 실제 뛴 날짜 자리에 꽂히게. 정렬 기준이 act_dt DESC라 이게 자연스럽다.
CREATE OR REPLACE FUNCTION public.post_sync_from_mlg_act()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_mem_id   uuid;
  v_team_id  uuid;
  v_has_rev  boolean;
BEGIN
  v_has_rev := NEW.review IS NOT NULL AND btrim(NEW.review) <> '';

  -- 작성자·팀 조인: prt_id → evt_team_prt_rel(mem_id, evt_id) → evt_team_mst.team_id
  SELECT r.mem_id, e.team_id
    INTO v_mem_id, v_team_id
  FROM public.evt_team_prt_rel r
  JOIN public.evt_team_mst e ON e.evt_id = r.evt_id
  WHERE r.prt_id = NEW.prt_id;

  -- 조인이 안 풀리면(참여/이벤트 행이 없음) 복제할 대상이 없다 — 조용히 통과.
  -- 원본 INSERT/UPDATE 자체는 막지 않는다(마일리지런 흐름이 이 복제 때문에 깨지면 안 된다).
  IF v_mem_id IS NULL OR v_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_has_rev THEN
    -- review 있음 → 있으면 살려서 갱신, 없으면 새로 만든다(멱등: uq_post_mst_ref)
    INSERT INTO public.post_mst (
      team_id, mem_id, post_type_enm, src_enm,
      photo_url, cmnt_txt, dst_km, sprt_enm, act_dt,
      ref_type_txt, ref_id, del_yn, crt_at, upd_at
    ) VALUES (
      v_team_id, v_mem_id, 'record_flex', 'mlg_auto',
      NULL, NEW.review, NEW.dst_km, NEW.sprt_enm::text, NEW.act_dt,
      'mlg_act', NEW.act_id, false, NEW.created_at, now()
    )
    ON CONFLICT (ref_type_txt, ref_id) DO UPDATE SET
      cmnt_txt = EXCLUDED.cmnt_txt,
      dst_km   = EXCLUDED.dst_km,
      sprt_enm = EXCLUDED.sprt_enm,
      act_dt   = EXCLUDED.act_dt,
      del_yn   = false,   -- 지웠다가 review가 다시 채워지면 되살린다
      upd_at   = now();
  ELSE
    -- review가 비었다(처음부터 없거나, UPDATE로 지워짐) → 대응 포스트를 내린다.
    -- 행은 지우지 않는다(soft delete) — post_mst 전체 컨벤션과 통일.
    UPDATE public.post_mst
       SET del_yn = true, upd_at = now()
     WHERE ref_type_txt = 'mlg_act' AND ref_id = NEW.act_id AND del_yn = false;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.post_sync_from_mlg_act() IS
  '마일리지런 기록(review) → post_mst(record_flex, mlg_auto) 동기화. 설계 docs/design/2026-07-23-기록자랑-포스트확장.md §3.4';

-- ─────────────────────────────────────────────
-- ① DELETE 전용 — 원본이 사라지면 대응 포스트도 내린다
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_sync_del_mlg_act()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.post_mst
     SET del_yn = true, upd_at = now()
   WHERE ref_type_txt = 'mlg_act' AND ref_id = OLD.act_id AND del_yn = false;
  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.post_sync_del_mlg_act() IS
  '마일리지런 기록 삭제 시 대응 post_mst 행 soft delete. 설계 §3.4 DELETE 규칙';

-- ─────────────────────────────────────────────
-- ② 트리거 — evt_mlg_act_hist에 얹는다(기존 포인트 트리거와 공존)
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_post_sync_mlg_act_ins ON public.evt_mlg_act_hist;
CREATE TRIGGER trg_post_sync_mlg_act_ins
  AFTER INSERT ON public.evt_mlg_act_hist
  FOR EACH ROW EXECUTE FUNCTION public.post_sync_from_mlg_act();

DROP TRIGGER IF EXISTS trg_post_sync_mlg_act_upd ON public.evt_mlg_act_hist;
CREATE TRIGGER trg_post_sync_mlg_act_upd
  AFTER UPDATE ON public.evt_mlg_act_hist
  FOR EACH ROW EXECUTE FUNCTION public.post_sync_from_mlg_act();

DROP TRIGGER IF EXISTS trg_post_sync_mlg_act_del ON public.evt_mlg_act_hist;
CREATE TRIGGER trg_post_sync_mlg_act_del
  AFTER DELETE ON public.evt_mlg_act_hist
  FOR EACH ROW EXECUTE FUNCTION public.post_sync_del_mlg_act();

-- ─────────────────────────────────────────────
-- ③ 백필 — 이미 쌓인 마일리지런 기록(review 있는 것) 일괄 복제
-- ─────────────────────────────────────────────
-- 트리거 도입 이전 기록은 이걸로만 유입된다. ON CONFLICT DO NOTHING이라 재실행해도 안전하고,
-- 트리거가 이미 만든 것과도 충돌하지 않는다(멱등).
INSERT INTO public.post_mst (
  team_id, mem_id, post_type_enm, src_enm,
  photo_url, cmnt_txt, dst_km, sprt_enm, act_dt,
  ref_type_txt, ref_id, del_yn, crt_at, upd_at
)
SELECT
  e.team_id, r.mem_id, 'record_flex', 'mlg_auto',
  NULL, h.review, h.dst_km, h.sprt_enm::text, h.act_dt,
  'mlg_act', h.act_id, false, h.created_at, now()
FROM public.evt_mlg_act_hist h
JOIN public.evt_team_prt_rel r ON r.prt_id = h.prt_id
JOIN public.evt_team_mst e ON e.evt_id = r.evt_id
WHERE h.review IS NOT NULL AND btrim(h.review) <> ''
ON CONFLICT (ref_type_txt, ref_id) DO NOTHING;
