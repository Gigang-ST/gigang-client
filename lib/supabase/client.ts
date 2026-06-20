import { createBrowserClient } from "@supabase/ssr";
import { type Database } from "@/lib/supabase/database.types";
import { publicSupabaseUrl, publicSupabaseKey } from "./public-env";

export function createClient() {
  return createBrowserClient<Database>(publicSupabaseUrl, publicSupabaseKey);
}
