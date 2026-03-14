


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."gender" AS ENUM (
    'male',
    'female'
);


ALTER TYPE "public"."gender" OWNER TO "postgres";


CREATE TYPE "public"."member_status" AS ENUM (
    'active',
    'inactive',
    'banned',
    'pending'
);


ALTER TYPE "public"."member_status" OWNER TO "postgres";


CREATE TYPE "public"."participation_role" AS ENUM (
    'participant',
    'cheering',
    'volunteer'
);


ALTER TYPE "public"."participation_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revalidate_records"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _secret text;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'revalidate_secret'
  LIMIT 1;

  PERFORM net.http_post(
    url := 'https://gigang.team/api/revalidate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _secret
    ),
    body := '{}'::jsonb
  );
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."revalidate_records"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."competition" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sport" "text",
    "title" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "location" "text",
    "event_types" "text"[],
    "source_url" "text",
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_id" "text" NOT NULL
);


ALTER TABLE "public"."competition" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competition_registration" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "role" "public"."participation_role" NOT NULL,
    "event_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "competition_registration_event_type_required" CHECK (((("role" = 'participant'::"public"."participation_role") AND ("event_type" IS NOT NULL)) OR ("role" <> 'participant'::"public"."participation_role"))),
    CONSTRAINT "competition_registration_event_type_uppercase" CHECK ((("event_type" IS NULL) OR ("event_type" = "upper"("event_type"))))
);


ALTER TABLE "public"."competition_registration" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" character varying NOT NULL,
    "gender" "public"."gender" NOT NULL,
    "birthday" "date" NOT NULL,
    "phone" character varying NOT NULL,
    "status" "public"."member_status" NOT NULL,
    "admin" boolean DEFAULT false NOT NULL,
    "joined_at" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" character varying,
    "bank_account" "text",
    "bank_name" "text",
    "kakao_user_id" "uuid",
    "google_user_id" "uuid",
    "avatar_url" "text"
);


ALTER TABLE "public"."member" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_best" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "record_time_sec" integer,
    "race_name" "text" NOT NULL,
    "race_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_best_event_type_check" CHECK (("event_type" = ANY (ARRAY['5K'::"text", '10K'::"text", 'HALF'::"text", 'FULL'::"text", 'TRIATHLON'::"text", 'TRIATHLON_FULL'::"text", 'TRIATHLON_HALF'::"text", 'TRIATHLON_OLYMPIC'::"text"]))),
    CONSTRAINT "personal_best_record_check" CHECK (("record_time_sec" > 0))
);


ALTER TABLE "public"."personal_best" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."race_result" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "event_type" character varying NOT NULL,
    "record_time_sec" integer NOT NULL,
    "race_name" character varying NOT NULL,
    "race_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "swim_time_sec" integer,
    "bike_time_sec" integer,
    "run_time_sec" integer
);


ALTER TABLE "public"."race_result" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."personal_best_view" AS
 SELECT DISTINCT ON ("member_id", "event_type") "member_id",
    "event_type",
    "record_time_sec",
    "race_name",
    "race_date"
   FROM "public"."race_result"
  ORDER BY "member_id", "event_type", "record_time_sec";


ALTER VIEW "public"."personal_best_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."utmb_profile" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "utmb_profile_url" "text" NOT NULL,
    "utmb_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "utmb_profile_utmb_index_check" CHECK (("utmb_index" >= 0))
);


ALTER TABLE "public"."utmb_profile" OWNER TO "postgres";


ALTER TABLE ONLY "public"."competition"
    ADD CONSTRAINT "competition_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."competition"
    ADD CONSTRAINT "competition_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_registration"
    ADD CONSTRAINT "competition_registration_competition_id_member_id_key" UNIQUE ("competition_id", "member_id");



ALTER TABLE ONLY "public"."competition_registration"
    ADD CONSTRAINT "competition_registration_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member"
    ADD CONSTRAINT "member_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."member"
    ADD CONSTRAINT "member_google_user_id_key" UNIQUE ("google_user_id");



ALTER TABLE ONLY "public"."member"
    ADD CONSTRAINT "member_kakao_user_id_key" UNIQUE ("kakao_user_id");



ALTER TABLE ONLY "public"."member"
    ADD CONSTRAINT "member_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_best"
    ADD CONSTRAINT "personal_best_member_id_event_type_key" UNIQUE ("member_id", "event_type");



ALTER TABLE ONLY "public"."personal_best"
    ADD CONSTRAINT "personal_best_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."race_result"
    ADD CONSTRAINT "race_result_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."utmb_profile"
    ADD CONSTRAINT "utmb_profile_member_id_key" UNIQUE ("member_id");



ALTER TABLE ONLY "public"."utmb_profile"
    ADD CONSTRAINT "utmb_profile_pkey" PRIMARY KEY ("id");



CREATE INDEX "competition_start_date_idx" ON "public"."competition" USING "btree" ("start_date");



CREATE INDEX "competition_title_trgm_idx" ON "public"."competition" USING "gin" ("title" "public"."gin_trgm_ops");



CREATE INDEX "race_result_member_event" ON "public"."race_result" USING "btree" ("member_id", "event_type");



