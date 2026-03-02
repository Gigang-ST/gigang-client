alter table public.competition add column if not exists external_id text;

update public.competition
set external_id = case
  when source = 'runable' then 'RUNABLE:' || source_id
  when source = 'triathlon.or.kr' then 'TRIATHLON:' || source_id
  when source is not null then upper(source) || ':' || source_id
  when source_id is not null then source_id
  else gen_random_uuid()::text
end
where external_id is null;

alter table public.competition alter column external_id set not null;

alter table public.competition drop constraint if exists competition_source_source_id_key;

alter table public.competition drop column if exists source;
alter table public.competition drop column if exists source_id;

alter table public.competition
  add constraint competition_external_id_key unique (external_id);
