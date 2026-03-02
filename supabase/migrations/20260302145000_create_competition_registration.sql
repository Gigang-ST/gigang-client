create type public.participation_role as enum ('participant', 'cheering', 'volunteer');

create table public.competition_registration (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competition(id) on delete cascade,
  member_id uuid not null references public.member(id) on delete cascade,
  role public.participation_role not null,
  event_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, member_id)
);

create trigger competition_registration_set_updated_at
before update on public.competition_registration
for each row
execute function public.set_updated_at();
