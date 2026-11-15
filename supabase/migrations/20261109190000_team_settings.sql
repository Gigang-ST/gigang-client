-- 멀티팀 — 팀마다 달라야 하는데 코드·공용 행에 박혀 있던 설정.
--
-- 1) 이펙트 설정(team_effect_cfg): effect_mst 는 팀 구분이 없어, 어느 팀 관리자든 이펙트 등급·사용 여부·
--    해금 조건을 바꾸면 모든 팀에 반영됐다. 해금 조건은 팀별 칭호를 가리키기도 한다(type=title).
--    이펙트 **목록**(코드·이름·종류 — CSS 와 짝)은 공용으로 두고, **팀이 고르는 값**(등급·사용 여부·해금 조건)만
--    (팀, 이펙트)로 뗀다. 팀 행이 없으면 effect_mst 의 값이 기본값이다.
--    effect_mst 자체에 팀을 붙이지 않은 이유: 배포 전 옛 코드가 팀 없이 effect_mst 를 읽어서, 울산 행을
--    넣는 순간 기강 도감에 이펙트가 두 벌씩 보인다.
-- 2) 회비 분류(FEE_ITEM_CD): 공통코드라 한 팀 관리자가 항목을 추가·수정·삭제하면 모든 팀이 바뀌었다.
--    cmm_cd_mst 에 team_id(없으면 공용)를 둔다. 지금 있는 항목(회비·지출·기타·행사비 …)은 코드가
--    이름으로 쓰는 기본 분류라 **공용으로 남기고**, 앞으로 관리자가 추가하는 항목은 그 팀 것이 된다.
--    공용 항목은 관리 화면에서 고칠 수 없다(고치면 다른 팀도 바뀐다).
-- 3) 팀 설정(team_cfg) 기강 값: 코드에 박혀 있던 기강 모임 계좌·채널 주소(오픈채팅·인스타·소모임·가민)를
--    기강 팀 설정 행으로 옮긴다. 두 키 모두 **기본값이 없다**(행이 없으면 안 보인다) — 기본값을 기강 값으로
--    두면 울산 화면에 기강 계좌·기강 채널이 뜬다. 오픈채팅 비밀번호는 비밀값이라 여기 넣지 않는다(runbook).
SET lock_timeout = '3s';

-- ────────────────────────────────────────────────────────────────
-- 1) 이펙트 — 팀이 고르는 값
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_effect_cfg (
  team_id          uuid        NOT NULL REFERENCES public.team_mst(team_id),
  effect_cd        text        NOT NULL REFERENCES public.effect_mst(effect_cd) ON DELETE CASCADE,
  rarity_level     smallint    NOT NULL CHECK (rarity_level BETWEEN 1 AND 10),
  use_yn           boolean     NOT NULL,
  unlock_cond_json jsonb,
  upd_at           timestamptz NOT NULL DEFAULT now(),
  upd_by           uuid        REFERENCES public.mem_mst(mem_id),
  CONSTRAINT pk_team_effect_cfg PRIMARY KEY (team_id, effect_cd)
);

COMMENT ON TABLE public.team_effect_cfg IS
  '팀별 이펙트 설정(등급·사용 여부·해금 조건). 행이 없으면 effect_mst 값이 기본값. 목록 자체는 effect_mst(공용).';

ALTER TABLE public.team_effect_cfg ENABLE ROW LEVEL SECURITY;

-- effect_mst 와 같은 공개 범위(로그인 사용자 읽기). 쓰기는 서버(관리자 액션)만.
DROP POLICY IF EXISTS team_effect_cfg_select_authenticated ON public.team_effect_cfg;
CREATE POLICY team_effect_cfg_select_authenticated ON public.team_effect_cfg
  FOR SELECT TO authenticated
  USING (true);

-- 기강은 지금 값 그대로 자기 행으로 — 앞으로 기강이 바꿔도 effect_mst(다른 팀의 기본값)는 안 변한다.
INSERT INTO public.team_effect_cfg (team_id, effect_cd, rarity_level, use_yn, unlock_cond_json)
SELECT g.team_id, e.effect_cd, e.rarity_level, e.use_yn, e.unlock_cond_json
FROM public.effect_mst e
CROSS JOIN (SELECT team_id FROM public.team_mst WHERE team_cd = 'gigang') g
ON CONFLICT (team_id, effect_cd) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- 2) 회비 분류 — 팀이 추가한 항목은 그 팀 것
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.cmm_cd_mst
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.team_mst(team_id);

COMMENT ON COLUMN public.cmm_cd_mst.team_id IS
  '이 코드를 쓰는 팀. NULL = 모든 팀 공용(대부분의 공통코드). 지금은 회비 분류(FEE_ITEM_CD)의 팀 추가 항목만 채운다.';

-- ────────────────────────────────────────────────────────────────
-- 3) 팀 설정 — 기강 계좌·채널 주소
-- ────────────────────────────────────────────────────────────────
INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, v.cfg_cd, v.cfg_val_json
FROM (SELECT team_id FROM public.team_mst WHERE team_cd = 'gigang') t
CROSS JOIN (VALUES
  ('bank.team_account',
   '{"bank": "카카오뱅크", "number": "3333-09-6788223", "holder": "이현근(기강단장)"}'::jsonb),
  ('social.channels',
   '{"kakao_open_chat": "https://open.kakao.com/o/grnMFGng", "instagram": "https://www.instagram.com/team_gigang", "somoim": "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071", "garmin": "https://connect.garmin.com/app/group/4857390"}'::jsonb)
) AS v(cfg_cd, cfg_val_json)
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_cfg c
  WHERE c.team_id = t.team_id AND c.cfg_cd = v.cfg_cd AND c.vers = 0
);

-- 울산 — 진행 중인 프로젝트가 없을 때 마일리지런 소개를 띄우지 않는다(유저 결정 2026-11-09).
-- 기본값(행 없음)은 소개를 보여 주는 지금 기강 동작이다.
INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, 'project.show_intro', 'false'::jsonb
FROM public.team_mst t
WHERE t.team_cd = 'ulsan'
  AND NOT EXISTS (
    SELECT 1 FROM public.team_cfg c
    WHERE c.team_id = t.team_id AND c.cfg_cd = 'project.show_intro' AND c.vers = 0
  );
