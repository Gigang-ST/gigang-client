-- 모임 변경 공지의 카톡 발송 시각.
--
-- 일시·장소를 연속으로 고치면 그때마다 톡방에 공지가 쌓여 도배가 된다. 마지막 발송 시각을
-- 모임 행에 남겨 두고, 10분 안에 또 바뀌면 보내지 않는다(lib/gathering/share-text.ts
-- §shouldSendAfterThrottle).
--
-- 등록·취소는 1회성이라 이 값을 읽지 않는다 — 다만 발송했다는 사실은 같이 기록한다
-- (등록 직후 장소를 고치는 흔한 흐름에서 등록 공지와 변경 공지가 연달아 나가지 않게).
alter table public.gthr_mst
  add column if not exists kakao_sent_at timestamptz;

comment on column public.gthr_mst.kakao_sent_at is
  '카톡 단톡방 공지를 마지막으로 보낸 시각. 변경 공지 도배 방지(10분 묶음) 판정에 쓴다.';
