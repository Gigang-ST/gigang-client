-- 알림 수신 설정(noti_pref_cfg)을 팀별로 나눈다.
--
-- 지금은 사람당 한 벌이라 두 팀에 가입한 사람이 기강에서 "모임 알림 끄기"를 하면 울산 모임 알림까지
-- 꺼진다. 알림·푸시가 팀별이 되면서(noti_mst·push_sub_rel 은 이미 team_id 가 있다) 설정도 같이 나눈다.
-- 기존 행은 전부 기강에서 만든 설정이므로 기강으로 채운다(당시 팀이 하나뿐).
--
-- 앱: app/actions/upsert-noti-pref.ts 의 onConflict 가 (team_id, mem_id, noti_type_enm) 를 쓴다 —
-- 이 마이그레이션이 먼저 들어가야 한다(유니크 제약이 없으면 upsert 가 실패한다).
SET lock_timeout = '3s';

ALTER TABLE public.noti_pref_cfg ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.team_mst(team_id);
UPDATE public.noti_pref_cfg SET team_id = 'c0ffee00-0000-4000-8000-000000000001' WHERE team_id IS NULL;
ALTER TABLE public.noti_pref_cfg ALTER COLUMN team_id SET NOT NULL;

ALTER TABLE public.noti_pref_cfg DROP CONSTRAINT IF EXISTS noti_pref_cfg_mem_id_noti_type_enm_key;
ALTER TABLE public.noti_pref_cfg DROP CONSTRAINT IF EXISTS uq_noti_pref_cfg_team_mem_type;
ALTER TABLE public.noti_pref_cfg
  ADD CONSTRAINT uq_noti_pref_cfg_team_mem_type UNIQUE (team_id, mem_id, noti_type_enm);

COMMENT ON COLUMN public.noti_pref_cfg.team_id IS
  '어느 팀의 수신 설정인가 — 알림·푸시가 팀별이라 설정도 팀별. 2026-11-09 이전 행은 전부 기강.';
