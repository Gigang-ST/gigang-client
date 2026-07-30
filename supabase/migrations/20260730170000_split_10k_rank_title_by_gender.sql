-- 10K 1위 칭호 성별 분리: 단거리왕(공용) → 총알왕자(남) / 총알공주(여)
--
-- 배경: 풀·하프는 이미 성별로 갈려 있는데(기강1황/Queen, 하프킹/하프퀸) 10K만 한 이름을
-- 공유했다. 조건식(`race_rank_by_gender`)은 `gender:"any"`로 **이미 남녀 1위를 각각** 뽑고
-- 있었으므로, 갈라진 건 이름뿐이고 판정 로직은 그대로다.
--
-- 코드 변경 없음: 엔진은 ttl_mst를 런타임에 읽어 `cond_rule_json.type`으로 평가기를 고른다.
-- `race_rank_by_gender` + `gender:"male"|"female"`은 하프킹/하프퀸이 이미 쓰는 경로다.
--
-- ttl_id를 하드코딩하지 않는다 — dev/prd의 UUID가 서로 다르다. 전부 ttl_nm으로 찾는다.
SET lock_timeout = '3s';

-- ── 1) running 계열 정렬 자리 확보 (34=단거리왕, 35=마지막영웅, 36=억울해?) ──
UPDATE public.ttl_mst
   SET sort_ord = sort_ord + 1
 WHERE ttl_ctgr_cd = 'running'
   AND vers = 0 AND del_yn = false
   AND sort_ord BETWEEN 35 AND 36;

-- ── 2) 새 칭호 2행. team_id·종류·희귀도·공개범위는 단거리왕에서 그대로 물려받는다 ──
INSERT INTO public.ttl_mst
  (team_id, ttl_kind_enm, ttl_ctgr_cd, ttl_nm, ttl_desc,
   cond_rule_json, sort_ord, use_yn, rarity_level, desc_visibility)
SELECT src.team_id, src.ttl_kind_enm, src.ttl_ctgr_cd, v.ttl_nm, v.ttl_desc,
       jsonb_build_object(
         'rank', 1, 'type', 'race_rank_by_gender', 'sport', '10K', 'gender', v.gender
       ),
       v.sort_ord, true, src.rarity_level, src.desc_visibility
  FROM public.ttl_mst src
 CROSS JOIN (VALUES
   ('총알왕자', '기강 남자 10K 1위',  'male',   34),
   ('총알공주', '기강 여자 10K 1위',  'female', 35)
 ) AS v(ttl_nm, ttl_desc, gender, sort_ord)
 WHERE src.ttl_nm = '단거리왕' AND src.vers = 0 AND src.del_yn = false
   -- 재실행 안전장치. **팀 단위로 판정한다** — `ttl_mst`는 team_id별 데이터라 이름만 보면
   -- 한 팀에 이미 있을 때 다른 팀의 INSERT까지 건너뛴다(지금은 팀이 하나지만 그때 조용히 빠진다).
   AND NOT EXISTS (
     SELECT 1 FROM public.ttl_mst x
      WHERE x.team_id = src.team_id
        AND x.ttl_nm = v.ttl_nm AND x.vers = 0 AND x.del_yn = false
   );

-- ── 3) 기존 보유자 이관 ──
-- **행을 지우고 새로 넣지 않는다.** ttl_id만 갈아끼워 `is_prmy_yn`(대표 칭호)·`grnt_at`을
-- 보존한다 — prd 이지현 님이 이걸 대표로 걸어둬서, 새로 부여하는 방식이면 대표 자리가 빈다.
--
-- 출발 칭호·도착 칭호 모두 **보유자가 속한 팀**(`tmr.team_id`)으로 묶는다. 이름만으로 조인하면
-- 여러 팀에 같은 이름이 있을 때 남의 팀 ttl_id로 비결정적으로 옮겨간다.
UPDATE public.mem_ttl_rel r
   SET ttl_id = tgt.ttl_id
  FROM public.ttl_mst old,
       public.team_mem_rel tmr,
       public.mem_mst m,
       public.ttl_mst tgt
 WHERE old.ttl_nm = '단거리왕' AND old.vers = 0 AND old.del_yn = false
   AND r.ttl_id = old.ttl_id AND r.vers = 0 AND r.del_yn = false
   AND tmr.team_mem_id = r.team_mem_id AND tmr.vers = 0 AND tmr.del_yn = false
   AND old.team_id = tmr.team_id
   AND m.mem_id = tmr.mem_id AND m.vers = 0 AND m.del_yn = false
   AND m.gdr_enm IN ('male', 'female')
   AND tgt.team_id = tmr.team_id
   AND tgt.vers = 0 AND tgt.del_yn = false
   AND tgt.ttl_nm = CASE WHEN m.gdr_enm = 'male' THEN '총알왕자' ELSE '총알공주' END;

-- ── 4) 단거리왕 비활성화 ──
-- 행은 남긴다(mem_ttl_rel이 FK로 물고 있어 지우면 이력이 깨진다). use_yn=false면 엔진이
-- 평가 대상에서 빼므로 재부여되지 않는다 — 안 내리면 1위가 총알왕자/총알공주와 단거리왕을 둘 다 단다.
UPDATE public.ttl_mst
   SET use_yn = false
 WHERE ttl_nm = '단거리왕' AND vers = 0 AND del_yn = false;
