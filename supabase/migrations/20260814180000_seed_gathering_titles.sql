-- 모임 계열 신규 칭호 13종 시드.
--
-- 설계: docs/design/2026-07-30-신규-칭호-후보-모임-깅스타그램.md §4
-- 조건 유형 구현: lib/titles/evaluators-gathering.ts
--
-- ⚠️ **eff_stt_dt를 반드시 함께 넣는다**(§7.5). null이면 과거 몇 년치가 통째로 판정되어
--    고인물이 한 번에 대여섯 개를 받고 푸시가 그만큼 나간다.
--      · 월 단위 조건 4종 → 2026-08-01 (달 경계에 맞춰야 "반쪽짜리 달"이 안 생긴다.
--        8/14에 열면 프로참석러는 남은 모임 하나만 나가도 70%가 된다.)
--      · 나머지 9종      → 2026-08-19 (배포일. 이 날부터 새로 쌓는다)
--
-- ⚠️ **시드 후 sweep을 돌리지 않는다.** eff_stt_dt가 과거를 끊으므로 소급 부여가 없고,
--    그래서 "대표 승격 트리거를 끄고 sweep" 절차도 필요 없다 — 애초에 무더기로 붙을 일이 없다.
--
-- desc_visibility 는 칭호별 확정값이다(§4 표):
--   always = 행동을 유도하는 것(노려서 달성해도 크루에 이롭다)
--   held   = 따고 나서야 뜻을 알게 하는 것(미리 보이면 노려서 값이 깎인다)
--   others = 기본값(남이 갖고 있으면 보인다)

INSERT INTO ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, desc_visibility, rarity_level, sort_ord, eff_stt_dt, use_yn, vers, del_yn
)
SELECT
  t.team_id, 'auto'::ttl_kind_enm, 'general', v.ttl_nm, v.ttl_desc,
  v.cond_rule_json::jsonb, v.desc_visibility, v.rarity_level, v.sort_ord, v.eff_stt_dt::date,
  true, 0, false
FROM (VALUES
  -- 월 단위 조건 — 적용일을 달 1일로 당긴다(§7.5)
  ('미라클',     '새벽 7시 이전 모임에 한 달 3번 나오는 아침형 멤버',
   '{"type":"gthr_attend_in_month","count":3,"before_time":"07:00"}', 'always', 6, 300, '2026-08-01'),
  ('오픈런',     '모임 공지가 뜨자마자 가장 먼저 신청하는 멤버',
   '{"type":"gthr_attend_in_month","count":3,"first_applicant":true}', 'always', 5, 301, '2026-08-01'),
  ('올빼미',     '밤 9시 이후 모임에 한 달 3번 나오는 야행성 멤버',
   '{"type":"gthr_attend_in_month","count":3,"after_time":"21:00"}', 'always', 4, 302, '2026-08-01'),
  ('프로참석러', '한 달 모임의 70% 이상을 나온 개근 멤버',
   '{"type":"gthr_month_attend_rate","min_rate":0.7,"min_gatherings":3}', 'always', 9, 303, '2026-08-01'),

  -- 나머지 — 오늘부터
  ('다음엔꼭',   '모임 당일에 참석을 취소하기를 3번 한 멤버',
   '{"type":"gthr_cancel_count","count":3,"same_day":true}', 'others', 3, 310, '2026-08-19'),
  ('회전문',     '한 모임에서 신청과 취소를 오간 멤버',
   '{"type":"gthr_cancel_count","count":2,"same_gathering":true}', 'others', 5, 311, '2026-08-19'),
  ('월요병',     '월요일 모임만 골라 3번 취소한 멤버',
   '{"type":"gthr_cancel_count","count":3,"weekday":1}', 'others', 5, 312, '2026-08-19'),
  ('3연벙',      '사흘 연속으로 모임에 나온 멤버',
   '{"type":"gthr_attend_streak","days":3}', 'held', 4, 313, '2026-08-19'),
  ('하루에두번', '하루에 서로 다른 모임 2개를 모두 참석한 멤버',
   '{"type":"gthr_same_day_count","per_day":2,"count":1}', 'always', 5, 314, '2026-08-19'),
  ('막차',       '정원의 마지막 자리를 채워 모임을 마감시킨 멤버',
   '{"type":"gthr_last_slot","count":2}', 'others', 6, 315, '2026-08-19'),
  ('칼퇴실패',   '야근 때문에 모임을 3번 취소한 멤버',
   '{"type":"gthr_cancel_reason","count":3,"keyword":"야근"}', 'others', 6, 316, '2026-08-19'),
  ('구구절절',   '취소 사유를 40자 넘게 적은 멤버',
   '{"type":"gthr_cancel_reason","count":1,"min_length":40}', 'held', 4, 317, '2026-08-19'),
  ('생일축하해', '생일에 크루와 함께 뛴 멤버',
   '{"type":"attend_on_birthday","count":1}', 'others', 6, 318, '2026-08-19')
) AS v(ttl_nm, ttl_desc, cond_rule_json, desc_visibility, rarity_level, sort_ord, eff_stt_dt)
CROSS JOIN (SELECT team_id FROM team_mst WHERE team_cd = 'gigang' AND del_yn = false LIMIT 1) t
-- 재실행 안전: 같은 이름이 이미 있으면 넣지 않는다.
WHERE NOT EXISTS (
  SELECT 1 FROM ttl_mst x
  WHERE x.team_id = t.team_id AND x.ttl_nm = v.ttl_nm AND x.del_yn = false
);
