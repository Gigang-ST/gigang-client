-- kakao_send_hist — 단톡방 발송 이력
--
-- 왜: 발송 실패가 `console.error` 로만 남아 Vercel 런타임 로그에만 있었다. 허브가 가정용
--   회선 뒤에 있어 회선이 끊기면 공지가 통째로 유실되는데, 앱에는 아무 흔적도 남지 않는다
--   (2026-10-15 실제 사고). 운영진이 "나갔나 안 나갔나"를 앱 안에서 확인하고, 실패한 건을
--   그 자리에서 다시 보낼 수 있어야 한다.
--
-- 성공도 남긴다. 실패만 남기면 "기록이 없다"가 "성공했다"와 "기록 자체가 안 됐다" 둘 중
--   무엇인지 구분되지 않는다.
--
-- `msg_txt` 를 통째로 보관하는 이유: 다시 보내기가 원본 모임을 다시 조회해 문구를 재조립하는
--   방식이면, 그 사이 모임이 바뀌거나 지워졌을 때 보내려던 것과 다른 글이 나간다. 이력은
--   "보내려 했던 바로 그 글"이어야 한다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.kakao_send_hist (
  send_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_nm     text NOT NULL,
  msg_txt     text NOT NULL,
  -- 허브가 실제로 쓴 멱등 키. 다시 보낼 때 이 값을 그대로 재사용해야 허브가 중복을 막아 준다.
  request_id  text,
  status      text NOT NULL CHECK (status IN ('success', 'failed')),
  -- 실패 분류(SDK 의 KakaoError.toJSON). 예: KakaoTimeoutError / KakaoApiError.
  err_name    text,
  err_msg     text,
  http_status integer,
  err_code    text,
  -- 같은 요청을 다시 보내도 안전한가(SDK 판정). 어드민의 "다시 보내기" 노출 기준.
  retryable   boolean NOT NULL DEFAULT false,
  -- 어느 사건이 보냈는지. 예: gathering_created / gathering_updated / pb_sess_open.
  src_type    text,
  src_id      text,
  -- 어드민에서 사람이 다시 보낸 건인가, 그리고 누가 눌렀는가.
  resend_yn   boolean NOT NULL DEFAULT false,
  crt_by      uuid REFERENCES public.mem_mst (mem_id),
  crt_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kakao_send_hist IS
  '카카오 허브 발송 이력(성공·실패 모두). 어드민 "카카오 발송 이력" 화면과 재발송의 원장.';
COMMENT ON COLUMN public.kakao_send_hist.msg_txt IS
  '보내려 했던 본문 전체. 재발송이 원본을 다시 조립하지 않고 이 값을 그대로 쓴다.';
COMMENT ON COLUMN public.kakao_send_hist.request_id IS
  '허브 멱등 키. 재발송 시 그대로 재사용 — 새 값으로 보내면 중복 발송된다.';
COMMENT ON COLUMN public.kakao_send_hist.retryable IS
  'SDK 판정. 409 idempotency_conflict 는 false(이미 접수됨), 429·5xx·전송실패는 true.';

-- 어드민 목록은 항상 최신순 전체 조회다.
CREATE INDEX IF NOT EXISTS kakao_send_hist_crt_at_idx
  ON public.kakao_send_hist (crt_at DESC);
-- 대시보드의 "최근 7일 실패 N건" 배지용.
CREATE INDEX IF NOT EXISTS kakao_send_hist_failed_idx
  ON public.kakao_send_hist (crt_at DESC)
  WHERE status = 'failed';

-- 쓰기는 service_role 전용(앱이 발송 직후 기록한다).
-- 읽기는 관리자만 — 본문에 모임 공지 전문이 들어 있고, 운영 도구라 일반 회원이 볼 이유가 없다.
ALTER TABLE public.kakao_send_hist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_kakao_send_hist" ON public.kakao_send_hist
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_mem_rel tmr
      WHERE tmr.mem_id = (SELECT mem_id FROM public.mem_mst WHERE auth_uid = auth.uid() LIMIT 1)
        AND tmr.role_cd = 'ADMIN'
        AND tmr.vers = 0 AND tmr.del_yn = false
    )
  );
