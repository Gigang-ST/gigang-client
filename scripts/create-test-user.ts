/**
 * 로컬 Supabase에 E2E 테스트용 계정 생성 (DB 직접 삽입)
 *
 * 사용법: pnpm tsx scripts/create-test-user.ts
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

if (!url || !anonKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL 또는 PUBLISHABLE_KEY가 없습니다.");
  process.exit(1);
}
if (!email || !password) {
  console.error("❌ E2E_TEST_EMAIL 또는 E2E_TEST_PASSWORD가 없습니다.");
  process.exit(1);
}

async function main() {
  const supabase = createClient(url!, anonKey!);

  console.log(`\n📧 테스트 계정 생성 중... (${email})\n`);

  // 먼저 로그인 시도 (이미 존재하는지 확인)
  const { error: loginErr } = await supabase.auth.signInWithPassword({
    email: email!,
    password: password!,
  });

  if (!loginErr) {
    console.log("✅ 이미 존재하는 계정입니다. 로그인 테스트 성공!\n");
    return;
  }

  // 계정이 없으면 signUp으로 생성
  const { data, error } = await supabase.auth.signUp({
    email: email!,
    password: password!,
    options: {
      data: { display_name: "E2E 테스트" },
    },
  });

  if (error) {
    console.error(`❌ signUp 실패: ${error.message}`);
    console.error("\n💡 대안: Supabase Studio에서 직접 생성");
    console.error(`   http://127.0.0.1:54323 → Authentication → Users → Add user\n`);
    process.exit(1);
  }

  if (data.user) {
    console.log("✅ 계정 생성 완료!");
    console.log(`   ID: ${data.user.id}`);
    console.log(`   Email: ${data.user.email}`);

    if (!data.user.email_confirmed_at) {
      console.log("\n📬 이메일 인증이 필요합니다.");
      console.log("   Mailpit에서 인증 메일 확인: http://127.0.0.1:54324");
      console.log("   또는 Studio에서 수동 인증: http://127.0.0.1:54323 → Users → Verify");
    } else {
      console.log("   Confirmed: Yes\n");
    }
  }
}

main().catch(console.error);