CREATE OR REPLACE TRIGGER "member_set_updated_at" BEFORE UPDATE ON "public"."member" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "revalidate_records_on_personal_best" AFTER INSERT OR DELETE OR UPDATE ON "public"."personal_best" FOR EACH STATEMENT EXECUTE FUNCTION "public"."revalidate_records"();



CREATE OR REPLACE TRIGGER "revalidate_records_on_utmb_profile" AFTER INSERT OR DELETE OR UPDATE ON "public"."utmb_profile" FOR EACH STATEMENT EXECUTE FUNCTION "public"."revalidate_records"();



ALTER TABLE ONLY "public"."competition_registration"
    ADD CONSTRAINT "competition_registration_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_registration"
    ADD CONSTRAINT "competition_registration_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_best"
    ADD CONSTRAINT "personal_best_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."race_result"
    ADD CONSTRAINT "race_result_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."utmb_profile"
    ADD CONSTRAINT "utmb_profile_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE CASCADE;



CREATE POLICY "anyone_select" ON "public"."race_result" FOR SELECT USING (true);



ALTER TABLE "public"."competition" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competition_delete_admin" ON "public"."competition" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."member"
  WHERE (("member"."admin" = true) AND (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))));



CREATE POLICY "competition_insert_admin" ON "public"."competition" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."member"
  WHERE (("member"."admin" = true) AND (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."competition_registration" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "competition_select_all" ON "public"."competition" FOR SELECT USING (true);



CREATE POLICY "competition_update_admin" ON "public"."competition" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."member"
  WHERE (("member"."admin" = true) AND (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."member"
  WHERE (("member"."admin" = true) AND (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))));



CREATE POLICY "own_delete" ON "public"."race_result" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."member"
  WHERE (("member"."id" = "race_result"."member_id") AND (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))));



CREATE POLICY "own_insert" ON "public"."race_result" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."member"
  WHERE (("member"."id" = "race_result"."member_id") AND (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))));



CREATE POLICY "own_update" ON "public"."race_result" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."member"
  WHERE (("member"."id" = "race_result"."member_id") AND (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."member"
  WHERE (("member"."id" = "race_result"."member_id") AND (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."personal_best" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_best_delete" ON "public"."personal_best" FOR DELETE TO "authenticated" USING (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));



CREATE POLICY "personal_best_insert" ON "public"."personal_best" FOR INSERT TO "authenticated" WITH CHECK (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));



CREATE POLICY "personal_best_select" ON "public"."personal_best" FOR SELECT USING (true);



CREATE POLICY "personal_best_update" ON "public"."personal_best" FOR UPDATE TO "authenticated" USING (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))) WITH CHECK (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."race_result" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registration_delete_own" ON "public"."competition_registration" FOR DELETE TO "authenticated" USING (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));



CREATE POLICY "registration_insert_own" ON "public"."competition_registration" FOR INSERT TO "authenticated" WITH CHECK (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));



CREATE POLICY "registration_select_all" ON "public"."competition_registration" FOR SELECT USING (true);



CREATE POLICY "registration_update_own" ON "public"."competition_registration" FOR UPDATE TO "authenticated" USING (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))) WITH CHECK (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."utmb_profile" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "utmb_profile_delete" ON "public"."utmb_profile" FOR DELETE TO "authenticated" USING (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));



CREATE POLICY "utmb_profile_insert" ON "public"."utmb_profile" FOR INSERT TO "authenticated" WITH CHECK (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));



CREATE POLICY "utmb_profile_select" ON "public"."utmb_profile" FOR SELECT USING (true);



CREATE POLICY "utmb_profile_update" ON "public"."utmb_profile" FOR UPDATE TO "authenticated" USING (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"()))))) WITH CHECK (("member_id" IN ( SELECT "member"."id"
   FROM "public"."member"
  WHERE (("member"."kakao_user_id" = "auth"."uid"()) OR ("member"."google_user_id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."revalidate_records"() TO "anon";
GRANT ALL ON FUNCTION "public"."revalidate_records"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."revalidate_records"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."competition" TO "anon";
GRANT ALL ON TABLE "public"."competition" TO "authenticated";
GRANT ALL ON TABLE "public"."competition" TO "service_role";



GRANT ALL ON TABLE "public"."competition_registration" TO "anon";
GRANT ALL ON TABLE "public"."competition_registration" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_registration" TO "service_role";



GRANT ALL ON TABLE "public"."member" TO "anon";
GRANT ALL ON TABLE "public"."member" TO "authenticated";
GRANT ALL ON TABLE "public"."member" TO "service_role";



GRANT ALL ON TABLE "public"."personal_best" TO "anon";
GRANT ALL ON TABLE "public"."personal_best" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_best" TO "service_role";



GRANT ALL ON TABLE "public"."race_result" TO "anon";
GRANT ALL ON TABLE "public"."race_result" TO "authenticated";
GRANT ALL ON TABLE "public"."race_result" TO "service_role";



GRANT ALL ON TABLE "public"."personal_best_view" TO "anon";
GRANT ALL ON TABLE "public"."personal_best_view" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_best_view" TO "service_role";



GRANT ALL ON TABLE "public"."utmb_profile" TO "anon";
GRANT ALL ON TABLE "public"."utmb_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."utmb_profile" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































