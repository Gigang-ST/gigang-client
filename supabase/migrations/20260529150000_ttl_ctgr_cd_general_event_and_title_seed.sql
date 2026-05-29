-- TTL_CTGR_CD에 general, event 카테고리 추가 및 칭호 전체 시드
-- 문서 기준: .claude/docs/title-catalog.md

-- 1) TTL_CTGR_CD 공통코드 추가 (general, event)
INSERT INTO public.cmm_cd_mst (cd_grp_id, cd, cd_nm, cd_desc, sort_ord, is_default_yn, vers, del_yn)
SELECT g.cd_grp_id, v.cd, v.cd_nm, v.cd_desc, v.sort_ord, false, 0, false
FROM public.cmm_cd_grp_mst g
JOIN (
  VALUES
    ('general', '제네럴', '종목 무관 가입기간·계절·복합 활동 기반 칭호', 6),
    ('event',   '이벤트', '이벤트·시즌 참여 칭호',                      7)
) AS v(cd, cd_nm, cd_desc, sort_ord) ON true
WHERE g.cd_grp_cd = 'TTL_CTGR_CD'
  AND g.vers = 0
  AND g.del_yn = false
  AND NOT EXISTS (
    SELECT 1 FROM public.cmm_cd_mst c
    WHERE c.cd_grp_id = g.cd_grp_id AND c.cd = v.cd AND c.vers = 0 AND c.del_yn = false
  );

-- 2) 러닝 PB 계열 (ttl_group_cd=1)
INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, sort_ord, use_yn, rarity_level, ttl_group_cd, vers, del_yn
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  'auto'::public.ttl_kind_enm,
  'running', v.ttl_nm, v.ttl_desc, v.cond_rule_json::jsonb,
  v.sort_ord, true, v.rarity_level::smallint, 1, 0, false
FROM (VALUES
  ('뉴비',     '기강에 처음 발을 들인 신규 멤버',         '{"type":"membership_days","days":0}',                          1,  1),
  ('런린이',   '가입한지 3달차 초보 러너',                '{"type":"membership_days","days":91}',                         2,  2),
  ('초보',     '10K를 1시간 안에 완주한 러너',            '{"type":"race_pb_under_sec","sport":"10K","sec":3600}',        3,  3),
  ('러너',     '하프마라톤을 2시간 안에 완주한 러너',     '{"type":"race_pb_under_sec","sport":"HALF","sec":7200}',       4,  4),
  ('마라토너', '풀코스를 5시간 안에 완주한 러너',         '{"type":"race_pb_under_sec","sport":"FULL","sec":18000}',      5,  5),
  ('SUB4',    '풀코스 4시간 벽을 넘은 러너',             '{"type":"race_pb_under_sec","sport":"FULL","sec":14400}',      6,  6),
  ('330',     '풀코스 3시간 30분을 깬 러너',             '{"type":"race_pb_under_sec","sport":"FULL","sec":12600}',      7,  7),
  ('싱글',    '풀코스 3시간 10분대 진입한 러너',          '{"type":"race_pb_under_sec","sport":"FULL","sec":11400}',      8,  8),
  ('SUB3',    '풀코스 3시간 벽을 넘은 엘리트 러너',      '{"type":"race_pb_under_sec","sport":"FULL","sec":10800}',      9,  9)
) AS v(ttl_nm, ttl_desc, cond_rule_json, rarity_level, sort_ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ttl_mst t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.ttl_nm = v.ttl_nm AND t.vers = 0 AND t.del_yn = false
);

-- 3) 러닝 완주 횟수 계열 (ttl_group_cd=NULL)
INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, sort_ord, use_yn, rarity_level, ttl_group_cd, vers, del_yn
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  'auto'::public.ttl_kind_enm,
  'running', v.ttl_nm, v.ttl_desc, v.cond_rule_json::jsonb,
  v.sort_ord, true, v.rarity_level::smallint, NULL, 0, false
FROM (VALUES
  ('10K',     '10K 대회를 완주한 적 있는 러너',           '{"type":"race_finish_count","sport":"10K","count":1}',   2, 20),
  ('HALF',    '하프마라톤을 완주한 적 있는 러너',          '{"type":"race_finish_count","sport":"HALF","count":1}',  3, 21),
  ('FULL',    '풀코스 마라톤을 완주한 적 있는 러너',       '{"type":"race_finish_count","sport":"FULL","count":1}',  4, 22),
  ('단거리',  '10K를 10번 완주한 레이스 단골',             '{"type":"race_finish_count","sport":"10K","count":10}',  4, 23),
  ('하프중독','하프를 10번 완주한 하프마라톤 중독자',       '{"type":"race_finish_count","sport":"HALF","count":10}', 5, 24),
  ('풀마니아','풀코스를 10번 완주한 마라톤 마니아',        '{"type":"race_finish_count","sport":"FULL","count":10}', 6, 25)
) AS v(ttl_nm, ttl_desc, cond_rule_json, rarity_level, sort_ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ttl_mst t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.ttl_nm = v.ttl_nm AND t.vers = 0 AND t.del_yn = false
);

