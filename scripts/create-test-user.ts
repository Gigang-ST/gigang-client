/**
 * 테스트용 계정 + member 레코드 생성
 *
 * 로컬: pnpm tsx scripts/create-test-user.ts
 * CI:   pnpm tsx scripts/create-test-user.ts
 *
 * 1. Supabase signUp으로 auth 유저 생성
 * 2. 이메일 인증 처리 (DB 직접)
 * 3. member 테이블에 레코드 생성 (google_user_id로 연결)
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!url || !anonKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 PUBLISHABLE_KEY가 없습니다.");
  process.exit(1);
}
if (!email || !password) {
  console.error("❌ E2E_TEST_EMAIL 또는 E2E_TEST_PASSWORD가 없습니다.");
  process.exit(1);
}

function psql(sql: string): string {
  return execSync(`psql "${DB_URL}" -t -c "${sql}"`, {
    encoding: "utf-8",
  }).trim();
}

async function main() {
  const supabase = createClient(url!, anonKey!);

  console.log(`\n📧 테스트 유저 생성 중... (${email})\n`);

  // 1. 로그인 시도 (이미 존재하는지 확인)
  const { error: loginErr } = await supabase.auth.signInWithPassword({
    email: email!,
    password: password!,
  });

  if (!loginErr) {
    console.log("✅ 이미 존재하는 계정입니다. 로그인 성공!");
    await ensureMember();
    return;
  }

  // 2. signUp으로 생성
  const { data, error } = await supabase.auth.signUp({
    email: email!,
    password: password!,
    options: { data: { display_name: "E2E 테스트" } },
  });

  if (error) {
    console.error(`❌ signUp 실패: ${error.message}`);
    process.exit(1);
  }

  console.log(`✅ 계정 생성 완료 (ID: ${data.user?.id})`);

  // 3. 이메일 인증 처리
  psql(
    `UPDATE auth.users SET email_confirmed_at = now() WHERE email = '${email}' AND email_confirmed_at IS NULL`,
  );
  console.log("✅ 이메일 인증 완료");

  // 4. member 레코드 생성
  await ensureMember();
}

async function ensureMember() {
  const userId = psql(
    `SELECT id FROM auth.users WHERE email = '${email}'`,
  );

  if (!userId) {
    console.error("❌ auth.users에서 유저를 찾을 수 없습니다.");
    process.exit(1);
  }

  // member 존재 여부 확인
  const existing = psql(`SELECT id FROM public.member WHERE id = '${userId}'`);

  if (existing) {
    console.log(`✅ member 레코드 이미 존재 (${userId})\n`);
    return;
  }

  psql(
    `INSERT INTO public.member (id, full_name, gender, birthday, phone, status, admin, joined_at, email, google_user_id) VALUES ('${userId}', 'E2E 테스트', 'male', '1990-01-01', '010-0000-0000', 'active', false, CURRENT_DATE, '${email}', '${userId}')`,
  );

  console.log(`✅ member 레코드 생성 완료 (${userId})\n`);
}

main().catch(console.error);
