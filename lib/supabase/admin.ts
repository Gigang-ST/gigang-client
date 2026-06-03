import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { type Database } from "@/lib/supabase/database.types";
import { env } from "@/lib/env";

/**
 * Service Role 키를 사용하는 관리자 Supabase 클라이언트.
 * 서버 액션/API 라우트에서만 사용. 절대 클라이언트에 노출하지 않을 것.
 * RLS를 우회하므로 호출 전 반드시 인증/권한 확인 필요.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * DB 타입 미생성 신규 테이블 접근용 untyped 관리자 클라이언트.
 * 마이그레이션 적용 후 supabase gen types 실행 시 createAdminClient로 교체 예정.
 */
export function createUntypedAdminClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseClient<any>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
