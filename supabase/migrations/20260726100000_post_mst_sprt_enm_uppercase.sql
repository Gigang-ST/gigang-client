-- 기록 자랑(post_mst) 종목 값을 개인 운동 종목 정본 코드(대문자)로 통일
--
-- 배경: post_mst.sprt_enm(text)에는 마일리지 정본 코드(RUNNING/TRAIL/SWIMMING, 대문자)와
-- 대회 종목 코드(road_run·cycling)가 섞여 저장돼 있었다. 개인 운동 종목의 정본은 마일리지런의
-- DB enum evt_mlg_sprt_enm(RUNNING/TRAIL/CYCLING/SWIMMING)이므로, 기록 자랑도 그 대문자
-- 체계로 맞춘다. 라벨 함수(lib/sport.ts getSportLabel)가 이 대문자 코드만 받는다.
--
-- **대회 종목(comp_sprt_cd)은 이 마이그레이션과 무관하다** — 컬럼이 다르고 손대지 않는다.
-- post_mst에 잘못 들어온 road_run만 개인 러닝 기록(RUNNING)으로 바로잡는다.
--
-- 마일리지런 테이블(evt_mlg_act_hist)은 이미 enum 대문자라 이전이 필요 없다 — 안 건드린다.
UPDATE public.post_mst SET sprt_enm = 'RUNNING'  WHERE sprt_enm IN ('road_run', 'running');
UPDATE public.post_mst SET sprt_enm = 'TRAIL'    WHERE sprt_enm IN ('trail_run', 'trail');
UPDATE public.post_mst SET sprt_enm = 'CYCLING'  WHERE sprt_enm = 'cycling';
UPDATE public.post_mst SET sprt_enm = 'SWIMMING' WHERE sprt_enm = 'swimming';
-- null(종목 미입력)은 그대로 둔다.
