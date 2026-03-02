alter table public.competition_registration
  add constraint competition_registration_event_type_required
  check ((role = 'participant' and event_type is not null) or role <> 'participant');

alter table public.competition_registration
  add constraint competition_registration_event_type_uppercase
  check (event_type is null or event_type = upper(event_type));
