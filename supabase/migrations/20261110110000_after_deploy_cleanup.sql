-- ⚠️ **배포 뒤에만** 적용한다 — 멀티팀 코드(feature/multi-team)가 운영에 나간 다음.
--
-- 배포 전 옛 코드와 같이 돌도록 남겨 둔 전환용 장치를 걷는다(2026-11-10 2차 리뷰 1·중간 항목).
--   1) 알림 수신 설정(noti_pref_cfg): 옛 유니크 (mem_id, noti_type_enm) 와 팀 기본값 제거.
--      옛 유니크가 남아 있으면 한 사람이 두 팀에서 같은 알림을 따로 끄고 켤 수 없다.
--   2) 카톡 발송 이력(kakao_send_hist): 배포 사이 빈 팀 행을 기강으로 채우고 기본값 제거 + NOT NULL.
--      비어 있으면 팀별 이력·실패 수·다시 보내기(`.eq("team_id", …)`)에서 영영 안 보인다.
--   3) 건의(fdbk_mst): 팀 기본값(기강) 제거 — 새 코드는 늘 팀을 넣는다.
-- 배포 전에 적용하면 옛 코드의 알림 설정 저장·카톡 이력·건의 제출이 실패한다.
SET lock_timeout = '3s';

-- 1) 알림 수신 설정
ALTER TABLE public.noti_pref_cfg DROP CONSTRAINT IF EXISTS noti_pref_cfg_mem_id_noti_type_enm_key;
ALTER TABLE public.noti_pref_cfg ALTER COLUMN team_id DROP DEFAULT;

-- 2) 카톡 발송 이력 — 배포 사이 옛 코드가 남긴 행은 전부 기강(당시 방이 기강 하나뿐)
UPDATE public.kakao_send_hist SET team_id = 'c0ffee00-0000-4000-8000-000000000001' WHERE team_id IS NULL;
ALTER TABLE public.kakao_send_hist ALTER COLUMN team_id DROP DEFAULT;
ALTER TABLE public.kakao_send_hist ALTER COLUMN team_id SET NOT NULL;

-- 3) 건의
ALTER TABLE public.fdbk_mst ALTER COLUMN team_id DROP DEFAULT;
