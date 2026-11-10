-- 팀별 설정 테이블(team_cfg) + 카톡 발송 이력 팀 구분.
--
-- 팀마다 다른 값(카톡방·계좌·오픈채팅·화면 스위치 …)을 컬럼 추가 없이 **키-값 행**으로 둔다.
-- 행이 없으면 코드의 설정 사전(lib/team-cfg/registry.ts) 기본값으로 동작한다 — 기강은 대부분 행 0개로
-- 지금과 같다. 키의 형식·기본값·설명은 코드 사전이 정본이고, 여기엔 값만 산다.
--
-- 이력: 정본 vers=0 한 행 + 바뀔 때마다 이전 값을 vers>0 행으로 보존(공통 vers 규칙, team_mem_rel 과 같은 방식).
-- 보존은 트리거가 한다 — 코드가 빼먹을 수 없게.
--
-- 읽기: 서버(service_role)만. RLS 를 켜고 정책을 두지 않는다 — 나중에 오픈채팅 비밀번호 같은 값이
-- 들어가도 브라우저로 새지 않는다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.team_cfg (
  team_cfg_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid        NOT NULL REFERENCES public.team_mst(team_id),
  cfg_cd       text        NOT NULL,
  cfg_val_json jsonb       NOT NULL,
  vers         integer     NOT NULL DEFAULT 0,
  del_yn       boolean     NOT NULL DEFAULT false,
  crt_at       timestamptz NOT NULL DEFAULT now(),
  upd_at       timestamptz NOT NULL DEFAULT now(),
  crt_by       uuid        REFERENCES public.mem_mst(mem_id),
  upd_by       uuid        REFERENCES public.mem_mst(mem_id),
  CONSTRAINT uq_team_cfg_team_cd_vers UNIQUE (team_id, cfg_cd, vers)
);

COMMENT ON TABLE public.team_cfg IS
  '팀별 설정(키-값). 행 없으면 코드 설정 사전 기본값. vers=0 정본, vers>0 이력(트리거가 보존). service_role 전용.';
COMMENT ON COLUMN public.team_cfg.cfg_cd IS '설정 코드(예: kakao.room_id). 정의는 lib/team-cfg/registry.ts';
COMMENT ON COLUMN public.team_cfg.cfg_val_json IS '값(jsonb). 의미 단위로 저장 — CSS·구현 세부를 넣지 않는다';

ALTER TABLE public.team_cfg ENABLE ROW LEVEL SECURITY;

-- 정본(vers=0)이 바뀌기 직전 이전 값을 이력 행으로 남긴다. 삭제도 del_yn=true UPDATE 로 하므로 함께 잡힌다.
CREATE OR REPLACE FUNCTION public.team_cfg_keep_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next int;
BEGIN
  IF OLD.vers <> 0 THEN
    RETURN NEW; -- 이력 행 자체의 수정은 보존 대상이 아니다
  END IF;
  IF NEW.cfg_val_json IS NOT DISTINCT FROM OLD.cfg_val_json AND NEW.del_yn = OLD.del_yn THEN
    RETURN NEW; -- 값이 그대로면 이력을 늘리지 않는다
  END IF;

  SELECT coalesce(max(vers), 0) + 1 INTO v_next
  FROM public.team_cfg
  WHERE team_id = OLD.team_id AND cfg_cd = OLD.cfg_cd;

  INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json, vers, del_yn, crt_at, upd_at, crt_by, upd_by)
  VALUES (OLD.team_id, OLD.cfg_cd, OLD.cfg_val_json, v_next, OLD.del_yn, OLD.crt_at, OLD.upd_at, OLD.crt_by, OLD.upd_by);

  NEW.upd_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_cfg_keep_history ON public.team_cfg;
CREATE TRIGGER team_cfg_keep_history
  BEFORE UPDATE ON public.team_cfg
  FOR EACH ROW EXECUTE FUNCTION public.team_cfg_keep_history();

REVOKE ALL ON FUNCTION public.team_cfg_keep_history() FROM public, anon, authenticated;

-- 카톡 발송 이력에 팀을 붙인다 — 관리자 발송 이력·다시 보내기가 자기 팀 것만 다루게.
-- 지금까지의 발송은 전부 기강 방으로 나갔으므로 기강으로 채운다.
ALTER TABLE public.kakao_send_hist ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.team_mst(team_id);
UPDATE public.kakao_send_hist SET team_id = 'c0ffee00-0000-4000-8000-000000000001' WHERE team_id IS NULL;
-- 배포 전 옛 코드는 팀 없이 쓴다 — 그 사이 행도 기강으로 채워지게 기본값을 둔다(전환용).
-- 배포 뒤 `20261110110000_after_deploy_cleanup.sql` 이 기본값을 지우고 NOT NULL 로 묶는다(빈 팀 행이 영영 안 보이는 일이 없게).
ALTER TABLE public.kakao_send_hist ALTER COLUMN team_id SET DEFAULT 'c0ffee00-0000-4000-8000-000000000001'::uuid;
COMMENT ON COLUMN public.kakao_send_hist.team_id IS '어느 팀 공지였나. 2026-11-09 이전 행은 전부 기강(당시 방이 하나뿐).';
