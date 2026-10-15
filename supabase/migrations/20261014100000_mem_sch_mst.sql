-- 개인 일정 — 본인만 보는 일정(일정 탭 달력·리스트에 함께 그린다)
--
-- sch_post_mst(정보 공유)에 비공개 플래그를 다는 대신 테이블을 따로 둔다. 그 테이블엔 이미
-- 포인트 적립 트리거(trg_pt_sch_post_mst)·비로그인 SELECT 정책·공개 RPC·캘린더 캐시 웹훅·댓글이
-- 붙어 있어, 플래그 하나로 막으려면 그 경로 전부가 "비공개 제외"를 기억해야 한다. 따로 두면
-- 본인 전용 RLS 한 줄로 새는 길이 처음부터 없다. 그래서 이 테이블엔 트리거를 달지 않는다.
--
-- 하루짜리 일정만 담는다: 날짜(date) + 시각(time, KST 벽시계). 시각이 비면 종일.
-- timestamptz 로 두지 않는 건 "날짜"가 본체라서다 — 배포처가 UTC라 timestamptz 는 KST 00~09시에
-- 날짜가 갈리는데, date/time 으로 쪼개면 변환 자체가 없다.
-- 이 파일엔 인덱스를 넣지 않는다(CONCURRENTLY 는 트랜잭션 밖 — 20261014100100_mem_sch_mst_idx.sql).
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.mem_sch_mst (
  mem_sch_id uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid         NOT NULL REFERENCES public.team_mst(team_id) ON DELETE RESTRICT,
  mem_id     uuid         NOT NULL REFERENCES public.mem_mst(mem_id),
  sch_nm     varchar(100) NOT NULL CHECK (length(btrim(sch_nm)) > 0),
  sch_dt     date         NOT NULL,
  stt_tm     time,
  end_tm     time,
  cont_txt   varchar(500),
  del_yn     boolean      NOT NULL DEFAULT false,
  crt_at     timestamptz  NOT NULL DEFAULT now(),
  upd_at     timestamptz  NOT NULL DEFAULT now(),
  -- 종료 시각은 시작 시각이 있을 때만, 그리고 그보다 뒤여야 한다(하루짜리라 자정을 넘지 않는다)
  CONSTRAINT ck_mem_sch_mst_tm CHECK (end_tm IS NULL OR (stt_tm IS NOT NULL AND end_tm > stt_tm))
);
COMMENT ON TABLE  public.mem_sch_mst          IS '개인 일정 — 작성자 본인만 본다. 포인트·알림·캐시 웹훅 트리거 없음';
COMMENT ON COLUMN public.mem_sch_mst.team_id  IS '어느 팀 일정 탭에 그릴지 (요청 호스트의 팀)';
COMMENT ON COLUMN public.mem_sch_mst.mem_id   IS '작성자 = 유일한 열람자';
COMMENT ON COLUMN public.mem_sch_mst.sch_dt   IS '일정 날짜 (KST)';
COMMENT ON COLUMN public.mem_sch_mst.stt_tm   IS '시작 시각 (KST 벽시계). NULL 이면 종일';
COMMENT ON COLUMN public.mem_sch_mst.end_tm   IS '종료 시각 (KST 벽시계, 선택). stt_tm 보다 뒤';
COMMENT ON COLUMN public.mem_sch_mst.cont_txt IS '메모 (선택)';

-- RLS — 본인 것만 읽고 쓴다. 삭제는 del_yn 소프트삭제(UPDATE)라 DELETE 정책은 두지 않는다.
-- mem_id 는 auth.uid() 와 같지 않을 수 있어(OAuth id) v2_rls_resolve_mem_id() 로 맞댄다.
ALTER TABLE public.mem_sch_mst ENABLE ROW LEVEL SECURITY;

-- SELECT 에 del_yn 을 걸지 않는다(조회 쪽이 거른다) — 걸면 소프트삭제 UPDATE 의 새 행이
-- SELECT 정책에 안 보여 RETURNING 이 "new row violates row-level security policy"로 막힌다.
CREATE POLICY "mem_sch_mst_select_own" ON public.mem_sch_mst
  FOR SELECT TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id());

CREATE POLICY "mem_sch_mst_insert_own" ON public.mem_sch_mst
  FOR INSERT TO authenticated
  WITH CHECK (mem_id = public.v2_rls_resolve_mem_id() AND public.v2_rls_auth_in_team(team_id));

CREATE POLICY "mem_sch_mst_update_own" ON public.mem_sch_mst
  FOR UPDATE TO authenticated
  USING (mem_id = public.v2_rls_resolve_mem_id())
  WITH CHECK (mem_id = public.v2_rls_resolve_mem_id());

GRANT SELECT, INSERT, UPDATE ON public.mem_sch_mst TO authenticated;
