-- 기록 변경 시 다음 달 목표를 자동 갱신하는 트리거
-- 목표 상향 규칙: <50km → +10, 50~100km → +15, >=100km → +20

create or replace function calc_next_month_goal(current_goal numeric, achieved boolean)
returns numeric language plpgsql immutable as $$
begin
  if not achieved then return current_goal; end if;
  if current_goal < 50 then return current_goal + 10; end if;
  if current_goal < 100 then return current_goal + 15; end if;
  return current_goal + 20;
end;
$$;

create or replace function sync_next_month_goal()
returns trigger language plpgsql as $$
declare
  v_participation_id uuid;
  v_activity_date date;
  v_activity_month date;
  v_next_month date;
  v_end_month date;
  v_goal_km numeric(8,2);
  v_total_mileage numeric;
  v_new_goal numeric;
begin
  -- INSERT/UPDATE는 NEW, DELETE는 OLD
  if tg_op = 'DELETE' then
    v_participation_id := old.participation_id;
    v_activity_date := old.activity_date;
  else
    v_participation_id := new.participation_id;
    v_activity_date := new.activity_date;
  end if;

  -- 해당 기록이 속한 월의 첫째 날
  v_activity_month := date_trunc('month', v_activity_date)::date;
  v_next_month := (v_activity_month + interval '1 month')::date;

  -- 프로젝트 종료월 확인
  select p.end_month::date into v_end_month
  from project_participation pp
  join project p on pp.project_id = p.id
  where pp.id = v_participation_id;

  if v_end_month is not null and v_next_month > v_end_month then
    return coalesce(new, old);
  end if;

  -- 해당 월 목표 조회
  select goal_km into v_goal_km
  from mileage_goal
  where participation_id = v_participation_id
    and month = v_activity_month;

  if v_goal_km is null then
    return coalesce(new, old);
  end if;

  -- 해당 월 마일리지 합산
  select coalesce(sum(final_mileage), 0) into v_total_mileage
  from activity_log
  where participation_id = v_participation_id
    and activity_date >= v_activity_month
    and activity_date < v_next_month;

  -- 다음 달 목표 계산
  v_new_goal := calc_next_month_goal(v_goal_km, v_total_mileage >= v_goal_km);

  -- 다음 달 목표 upsert
  insert into mileage_goal (participation_id, month, goal_km)
  values (v_participation_id, v_next_month, v_new_goal)
  on conflict (participation_id, month)
  do update set goal_km = excluded.goal_km;

  return coalesce(new, old);
end;
$$;

-- 트리거 생성
create trigger trg_sync_next_month_goal
  after insert or update or delete on activity_log
  for each row execute function sync_next_month_goal();
