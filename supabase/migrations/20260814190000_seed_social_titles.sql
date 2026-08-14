-- 깅스타그램 · 댓글 · 응원 · 대회 계열 신규 칭호 12종 시드.
--
-- 설계: docs/design/2026-07-30-신규-칭호-후보-모임-깅스타그램.md §4
-- 조건 유형 구현: lib/titles/evaluators-social.ts
--
-- eff_stt_dt(§7.5):
--   · 월 단위 조건 2종(연재작가·투머치토커) → 2026-08-01 (달 경계에 맞춰야 반쪽짜리 달이 안 생긴다)
--   · 나머지 9종                            → 2026-08-14 (오늘부터)
--   · **인간화로만 null(소급 허용)** — `rctn_mst`가 (팀 × 항목 × 누른사람) 1행에 rctn_cnt를
--     누적하는 구조라 개별 탭의 시각이 없어 **기간 필터가 구조적으로 불가능**하다.
--     문턱이 1,000이라 소급해도 받을 사람이 극소수다(실측 최대 85).
--
-- desc_visibility(§4 표):
--   always = 행동을 유도하는 것 / held = 따고 나서야 뜻을 알게 할 것 / never = 설명 자체가 스포일러

INSERT INTO ttl_mst (
  team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
  cond_rule_json, desc_visibility, rarity_level, sort_ord, eff_stt_dt, use_yn, vers, del_yn
)
SELECT
  t.team_id, 'auto'::ttl_kind_enm, 'general', v.ttl_nm, v.ttl_desc,
  v.cond_rule_json::jsonb, v.desc_visibility, v.rarity_level, v.sort_ord,
  NULLIF(v.eff_stt_dt, '')::date,
  true, 0, false
FROM (VALUES
  -- 깅스타그램
  ('오운완',      '깅스타그램에 사진을 3장 올린 멤버',
   '{"type":"post_count","count":3}', 'always', 2, 320, '2026-08-14'),
  ('깅플루언서',  '깅스타그램에 사진을 10장 올린 크루 인플루언서',
   '{"type":"post_count","count":10}', 'always', 6, 321, '2026-08-14'),
  ('연재작가',    '한 달에 5일 이상 사진을 올린 연재형 멤버',
   '{"type":"post_days_in_month","days":5}', 'others', 5, 322, '2026-08-01'),
  ('유물발굴',    '14일 넘게 지난 활동 사진을 뒤늦게 올린 멤버',
   '{"type":"post_backfill_days","days":14,"count":1}', 'never', 5, 323, '2026-08-14'),

  -- 댓글
  ('자문자답',    '자기 게시물의 첫 댓글을 3번 직접 단 멤버',
   '{"type":"post_self_first_comment","count":3}', 'others', 6, 330, '2026-08-14'),
  ('말대꾸',      '대댓글을 15개 이상 단 멤버',
   '{"type":"cmnt_reply_count","count":15}', 'others', 4, 331, '2026-08-14'),
  ('소환술사',    '댓글에서 @멘션으로 10번 사람을 부른 멤버',
   '{"type":"cmnt_mention_count","count":10}', 'others', 5, 332, '2026-08-14'),
  ('투머치토커',  '한 달 댓글 수 1위',
   '{"type":"cmnt_monthly_top","min_count":10}', 'never', 5, 333, '2026-08-01'),

  -- 응원 — 유일하게 소급을 허용한다(위 주석 참조)
  ('인간화로',    '받은 응원이 1,000개를 넘은 멤버',
   '{"type":"rctn_recv_total","count":1000}', 'held', 6, 340, ''),

  -- 대회
  ('완벽한기록',  '완주 기록이 정확히 시간 단위로 떨어진 멤버',
   '{"type":"race_time_exact_hour","count":1}', 'never', 10, 350, '2026-08-14'),
  ('하수야~',     '같은 종목 맞대결에서 상대를 역전한 멤버',
   '{"type":"race_pair_reversal","direction":"winner"}', 'others', 8, 351, '2026-08-14'),
  ('고수님..',    '같은 종목 맞대결에서 역전당한 멤버',
   '{"type":"race_pair_reversal","direction":"loser"}', 'others', 8, 352, '2026-08-14')
) AS v(ttl_nm, ttl_desc, cond_rule_json, desc_visibility, rarity_level, sort_ord, eff_stt_dt)
CROSS JOIN (SELECT team_id FROM team_mst WHERE team_cd = 'gigang' AND del_yn = false LIMIT 1) t
-- 재실행 안전: 같은 이름이 이미 있으면 넣지 않는다.
WHERE NOT EXISTS (
  SELECT 1 FROM ttl_mst x
  WHERE x.team_id = t.team_id AND x.ttl_nm = v.ttl_nm AND x.del_yn = false
);