-- 4) 러닝 랭킹 계열 (ttl_group_cd=NULL)
INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, sort_ord, use_yn, rarity_level, ttl_group_cd, vers, del_yn
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  'auto'::public.ttl_kind_enm,
  'running', v.ttl_nm, v.ttl_desc, v.cond_rule_json::jsonb,
  v.sort_ord, true, v.rarity_level::smallint, NULL, 0, false
FROM (VALUES
  ('기강1황',    '기강 남자 풀코스 PB 1위',                             '{"type":"race_rank_by_gender","sport":"FULL","gender":"male","rank":1}',                                          10, 30),
  ('Queen',      '기강 여자 풀코스 PB 1위',                             '{"type":"race_rank_by_gender","sport":"FULL","gender":"female","rank":1}',                                        10, 31),
  ('하프킹',     '기강 남자 하프 PB 1위',                               '{"type":"race_rank_by_gender","sport":"HALF","gender":"male","rank":1}',                                          9,  32),
  ('하프퀸',     '기강 여자 하프 PB 1위',                               '{"type":"race_rank_by_gender","sport":"HALF","gender":"female","rank":1}',                                        9,  33),
  ('단거리왕',   '기강 10K PB 1위 (남녀 각각 부여)',                     '{"type":"race_rank_by_gender","sport":"10K","gender":"any","rank":1}',                                           8,  34),
  ('마지막영웅', '풀·하프·10K 남녀 각각 꼴찌 기록 보유자에게 부여',      '{"type":"race_rank_last","sports":["FULL","HALF","10K"],"gender":"any"}',                                        3,  35),
  ('억울해?',    '풀코스 PB가 목표 기록 5초 이내 미달',                  '{"type":"race_pb_within_sec_of_target","sport":"FULL","targets":[14400,12600,11400,10800],"within_sec":5}',       4,  36)
) AS v(ttl_nm, ttl_desc, cond_rule_json, rarity_level, sort_ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ttl_mst t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.ttl_nm = v.ttl_nm AND t.vers = 0 AND t.del_yn = false
);

-- 5) 트레일 완주 계열 + 山神
INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, sort_ord, use_yn, rarity_level, ttl_group_cd, vers, del_yn
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  'auto'::public.ttl_kind_enm,
  'trail', v.ttl_nm, v.ttl_desc, v.cond_rule_json::jsonb,
  v.sort_ord, true, v.rarity_level::smallint, v.ttl_group_cd, 0, false
FROM (VALUES
  ('동네언덕', '트레일런 대회를 완주한 적 있는 러너',   '{"type":"race_finish_count","sport_ctgr":"trail_run","count":1}',                                  3,  1, 2),
  ('뒷산주민', '20K 트레일런을 완주한 러너',            '{"type":"race_finish_count","sport":"20K","sport_ctgr":"trail_run","count":1}',                    5,  2, 2),
  ('새벽산꾼', '50K 트레일런을 완주한 러너',            '{"type":"race_finish_count","sport":"50K","sport_ctgr":"trail_run","count":1}',                    7,  3, 2),
  ('산악대장', '100K 트레일런을 완주한 러너',           '{"type":"race_finish_count","sport":"100K","sport_ctgr":"trail_run","count":1}',                   9,  4, 2),
  ('산신령',   '100M 트레일런을 완주한 러너',           '{"type":"race_finish_count","sport":"100M","sport_ctgr":"trail_run","count":1}',                   10, 5, 2),
  ('山神',     '기강 트레일런 PB 남녀 각각 1위',        '{"type":"race_rank_by_gender","sport_ctgr":"trail_run","gender":"any","rank":1}',                  10, 6, NULL)
) AS v(ttl_nm, ttl_desc, cond_rule_json, rarity_level, sort_ord, ttl_group_cd)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ttl_mst t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.ttl_nm = v.ttl_nm AND t.vers = 0 AND t.del_yn = false
);

