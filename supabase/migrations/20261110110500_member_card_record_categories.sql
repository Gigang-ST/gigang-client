-- 프로필 카드에 그 팀의 기록 종목(team_cfg `records.categories`)을 같이 싣는다 — 2026-11-10 유저 결정.
-- 카드의 기록 칸(FULL·HALF·10K / UTMB / 철인)과 페이스 추이를 랭킹탭과 같은 종목으로 맞추려면 화면이 이 값을 알아야
-- 하는데, 카드 팝업은 브라우저가 이 함수를 직접 부른다. 설정을 따로 받으면 요청이 하나 늘어나므로 **이 함수 결과에
-- 칸 하나(`record_categories`)를 얹는다**(설정 행 하나를 읽는 정도라 비용은 무시할 만하다).
-- 행이 없거나 배열이 아니면 null — 화면은 null 을 「넷 다」로 읽는다(옛 응답·설정 안 한 팀 모두 지금 그대로).
--
-- 본문 전체를 다시 쓰지 않고 지금 정의의 한 자리('rctn_recv_cnt' 칸 앞)에만 끼워 다시 만든다 — 못 찾으면 멈춘다.
-- 22번(feature_titles)과 같은 방식이고, 그보다 뒤여야 한다(둘 다 같은 함수를 고친다). 옛 코드는 이 칸을 읽지 않아
-- 배포 전에 넣어도 안전하다 — 넣지 않고 새 코드가 나가면 울산 카드에 빈 로드 칸이 보일 뿐이다.

DO $$
DECLARE
  d text := pg_get_functiondef('public.get_public_member_card(uuid, uuid)'::regprocedure);
  anchor text := '''rctn_recv_cnt'', (SELECT cnt FROM rctn_recv),';
  addition text := '''record_categories'', (SELECT c.cfg_val_json FROM public.team_cfg c
                     WHERE c.team_id = p_team_id AND c.cfg_cd = ''records.categories''
                       AND c.vers = 0 AND c.del_yn = false AND jsonb_typeof(c.cfg_val_json) = ''array''
                     LIMIT 1),
  ';
BEGIN
  IF position('record_categories' IN d) > 0 THEN
    RAISE NOTICE 'get_public_member_card: 이미 record_categories 가 있어 건너뜀';
    RETURN;
  END IF;
  IF (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 THEN
    RAISE EXCEPTION 'get_public_member_card: 끼울 자리(rctn_recv_cnt)를 정확히 한 번 찾지 못함 — 정의가 예상과 다르다';
  END IF;
  EXECUTE replace(d, anchor, addition || anchor);
END $$;
