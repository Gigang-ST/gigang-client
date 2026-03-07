-- race_result: 모든 대회 기록을 저장하는 테이블
create table public.race_result (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member(id) on delete cascade,
  event_type varchar not null,
  record_time_sec integer not null,
  race_name varchar not null,
  race_date date not null,
  created_at timestamptz not null default now()
);

-- 성능용 복합 인덱스
create index race_result_member_event on public.race_result(member_id, event_type);

-- RLS 활성화
alter table public.race_result enable row level security;

-- 누구나 조회 가능 (anon + authenticated)
create policy "anyone_select" on public.race_result
  for select using (true);

-- 로그인한 사용자: 본인 데이터 삽입
create policy "own_insert" on public.race_result
  for insert to authenticated
  with check (member_id = auth.uid());

-- 로그인한 사용자: 본인 데이터 수정
create policy "own_update" on public.race_result
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- 로그인한 사용자: 본인 데이터 삭제
create policy "own_delete" on public.race_result
  for delete to authenticated
  using (member_id = auth.uid());

-- 종목별 개인 최고기록 View (기강의전당용)
create view public.personal_best_view as
select distinct on (member_id, event_type)
  member_id,
  event_type,
  record_time_sec,
  race_name,
  race_date
from public.race_result
order by member_id, event_type, record_time_sec asc;
