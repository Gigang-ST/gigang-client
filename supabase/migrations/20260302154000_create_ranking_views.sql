create view public.competition_ranking_by_gender as
select
  r.id,
  r.member_id,
  r.competition_id,
  r.event_type,
  r.finish_time_sec,
  r.finish_time_hhmmss,
  r.finish_date,
  m.gender,
  dense_rank() over (
    partition by r.competition_id, r.event_type, m.gender
    order by r.finish_time_sec asc
  ) as rank_gender
from public.competition_result r
join public.member m on m.id = r.member_id;

create view public.member_best_result as
select * from (
  select
    r.id,
    r.member_id,
    r.event_type,
    r.finish_time_sec,
    r.finish_time_hhmmss,
    r.finish_date,
    m.gender,
    row_number() over (
      partition by r.member_id, r.event_type
      order by r.finish_time_sec asc
    ) as rn
  from public.competition_result r
  join public.member m on m.id = r.member_id
) t
where t.rn = 1;

create view public.member_ranking_by_gender_distance as
select
  b.member_id,
  b.gender,
  b.event_type,
  b.finish_time_sec,
  b.finish_time_hhmmss,
  b.finish_date,
  dense_rank() over (
    partition by b.gender, b.event_type
    order by b.finish_time_sec asc
  ) as rank_gender_distance
from public.member_best_result b;

create view public.utmb_ranking_by_gender_distance as
select
  u.member_id,
  m.gender,
  u.distance_label,
  sum(u.points) as total_points,
  dense_rank() over (
    partition by m.gender, u.distance_label
    order by sum(u.points) desc
  ) as rank_gender_distance
from public.utmb_result u
join public.member m on m.id = u.member_id
group by u.member_id, m.gender, u.distance_label;
