-- 칭호 도메인: 기강 팀 자동 칭호 19종 + 수여 칭호 4종 시드
-- 근거: .claude/docs/database-schema-v2-title-domain.md §5 (자동), §6 (수여)
-- 멀티팀 정책: 본 시드는 team_cd='gigang'에만 적용. 신규 팀 가입 시 동일 19종을 시드하는 RPC/스크립트는 별도 구현 예정.

-- 1) 생성 (시드)

DO $$
DECLARE
  v_team_id uuid;
BEGIN
  -- 기강 팀 정본 조회
  SELECT team_id INTO v_team_id
  FROM public.team_mst
  WHERE team_cd = 'gigang' AND vers = 0 AND del_yn = false
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'team_mst 정본(team_cd=gigang) 없음. 칭호 시드 중단.';
  END IF;

  -- 1-1) 자동 칭호 19종
  INSERT INTO public.ttl_mst (
    team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_rank, emoji_txt, cond_rule, base_pt, desc_txt, sort_ord, vers, del_yn
  )
  SELECT v_team_id, 'auto'::public.ttl_kind_enm, v.ctgr, v.nm, v.rank, v.emoji, v.rule::jsonb, NULL, v.descr, v.sort_ord, 0, false
  FROM (
    VALUES
      -- 러닝 (running) — 1·2등급은 가입 기간 기반, 3등급부터 PB 기반
      ('running', '런린이',           1, '🏃', '{"type":"join_age","max_months":3}',                                      '가입 3개월 이하',           1),
      ('running', '입문',             2, '🏃', '{"type":"join_age","min_months":3}',                                      '가입 3개월 초과',           2),
      ('running', '초보',             3, '🏃', '{"type":"pb","sprt":"road_run","evt_type":"10K","max_sec":3600}',         '10K PB 1시간 이내',         3),
      ('running', '중수',             4, '🏃', '{"type":"pb","sprt":"road_run","evt_type":"HALF","max_sec":7200}',        '하프 PB 2시간 이내',        4),
      ('running', '고수',             5, '🏃', '{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":18000}',       '풀 PB 5시간 이내',          5),
      ('running', '고인물',           6, '🏃', '{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":14400}',       '풀 PB 4시간 이내',          6),
      ('running', '신세계',           7, '🏃', '{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":12600}',       '풀 PB 3시간 30분 이내',     7),
      ('running', '천상천하유아독존', 8, '🏃', '{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":11400}',       '풀 PB 3시간 10분 이내',     8),
      ('running', '최고존엄',         9, '🏃', '{"type":"pb","sprt":"road_run","evt_type":"FULL","max_sec":10800}',       '풀 PB 3시간 이내',          9),
      -- 철인 (triathlon)
      ('triathlon', '올림픽 철인',    1, '🏅', '{"type":"finish","sprt":"triathlon","evt_type":"OLYMPIC"}',               '올림픽 코스 완주',          1),
      ('triathlon', '하프철인',       2, '🏅', '{"type":"finish","sprt":"triathlon","evt_type":"HALF"}',                  '하프 코스 완주',            2),
      ('triathlon', '킹철인',         3, '🏅', '{"type":"finish","sprt":"triathlon","evt_type":"FULL"}',                  '풀 코스 완주',              3),
      -- 트레일 (trail)
      ('trail', '동네언덕',           1, '⛰️', '{"type":"finish_any","sprt":"trail_run"}',                                '트레일 대회 참가',          1),
      ('trail', '뒷산',               2, '⛰️', '{"type":"finish","sprt":"trail_run","evt_type":"20K"}',                   '20K 트레일 완주',           2),
      ('trail', '산악구보',           3, '⛰️', '{"type":"finish","sprt":"trail_run","evt_type":"50K"}',                   '50K 트레일 완주',           3),
      ('trail', '산악대장',           4, '⛰️', '{"type":"finish","sprt":"trail_run","evt_type":"100K"}',                  '100K 트레일 완주',          4),
      ('trail', '산신령',             5, '⛰️', '{"type":"finish","sprt":"trail_run","evt_type":"100M"}',                  '100M 트레일 완주',          5),
      -- 자전거 (cycling)
      ('cycling', '메디오폰도',       1, '🚴', '{"type":"finish","sprt":"cycling","evt_type":"MEDIOFONDO"}',              '메디오폰도 완주',           1),
      ('cycling', '그란폰도',         2, '🚴', '{"type":"finish","sprt":"cycling","evt_type":"GRANFONDO"}',               '그란폰도 완주',             2)
  ) AS v(ctgr, nm, rank, emoji, rule, descr, sort_ord)
  ON CONFLICT (team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_rank, vers) DO NOTHING;

  -- 1-2) 수여 칭호 4종 (base_pt=0, 운영자가 수여 시 직접 입력)
  INSERT INTO public.ttl_mst (
    team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_rank, emoji_txt, cond_rule, base_pt, desc_txt, sort_ord, vers, del_yn
  )
  SELECT v_team_id, 'awarded'::public.ttl_kind_enm, 'awarded', v.nm, 0, NULL, NULL, 0, v.descr, v.sort_ord, 0, false
  FROM (
    VALUES
      ('서브현근',   '모임장보다 풀코스 빠른 회원',  1),
      ('기강단장',   '기강 모임장',                  2),
      ('행동대장',   '운영진',                       3),
      ('맛객',       '맛집을 잘 아는 회원',          4)
  ) AS v(nm, descr, sort_ord)
  ON CONFLICT (team_id, ttl_nm, vers) DO NOTHING;
END;
$$;

-- 2) 백필: 해당 없음

-- 3) 인덱스/제약: 해당 없음 (이전 마이그레이션에서 생성)

-- 4) RLS: 해당 없음 (이전 마이그레이션에서 활성화)

-- 5) 롤백
-- DELETE FROM public.ttl_mst t
-- USING public.team_mst tm
-- WHERE t.team_id = tm.team_id
--   AND tm.team_cd = 'gigang' AND tm.vers = 0 AND tm.del_yn = false
--   AND t.vers = 0 AND t.del_yn = false;
