-- 재가입(재활성) 요청 저장 (#767)
--
-- 배경: 탈퇴·비활성 회원의 재가입 요청이 운영진 알림(reactivate_req)으로만 존재했다. 알림을 놓치거나
-- 지우면 요청이 사라지고 회원관리에서 모아 볼 곳이 없었다. 요청 한 건을 행으로 남기고,
-- 운영진이 활성으로 바꾸면 같은 행을 「처리됨」으로 닫는다.
--
-- 쓰기·읽기는 서버(service_role: 서버 액션·운영진 화면 서버 컴포넌트)만 — authenticated/anon 권한 없음.
-- 회원당 대기 요청은 한 건(부분 유니크) — 같은 사람이 여러 번 눌러도 한 줄이다.
-- 적용 순서: 이 마이그레이션 → 앱 배포. 옛 앱은 이 테이블을 모른다(요청은 알림으로만 가던 그대로).
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.mem_reactv_req (
  reactv_req_id uuid        NOT NULL DEFAULT gen_random_uuid(),
  team_id       uuid        NOT NULL,
  mem_id        uuid        NOT NULL,
  req_mem_st_cd varchar     NOT NULL,                  -- 요청할 때의 회원 상태: left(재가입 요청) / inactive(활동 재개 문의)
  req_stts_cd   varchar     NOT NULL DEFAULT 'pending', -- pending 대기 / done 처리됨(활성으로 바뀜)
  crt_at        timestamptz NOT NULL DEFAULT now(),    -- 요청 시각
  prc_at        timestamptz,                           -- 처리 시각
  prc_mem_id    uuid,                                  -- 처리한 운영진
  CONSTRAINT pk_mem_reactv_req PRIMARY KEY (reactv_req_id),
  CONSTRAINT fk_mem_reactv_req__team_mst FOREIGN KEY (team_id) REFERENCES public.team_mst (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_mem_reactv_req__mem_mst FOREIGN KEY (mem_id) REFERENCES public.mem_mst (mem_id) ON DELETE CASCADE,
  CONSTRAINT ck_mem_reactv_req_stts CHECK (req_stts_cd IN ('pending', 'done')),
  CONSTRAINT ck_mem_reactv_req_mem_st CHECK (req_mem_st_cd IN ('left', 'inactive'))
);

-- 회원당 대기 요청은 하나
CREATE UNIQUE INDEX IF NOT EXISTS uk_mem_reactv_req_pending
  ON public.mem_reactv_req (team_id, mem_id) WHERE req_stts_cd = 'pending';
CREATE INDEX IF NOT EXISTS ix_mem_reactv_req_team_crt
  ON public.mem_reactv_req (team_id, crt_at DESC);

COMMENT ON TABLE public.mem_reactv_req IS '재가입·활동 재개 요청(#767) — 회원이 앱에서 요청하면 pending, 운영진이 활성으로 바꾸면 done';

ALTER TABLE public.mem_reactv_req ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mem_reactv_req FROM anon, authenticated;
GRANT ALL ON TABLE public.mem_reactv_req TO service_role;
