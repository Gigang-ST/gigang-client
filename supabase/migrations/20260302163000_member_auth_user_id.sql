alter table public.member drop constraint if exists member_id_fkey;

alter table public.member
  alter column id set default gen_random_uuid();

alter table public.member
  add column if not exists auth_user_id uuid;

alter table public.member
  add constraint member_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;

alter table public.member
  add constraint member_auth_user_id_key unique (auth_user_id);

update public.member
set auth_user_id = id
where auth_user_id is null
  and exists (select 1 from auth.users u where u.id = member.id);
