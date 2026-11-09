-- 멀티팀 — 공개 조회 함수(RPC)의 팀 구분 빠진 곳.
--
-- 1) 댓글 수: 대회·모임·일정 목록과 일정 페이지가 댓글을 팀 없이 셌다. 대회는 원본을 두 팀이 같이 쓰므로
--    기강 회원이 단 댓글 수가 울산 화면에도 더해졌다. 댓글(cmnt_mst)은 team_id 를 갖고 있어 그 팀 것만 센다.
-- 2) 기강이야기 피드 '이번 달 활동 수'의 마일리지런 기록: 참가 행(evt_team_prt_rel)만 보고 시즌의 팀을 안 봐서
--    다른 팀 마일리지런 기록이 섞였다. 대회 기록(rec_race_hist)은 사람 것이라 그대로 둔다(2026-11-09 결정).
-- 3) 회원 카드의 활동 포인트(activity_score): 누구나(비로그인 포함) 부를 수 있는 함수인데 그대로 실려
--    ADR-0003(포인트는 본인 프로필에서만)을 어겼다. 본인이 볼 때만 싣고 남에겐 null.
--
-- 방식: 함수가 크고(최대 1.2만 자) dev·prd 본문이 주석·공백만 달라서, 통째로 다시 쓰지 않고
-- **고칠 문구만 정확히 바꾼다.** 문구가 정확히 한 번 있어야 하고(아니면 중단), 이미 바뀌어 있으면 건너뛴다.
SET lock_timeout = '3s';

DO $patch$
DECLARE
  r      record;
  v_def  text;
  v_cnt  int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1, 'get_public_team_competitions',
          E'  WHERE entity_type = ''comp''\n    AND del_yn = false\n  GROUP BY entity_id',
          E'  WHERE entity_type = ''comp''\n    AND del_yn = false\n    AND team_id = p_team_id\n  GROUP BY entity_id'),
      (2, 'get_public_team_gatherings',
          E'WHERE entity_type = ''gathering'' AND del_yn = false GROUP BY entity_id',
          E'WHERE entity_type = ''gathering'' AND del_yn = false AND team_id = p_team_id GROUP BY entity_id'),
      (3, 'get_public_team_sch_posts',
          E'  WHERE entity_type = ''sch_post'' AND del_yn = false\n  GROUP BY entity_id',
          E'  WHERE entity_type = ''sch_post'' AND del_yn = false AND team_id = p_team_id\n  GROUP BY entity_id'),
      (4, 'get_schedule_paged',
          E'LEFT JOIN public.cmnt_mst cm ON cm.entity_type = ''gathering'' AND cm.entity_id = g.gthr_id AND cm.del_yn = false\n',
          E'LEFT JOIN public.cmnt_mst cm ON cm.entity_type = ''gathering'' AND cm.entity_id = g.gthr_id AND cm.del_yn = false AND cm.team_id = p_team_id\n'),
      (5, 'get_schedule_paged',
          E'cm.entity_type = ''sch_post'' AND cm.entity_id = s.sch_post_id AND cm.del_yn = false)',
          E'cm.entity_type = ''sch_post'' AND cm.entity_id = s.sch_post_id AND cm.del_yn = false AND cm.team_id = p_team_id)'),
      (6, 'get_schedule_paged',
          E'cm.entity_type = ''comp'' AND cm.entity_id = c.comp_id AND cm.del_yn = false)',
          E'cm.entity_type = ''comp'' AND cm.entity_id = c.comp_id AND cm.del_yn = false AND cm.team_id = p_team_id)'),
      (7, 'get_team_story_feed',
          E'INNER JOIN public.evt_team_prt_rel etpr ON etpr.prt_id = eth.prt_id, today\n',
          E'INNER JOIN public.evt_team_prt_rel etpr ON etpr.prt_id = eth.prt_id\n                  INNER JOIN public.evt_team_mst etm ON etm.evt_id = etpr.evt_id AND etm.team_id = p_team_id, today\n'),
      (8, 'get_public_member_card',
          E'''activity_score'', s.activity_score,',
          E'''activity_score'', CASE WHEN p_mem_id = public.v2_rls_resolve_mem_id() THEN s.activity_score END,')
    ) AS t(ord, fn, old_txt, new_txt)
    ORDER BY ord
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.fn;

    IF v_def IS NULL THEN
      RAISE EXCEPTION '[%] 함수 % 가 없습니다', r.ord, r.fn;
    END IF;

    IF position(r.new_txt IN v_def) > 0 THEN
      CONTINUE; -- 이미 적용됨
    END IF;

    v_cnt := (length(v_def) - length(replace(v_def, r.old_txt, ''))) / length(r.old_txt);
    IF v_cnt <> 1 THEN
      RAISE EXCEPTION '[%] % 의 고칠 문구가 % 곳에 있습니다(정확히 1곳이어야 함) — 본문이 예상과 다릅니다', r.ord, r.fn, v_cnt;
    END IF;

    EXECUTE replace(v_def, r.old_txt, r.new_txt);
  END LOOP;
END
$patch$;
