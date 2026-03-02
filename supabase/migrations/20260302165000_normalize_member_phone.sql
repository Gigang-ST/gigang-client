update public.member
set phone = regexp_replace(phone, '\\D', '', 'g')
where phone is not null;
