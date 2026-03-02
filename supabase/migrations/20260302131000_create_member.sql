create type public.gender as enum ('male', 'female');
create type public.member_status as enum ('active', 'inactive', 'banned');
create table public.member (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name varchar not null,
  gender public.gender not null,
  birthday date not null,
  phone varchar not null,
  status public.member_status not null,
  admin boolean not null default false,
  joined_at date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger member_set_updated_at
before update on public.member
for each row
execute function public.set_updated_at();
