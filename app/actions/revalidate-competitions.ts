"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function revalidateCompetitions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  revalidateTag("competitions", "max");
}
