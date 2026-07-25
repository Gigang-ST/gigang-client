-- 한마디 던지기 — 날린 거리(fly_dist)를 남긴다
--
-- 한마디를 쓰고 나면 슬링샷으로 "휙" 던지는 미니 연출이 붙는다(옛날 플래시 게임 결).
-- 얼마나 멀리 갔는지가 그 놀이의 유일한 결과물이라, 그 값을 지면에 남겨야 한 번 보고
-- 끝나지 않는다 — 하늘의 배너 고도가 이 거리로 정해진다(멀리 던진 한마디가 더 높이 난다).
--
-- **거리는 INSERT 시점에 모른다.** 던지기는 전송 "후"에 오기 때문이다(그래야 던지다
-- 그만둬도 한마디는 이미 올라가 있다 — 놀이가 글쓰기를 막지 않게 하는 게 핵심 결정).
-- 그래서 nullable로 두고 던진 뒤 UPDATE로 채운다. NULL = "아직 안 던졌거나 건너뜀"이고,
-- 그 경우 화면은 기본 고도를 쓴다.

SET lock_timeout = '3s';

-- ─────────────────────────────────────────────
-- ① fly_dist 컬럼
-- ─────────────────────────────────────────────
ALTER TABLE public.msg_mst
  ADD COLUMN IF NOT EXISTS fly_dist integer;

COMMENT ON COLUMN public.msg_mst.fly_dist IS
  '던지기로 날아간 거리(m). NULL이면 아직 안 던졌거나 건너뛴 것 — 화면은 기본 고도를 쓴다. INSERT 후 UPDATE로 채운다(던지기가 전송 뒤에 오므로).';

-- 상한을 두는 이유: 이 값은 클라이언트가 계산해 보내는 수치라 조작될 수 있다.
-- 서버가 물리를 다시 계산하진 않지만(연출용 수치라 그럴 가치가 없다), 말도 안 되는 값이
-- 들어와 "오늘의 최고 비행"을 영원히 차지하는 것만은 막는다. 0도 허용한다 — 헛스윙도 기록이다.
ALTER TABLE public.msg_mst
  DROP CONSTRAINT IF EXISTS ck_msg_mst_fly_dist_range;
ALTER TABLE public.msg_mst
  ADD CONSTRAINT ck_msg_mst_fly_dist_range
  CHECK (fly_dist IS NULL OR (fly_dist >= 0 AND fly_dist <= 9999));

-- ─────────────────────────────────────────────
-- ② get_team_messages — fly_dist를 함께 준다
-- ─────────────────────────────────────────────
-- 반환에 키 하나만 더한다. 기존 호출부는 모르는 키를 무시하므로 배포 순서에 안전하다
-- (RPC가 먼저 나가고 클라이언트가 나중에 나가도 깨지지 않는다).
CREATE OR REPLACE FUNCTION public.get_team_messages(p_team_id uuid, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'msg_id',     q.msg_id,
    'mem_id',     q.mem_id,
    'mem_nm',     q.mem_nm,
    'avatar_url', q.avatar_url,
    'msg_txt',    q.msg_txt,
    'fly_dist',   q.fly_dist,
    'crt_at',     q.crt_at
  ) ORDER BY q.crt_at DESC), '[]'::jsonb)
  FROM (
    SELECT m.msg_id, m.mem_id, mm.mem_nm, mm.avatar_url, m.msg_txt, m.fly_dist, m.crt_at
    FROM public.msg_mst m
    INNER JOIN public.mem_mst mm
      ON mm.mem_id = m.mem_id AND mm.vers = 0 AND mm.del_yn = false
    WHERE m.team_id = p_team_id
      AND m.del_yn = false
      -- 24시간 만료. now()는 STABLE이라 문 단위로 고정되고, timestamptz 비교라 시간대 안전하다
      AND m.crt_at > now() - interval '24 hours'
    ORDER BY m.crt_at DESC
    LIMIT GREATEST(p_limit, 1)
  ) q;
$function$;

COMMENT ON FUNCTION public.get_team_messages(uuid, integer) IS
  '종이비행기 한마디 — 작성 후 24시간 이내만, crt_at 최신순. 1인 N개(각오와 달리 사람당 1건으로 좁히지 않는다). 만료분은 행을 지우지 않고 조회에서만 거른다. fly_dist는 던지기 거리(NULL이면 안 던짐). 비로그인도 조회 가능(전광판 공개 정책).';

REVOKE ALL ON FUNCTION public.get_team_messages(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_team_messages(uuid, integer) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────
-- ③ set_message_fly_dist — 던진 거리 기록
-- ─────────────────────────────────────────────
-- 전용 RPC를 두는 이유: 서버 액션이 admin 클라이언트로 UPDATE하면 RLS를 우회하므로
-- "남의 한마디 거리를 덮어쓰기"를 애플리케이션 코드가 스스로 막아야 한다. 그 판정을
-- DB 한 곳에 두면 호출 경로가 늘어도 규칙이 흩어지지 않는다.
--
-- **한 번만 쓴다**(fly_dist IS NULL인 행만). 다시 던져 기록을 갱신하는 건 이 놀이의 결이
-- 아니다 — 한마디마다 한 번의 던지기고, 마음에 안 들면 새 한마디를 쓰면 된다.
-- 갱신을 허용하면 최고 기록이 나올 때까지 반복하게 되어 "오늘의 최고 비행"이 무의미해진다.
CREATE OR REPLACE FUNCTION public.set_message_fly_dist(p_msg_id uuid, p_dist integer)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_mem_id uuid;
  v_updated integer;
BEGIN
  v_mem_id := v2_rls_resolve_mem_id();
  IF v_mem_id IS NULL THEN
    RETURN false;
  END IF;

  -- 범위 밖 값은 조용히 자른다(에러로 만들면 연출 끝에 토스트가 뜨는데, 사용자가
  -- 할 수 있는 일이 없다 — 거리는 놀이의 부산물이지 사용자가 입력한 값이 아니다).
  p_dist := GREATEST(0, LEAST(9999, COALESCE(p_dist, 0)));

  UPDATE public.msg_mst
     SET fly_dist = p_dist,
         upd_at   = now()
   WHERE msg_id  = p_msg_id
     AND mem_id  = v_mem_id      -- 내 한마디만
     AND del_yn  = false
     AND fly_dist IS NULL;       -- 한 번만

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

COMMENT ON FUNCTION public.set_message_fly_dist(uuid, integer) IS
  '던지기 거리 기록 — 본인의 한마디에 한 번만 쓴다(fly_dist IS NULL인 행만). 범위 밖 값은 0~9999로 자른다. 이미 기록됐거나 남의 것이면 false.';

REVOKE ALL ON FUNCTION public.set_message_fly_dist(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.set_message_fly_dist(uuid, integer) TO authenticated, service_role;