-- 6) 제네럴 가입 기간 계열
INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, sort_ord, use_yn, rarity_level, ttl_group_cd, vers, del_yn
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  'auto'::public.ttl_kind_enm,
  'general', v.ttl_nm, v.ttl_desc, v.cond_rule_json::jsonb,
  v.sort_ord, true, v.rarity_level::smallint, NULL, 0, false
FROM (VALUES
  ('1년차',  '기강에 가입한 지 1년이 된 멤버',          '{"type":"membership_days","days":365}',        5, 10),
  ('고인물', '기강 가입 2년 이상의 베테랑',              '{"type":"membership_days","days":730}',        6, 11),
  ('화석',   '기강 가입 3년 이상, 이미 전설이 된 멤버', '{"type":"membership_days","days":1095}',       7, 12),
  ('7월7일', '7월 7일에 가입한 행운의 멤버',            '{"type":"joined_on_date","month":7,"day":7}',  4, 13)
) AS v(ttl_nm, ttl_desc, cond_rule_json, rarity_level, sort_ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ttl_mst t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.ttl_nm = v.ttl_nm AND t.vers = 0 AND t.del_yn = false
);

-- 7) 제네럴 계절 계열
INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, sort_ord, use_yn, rarity_level, ttl_group_cd, vers, del_yn
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  'auto'::public.ttl_kind_enm,
  'general', v.ttl_nm, v.ttl_desc, v.cond_rule_json::jsonb,
  v.sort_ord, true, v.rarity_level::smallint, NULL, 0, false
FROM (VALUES
  ('봄',    '3~4월에 대회를 완주한 멤버',                          '{"type":"race_finish_in_month_range","months":[3,4]}',                           3, 20),
  ('여름',  '7~8월 뙤약볕 아래 대회를 완주한 멤버',                '{"type":"race_finish_in_month_range","months":[7,8]}',                           5, 21),
  ('가을',  '10~11월에 대회를 완주한 멤버',                        '{"type":"race_finish_in_month_range","months":[10,11]}',                         3, 22),
  ('겨울',  '12~1월 추위를 뚫고 대회를 완주한 멤버',               '{"type":"race_finish_in_month_range","months":[12,1]}',                          5, 23),
  ('사계절','봄·여름·가을·겨울 칭호를 모두 보유한 연중무휴 멤버',  '{"type":"race_finish_all_titles","ttl_nms":["봄","여름","가을","겨울"]}',         6, 24)
) AS v(ttl_nm, ttl_desc, cond_rule_json, rarity_level, sort_ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ttl_mst t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.ttl_nm = v.ttl_nm AND t.vers = 0 AND t.del_yn = false
);

-- 8) 제네럴 복합 조건 계열 (서브현근 제외 — target_mem_id 실제값 필요, 관리자 페이지에서 직접 등록)
INSERT INTO public.ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, sort_ord, use_yn, rarity_level, ttl_group_cd, vers, del_yn
)
SELECT
  'c0ffee00-0000-4000-8000-000000000001'::uuid,
  'auto'::public.ttl_kind_enm,
  'general', v.ttl_nm, v.ttl_desc, v.cond_rule_json::jsonb,
  v.sort_ord, true, v.rarity_level::smallint, NULL, 0, false
FROM (VALUES
  ('멀티러너',    '10K·하프·풀을 모두 완주한 전천후 러너',                         '{"type":"race_finish_all_of","sports":["10K","HALF","FULL"],"count":1}',                            4, 30),
  ('대회왕',      '종목 구분 없이 대회를 20회 이상 완주한 대회 덕후',               '{"type":"race_finish_total","count":20}',                                                           6, 31),
  ('시즌러너',    '한 해에 대회를 5회 이상 완주한 성실한 멤버',                     '{"type":"race_finish_in_year","count":5}',                                                          4, 32),
  ('돈을 달린다', '한 해에 대회를 10회 이상 완주한, 스포츠에 지갑을 열어둔 사람',  '{"type":"race_finish_in_year","count":10}',                                                         6, 33),
  ('전천후',      '러닝·트레일·철인·사이클 칭호를 각 1개 이상 보유한 멀티 스포츠인','{"type":"has_title_in_categories","categories":["running","trail","triathlon","cycling"]}',        8, 35)
) AS v(ttl_nm, ttl_desc, cond_rule_json, rarity_level, sort_ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ttl_mst t
  WHERE t.team_id = 'c0ffee00-0000-4000-8000-000000000001'::uuid
    AND t.ttl_nm = v.ttl_nm AND t.vers = 0 AND t.del_yn = false
);
