alter table public.member
  add column email varchar not null;
alter table public.member
  add constraint member_email_unique unique (email);
