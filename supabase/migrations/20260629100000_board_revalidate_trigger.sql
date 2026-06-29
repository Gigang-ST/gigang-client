-- brd_post_mst 변경 시 Next.js 캐시 자동 무효화
-- 기존 revalidate_records() 함수를 재사용 (동일한 /api/revalidate 엔드포인트 호출)
CREATE OR REPLACE TRIGGER "revalidate_on_brd_post_change"
  AFTER INSERT OR DELETE OR UPDATE ON "public"."brd_post_mst"
  FOR EACH STATEMENT
  EXECUTE FUNCTION "public"."revalidate_records"();
