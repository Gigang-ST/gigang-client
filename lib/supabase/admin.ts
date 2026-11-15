import "server-only";
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

/** 변경 이력(`chg_hist`)에 남길 행위자 — 누가, 어느 팀(접속 팀) 자격으로 바꿨나 */
export type ChangeActor = { memId: string; teamId: string };

/**
 * 행위자를 실은 관리자 클라이언트. 공용·사람 단위 데이터(회원 정보·대회 기록·대회 원본·UTMB)를
 * 서버에서 고칠 땐 이걸 쓴다 — DB 트리거(`chg_hist_capture`)가 요청 헤더에서 행위자를 읽어 이력에 남긴다.
 * service_role 요청이라 auth.uid() 가 없어서, 이걸 안 쓰면 이력은 남되 "누가"가 비어 남는다.
 * 헤더 이름은 `supabase/migrations/20261109140000_chg_hist.sql` 과 같아야 한다.
 */
export function createAdminClientAs(actor: ChangeActor) {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { global: { headers: actorHeaders(actor) } },
  );
}

/** `createAdminClientAs` 가 싣는 헤더 — 테스트가 이름을 못박는다 */
export function actorHeaders(actor: ChangeActor): Record<string, string> {
  return { "x-gg-actor-mem-id": actor.memId, "x-gg-actor-team-id": actor.teamId };
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
