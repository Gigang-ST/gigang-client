alter table "public"."member" drop constraint "member_email_unique";

alter table "public"."competition_registration" drop constraint "competition_registration_competition_id_fkey";

alter table "public"."competition_registration" drop constraint "competition_registration_member_id_fkey";

alter table "public"."personal_best" drop constraint "personal_best_member_id_fkey";

alter table "public"."race_result" drop constraint "race_result_member_id_fkey";

alter table "public"."utmb_profile" drop constraint "utmb_profile_member_id_fkey";

drop view if exists "public"."personal_best_view";

drop index if exists "public"."member_email_unique";

alter table "public"."competition" alter column "external_id" drop not null;

CREATE UNIQUE INDEX member_email_key ON public.member USING btree (email);

alter table "public"."member" add constraint "member_email_key" UNIQUE using index "member_email_key";

alter table "public"."competition_registration" add constraint "competition_registration_competition_id_fkey" FOREIGN KEY (competition_id) REFERENCES public.competition(id) not valid;

alter table "public"."competition_registration" validate constraint "competition_registration_competition_id_fkey";

alter table "public"."competition_registration" add constraint "competition_registration_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.member(id) not valid;

alter table "public"."competition_registration" validate constraint "competition_registration_member_id_fkey";

alter table "public"."personal_best" add constraint "personal_best_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.member(id) not valid;

alter table "public"."personal_best" validate constraint "personal_best_member_id_fkey";

alter table "public"."race_result" add constraint "race_result_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.member(id) not valid;

alter table "public"."race_result" validate constraint "race_result_member_id_fkey";

alter table "public"."utmb_profile" add constraint "utmb_profile_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.member(id) not valid;

alter table "public"."utmb_profile" validate constraint "utmb_profile_member_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.revalidate_records()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  _secret text;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'revalidate_secret'
  LIMIT 1;

  PERFORM extensions.http_post(
    url := 'https://gigang.team/api/revalidate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _secret
    ),
    body := '{}'::jsonb
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Silently ignore errors in dev (vault secret may not exist)
  RETURN NULL;
END;
$function$
;


