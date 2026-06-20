const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
}

export const publicSupabaseUrl = url;
export const publicSupabaseKey = key;
